import { describe, expect, it } from 'vitest';
import { shouldMirrorPreview } from './LensCameraViewer';

describe('shouldMirrorPreview', () => {
  it('mirrors user-facing cameras and laptop webcams', () => {
    expect(shouldMirrorPreview('user', 'Front Camera')).toBe(true);
    expect(shouldMirrorPreview(undefined, 'FaceTime HD Camera (Built-in)')).toBe(true);
    expect(shouldMirrorPreview(undefined, 'Logitech C920 USB Webcam')).toBe(true);
    expect(shouldMirrorPreview(undefined, undefined)).toBe(true);
  });

  it('does not mirror rear cameras', () => {
    expect(shouldMirrorPreview('environment', 'Back Camera')).toBe(false);
    expect(shouldMirrorPreview(undefined, 'Back Ultra Wide Camera')).toBe(false);
    expect(shouldMirrorPreview(undefined, 'camera2 0, facing back')).toBe(false);
    expect(shouldMirrorPreview(undefined, 'Rear Camera')).toBe(false);
  });
});
