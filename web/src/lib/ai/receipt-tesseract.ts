import path from 'node:path';
import { access } from 'node:fs/promises';
import sharp from 'sharp';
import { createWorker, OEM } from 'tesseract.js';

export async function readReceiptTextWithTesseract(image: Buffer): Promise<string[]> {
  const normalized = await sharp(image, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 1800, height: 3000, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .grayscale()
    .png()
    .toBuffer();
  const englishData: { langPath: string } = require('@tesseract.js-data/eng');
  const langPath = path.resolve(englishData.langPath, '../4.0.0_best_int');
  await access(path.join(langPath, 'eng.traineddata.gz'));
  const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath, cacheMethod: 'none' });
  try {
    const { data } = await worker.recognize(normalized);
    return data.text.split(/\r?\n/);
  } finally {
    await worker.terminate();
  }
}
