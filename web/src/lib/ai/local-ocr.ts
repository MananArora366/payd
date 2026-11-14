import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

export interface LocalOcrLine {
  text: string;
}

export interface LocalOcrResult {
  /** 'unavailable' = no OCR binary on this host (e.g. not macOS); 'failed' = binary errored. */
  status: 'ok' | 'unavailable' | 'failed';
  lines: string[];
}

/**
 * Runs local Apple Vision OCR on macOS via the compiled Swift binary.
 * Takes a base64 string or image buffer, saves temporarily, runs OCR, and returns lines.
 */
export async function runLocalOcr(imageBase64: string): Promise<string[]> {
  return (await runLocalOcrDetailed(imageBase64)).lines;
}

export async function runLocalOcrDetailed(imageBase64: string): Promise<LocalOcrResult> {
  const binaryPath = path.resolve(process.cwd(), 'bin/payd-ocr');
  const sourcePath = path.resolve(process.cwd(), 'scripts/ocr.swift');
  
  // Auto-compile binary if missing on macOS
  if (!fs.existsSync(binaryPath) && fs.existsSync(sourcePath)) {
    try {
      fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
      await execFileAsync('swiftc', ['-O', sourcePath, '-o', binaryPath]);
    } catch (compileErr) {
      console.warn('Auto-compilation of payd-ocr failed:', compileErr);
    }
  }

  if (!fs.existsSync(binaryPath)) {
    return { status: 'unavailable', lines: [] };
  }

  const cleanBase64 = imageBase64.replace(/^data:[^,]*;base64,/, '');
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `payd_scan_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);

  try {
    const buffer = Buffer.from(cleanBase64, 'base64');
    fs.writeFileSync(tempFilePath, buffer);

    // Downscale if image is huge (> 1.5MB) using sips for speed
    if (buffer.length > 1024 * 1024) {
      try {
        await execFileAsync('sips', ['-Z', '1400', tempFilePath, '--out', tempFilePath]);
      } catch (e) {
        // ignore downscale error
      }
    }

    const { stdout } = await execFileAsync(binaryPath, [tempFilePath], { timeout: 15000 });
    const parsed = JSON.parse(stdout || '{}');
    const lines = Array.isArray(parsed.lines)
      ? parsed.lines.filter((l: unknown): l is string => typeof l === 'string')
      : [];
    return { status: 'ok', lines };
  } catch (err) {
    console.warn('Local OCR execution failed:', err);
    return { status: 'failed', lines: [] };
  } finally {
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (_) {}
  }
}
