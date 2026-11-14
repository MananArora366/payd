import { NextRequest, NextResponse } from 'next/server';
import { parseReceiptImage, ReceiptScanError, MAX_RECEIPT_IMAGE_BYTES } from '@/lib/ai/receipt-server';
import { SAMPLE_UAE_RECEIPTS } from '@/lib/ai/receipt-scan';

// Base64 inflates by 4/3; allow a little JSON overhead on top of the 8 MB image cap.
const MAX_BODY_BYTES = Math.ceil((MAX_RECEIPT_IMAGE_BYTES * 4) / 3) + 64 * 1024;

function fail(error: string, status: number, code?: string) {
  return NextResponse.json({ success: false, error, code }, { status });
}

export async function POST(req: NextRequest) {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) {
    return fail('That image is too large. Please use a photo under 8 MB.', 413, 'too_large');
  }

  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return fail('That image is too large. Please use a photo under 8 MB.', 413, 'too_large');
    }
    body = JSON.parse(raw);
  } catch {
    return fail('Invalid request body.', 400, 'bad_request');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail('Invalid request body.', 400, 'bad_request');
  }
  const { image, mimeType, sample, apiKey, aiEnabled } = body as Record<string, unknown>;

  // Explicit demo presets only. Own-key check so "__proto__"/"constructor" can't match.
  if (typeof sample === 'string' && sample) {
    if (!Object.prototype.hasOwnProperty.call(SAMPLE_UAE_RECEIPTS, sample)) {
      return fail('Unknown sample receipt.', 400, 'unknown_sample');
    }
    const sampleData = {
      ...SAMPLE_UAE_RECEIPTS[sample],
      date: new Date().toISOString().split('T')[0],
    };
    return NextResponse.json({ success: true, receipt: sampleData });
  }

  if (!image || typeof image !== 'string') {
    return fail('Please attach a photo of the receipt.', 400, 'missing_image');
  }

  try {
    const receipt = await parseReceiptImage(
      image,
      typeof mimeType === 'string' ? mimeType : undefined,
      typeof apiKey === 'string' ? apiKey : undefined,
      { allowAi: aiEnabled !== false }
    );
    return NextResponse.json({ success: true, receipt });
  } catch (error: unknown) {
    if (error instanceof ReceiptScanError) {
      return fail(error.message, error.status, error.code);
    }
    console.error('Error in /api/ai/receipt-scan:', error);
    return fail("Something went wrong while reading the receipt. Please try again or enter it manually.", 500, 'internal');
  }
}
