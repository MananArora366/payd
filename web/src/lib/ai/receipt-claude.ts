import { ConverseCommand, type ImageFormat } from '@aws-sdk/client-bedrock-runtime';
import { BEDROCK_MODEL_ID, extractJsonObject, extractModelText, getBedrockClient } from './bedrock';

/** Bedrock Converse rejects images over 3.75 MB. */
const CONVERSE_MAX_IMAGE_BYTES = 3.75 * 1024 * 1024;
/** Long edge sent to Claude. Large enough to keep small print legible, small enough to stay well under the cap. */
const MAX_EDGE_PX = 2048;

export const CLAUDE_RECEIPT_SYSTEM_PROMPT = `You are Payd Lens, a receipt reader for a UAE expense-splitting app.
Read the receipt in the photo and return its contents as JSON.

Photos come from phones and webcams, so they are often slightly blurred, out of focus, low-light, angled, crumpled or rotated. Read them anyway:
- Orient the text in its natural reading direction before reading.
- When a character is unclear, use the receipt's own structure to decide: quantity x unit price = line total, line items add up to the subtotal, subtotal + VAT (+ service charge) = total, and UAE VAT is 5%.
- Only report values you can actually see. If a value is too blurred to read even with that context, leave it out (or use null) and say which part was unreadable in "notes". Never invent items or amounts.

Money: the ledger is AED only. Write every amount as an integer number of fils (1 AED = 100 fils), e.g. 29.55 -> 2955, 3.00 -> 300, 1,250.50 -> 125050.

Return only a JSON object, no prose, with this shape:
{
  "merchant_name": string,
  "date": string | null,            // as printed, or YYYY-MM-DD
  "trn": string | null,             // UAE Tax Registration Number, 15 digits
  "subtotal_minor": integer,        // 0 if not printed
  "vat_minor": integer,             // 0 if not printed
  "charges_minor": integer,         // service charge / tips minus discounts, 0 if none
  "total_minor": integer,           // grand total; 0 if this is not a readable receipt
  "category": string,               // e.g. "Food and dining", "Groceries", "Transportation", "Shopping"
  "line_items": [{ "name": string, "quantity": integer, "price_minor": integer }],  // price_minor is the line total
  "confidence": number,             // 0-1, how sure you are of the totals
  "notes": string | null
}
If the image is not a receipt or is unreadable, return total_minor 0, an empty line_items array and confidence 0.`;

/**
 * Normalises the upload for Claude: applies EXIF orientation, converts HEIC/TIFF/BMP
 * to JPEG, and caps the long edge so the request stays under the Converse image limit.
 * Returns null when the image can't be prepared (Claude is then skipped).
 */
async function prepareImage(bytes: Buffer, mimeType: string): Promise<{ format: ImageFormat; bytes: Uint8Array } | null> {
  try {
    const sharp = (await import('sharp')).default;
    const out = await sharp(bytes, { failOn: 'none' })
      .rotate()
      .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    if (out.length <= CONVERSE_MAX_IMAGE_BYTES) return { format: 'jpeg', bytes: out };
  } catch (err) {
    console.warn('[Payd Lens] Could not normalise image for Claude; trying the original bytes.', err);
  }
  const direct: Record<string, ImageFormat> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  const format = direct[mimeType];
  return format && bytes.length <= CONVERSE_MAX_IMAGE_BYTES ? { format, bytes } : null;
}

/**
 * Reads a receipt photo with Claude vision on AWS Bedrock. Returns the raw parsed
 * JSON object (validated by the caller), or null if Claude found no readable receipt.
 * Throws on transport/API errors so the caller can fall back.
 */
export async function readReceiptWithClaude(bytes: Buffer, mimeType: string): Promise<Record<string, unknown> | null> {
  const image = await prepareImage(bytes, mimeType);
  if (!image) return null;

  const response = await getBedrockClient().send(
    new ConverseCommand({
      modelId: BEDROCK_MODEL_ID,
      system: [{ text: CLAUDE_RECEIPT_SYSTEM_PROMPT }],
      messages: [
        {
          role: 'user',
          content: [
            { image: { format: image.format, source: { bytes: image.bytes } } },
            { text: 'Read this receipt and return the JSON object.' },
          ],
        },
      ],
      // The model reasons before answering; leave room so the JSON is never cut off.
      inferenceConfig: { maxTokens: 16000 },
    })
  );

  if (response.stopReason && response.stopReason !== 'end_turn') {
    console.warn(`[Payd Lens] Claude stopped with "${response.stopReason}"; falling back.`);
    return null;
  }
  const text = extractModelText(response.output?.message?.content);
  const parsed = text ? extractJsonObject(text) : null;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
}
