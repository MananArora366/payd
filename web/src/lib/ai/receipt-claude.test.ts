import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readReceiptWithClaude = vi.fn();
const runLocalOcrDetailed = vi.fn();
vi.mock('./receipt-claude', () => ({ readReceiptWithClaude: (...a: unknown[]) => readReceiptWithClaude(...a) }));
vi.mock('./local-ocr', () => ({ runLocalOcrDetailed: (...a: unknown[]) => runLocalOcrDetailed(...a) }));

import { finalizeVisionReceipt, parseReceiptImage } from './receipt-server';

// Smallest valid JPEG header bytes are enough for the MIME sniffer.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]).toString('base64');

const claudeReceipt = {
  merchant_name: 'Al Safadi',
  date: '2026-11-12',
  trn: '100282231000003',
  subtotal_minor: 10000,
  vat_minor: 500,
  total_minor: 10500,
  category: 'Food and dining',
  line_items: [
    { name: 'Mixed Grill', quantity: 1, price_minor: 7000 },
    { name: 'Hummus', quantity: 2, price_minor: 3000 },
  ],
  confidence: 0.92,
  notes: null,
};

describe('Payd Lens with Claude vision', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', '');
    readReceiptWithClaude.mockReset();
    runLocalOcrDetailed.mockReset();
    runLocalOcrDetailed.mockResolvedValue({ status: 'ok', lines: ['TOTAL 12.00'] });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('uses Claude when Bedrock is enabled and its totals reconcile', async () => {
    vi.stubEnv('BEDROCK_ENABLED', 'true');
    readReceiptWithClaude.mockResolvedValue(claudeReceipt);
    const r = await parseReceiptImage(JPEG, 'image/jpeg');
    expect(r.engine).toBe('claude_bedrock_vision');
    expect(r.total_minor).toBe(10500);
    expect(r.line_items).toHaveLength(2);
    expect(r.warnings ?? []).toHaveLength(0);
    expect(runLocalOcrDetailed).not.toHaveBeenCalled();
  });

  it('never calls Claude unless BEDROCK_ENABLED is true', async () => {
    vi.stubEnv('BEDROCK_ENABLED', '');
    const r = await parseReceiptImage(JPEG, 'image/jpeg');
    expect(readReceiptWithClaude).not.toHaveBeenCalled();
    expect(r.engine).not.toBe('claude_bedrock_vision');
  });

  it("respects the user's AI toggle even when the server has Bedrock enabled", async () => {
    vi.stubEnv('BEDROCK_ENABLED', 'true');
    vi.stubEnv('GEMINI_API_KEY', 'real-looking-key');
    const r = await parseReceiptImage(JPEG, 'image/jpeg', 'client-key', { allowAi: false });
    expect(readReceiptWithClaude).not.toHaveBeenCalled();
    expect(runLocalOcrDetailed).toHaveBeenCalledTimes(1);
    expect(r.engine).not.toBe('claude_bedrock_vision');
  });

  it('falls back to local OCR when Claude errors or reads no receipt', async () => {
    vi.stubEnv('BEDROCK_ENABLED', 'true');
    readReceiptWithClaude.mockRejectedValueOnce(new Error('throttled'));
    expect((await parseReceiptImage(JPEG, 'image/jpeg')).engine).not.toBe('claude_bedrock_vision');
    readReceiptWithClaude.mockResolvedValueOnce({ ...claudeReceipt, total_minor: 0, line_items: [] });
    expect((await parseReceiptImage(JPEG, 'image/jpeg')).engine).not.toBe('claude_bedrock_vision');
    expect(runLocalOcrDetailed).toHaveBeenCalledTimes(2);
  });
});

describe('finalizeVisionReceipt', () => {
  it('flags totals that do not add up instead of trusting them', () => {
    const r = finalizeVisionReceipt({ ...claudeReceipt, total_minor: 99999 }, 'claude_bedrock_vision', 0.9)!;
    expect(r.warnings?.length).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThan(0.9);
  });

  it('cleans up loose model output', () => {
    const r = finalizeVisionReceipt(
      { merchant_name: 'X', total_minor: '2100', line_items: [{ name: '  ', quantity: 0, price_minor: 2000.4 }, null], vat_minor: -5 },
      'claude_bedrock_vision',
      0.9
    )!;
    expect(r.total_minor).toBe(2100);
    expect(r.vat_minor).toBe(0);
    expect(r.line_items).toEqual([{ name: 'Item', quantity: 1, price_minor: 2000 }]);
  });

  it('returns null when no total was read', () => {
    expect(finalizeVisionReceipt({ total_minor: 0 }, 'claude_bedrock_vision', 0.9)).toBeNull();
  });
});
