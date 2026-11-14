'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Upload, AlertCircle, RefreshCw, SwitchCamera } from 'lucide-react';

interface LensCameraViewerProps {
  /** Called with a JPEG data URL of the captured frame. */
  onCapture: (dataUrl: string) => void;
  /** Opens the parent's hidden file input. */
  onUploadClick: () => void;
}

type CameraState = 'idle' | 'starting' | 'live' | 'error';

const CAMERA_START_TIMEOUT_MS = 10_000;

class CameraTimeoutError extends Error {}

/**
 * Whether the live preview should be mirrored, like FaceTime or Zoom. Front
 * cameras and laptop webcams face the user, so an unmirrored preview feels
 * backwards. Rear cameras are not mirrored. Laptop webcams usually report no
 * facingMode, so anything not known to be rear-facing is mirrored.
 */
export function shouldMirrorPreview(facingMode: string | undefined, label: string | undefined): boolean {
  if (facingMode === 'environment') return false;
  if (facingMode === 'user') return true;
  return !/\b(back|rear|environment)\b/i.test(label ?? '');
}

/**
 * Live camera viewfinder for Payd Lens. Works with phone cameras (prefers the
 * rear camera), a MacBook's built-in FaceTime webcam, Continuity Camera and
 * USB webcams. Lists every camera so the user can switch, and falls back to
 * file upload when the camera is unsupported or denied.
 */
export function LensCameraViewer({ onCapture, onUploadClick }: LensCameraViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [mirrored, setMirrored] = useState(false);
  // Incremented on every start/stop/unmount; a getUserMedia call that resolves
  // after its attempt was superseded must release its stream immediately.
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);

  const stopCamera = useCallback(() => {
    attemptRef.current += 1;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async (requestedId?: string | null) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState('error');
      setError('Camera not supported in this browser. Upload a photo instead.');
      return;
    }
    setState('starting');
    setError(null);
    stopCamera();
    const attempt = attemptRef.current;
    const isStale = () => !mountedRef.current || attempt !== attemptRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const size = { width: { ideal: 1920 }, height: { ideal: 1080 } };
      const request = navigator.mediaDevices.getUserMedia({
        // A specific camera if chosen; otherwise prefer the rear camera on
        // phones. Laptops have no rear camera, so `ideal` falls back to the
        // built-in webcam.
        video: requestedId
          ? { deviceId: { exact: requestedId }, ...size }
          : { facingMode: { ideal: 'environment' }, ...size },
        audio: false,
      });
      // If the user closes the viewer or we time out, stop the stream whenever it arrives.
      request
        .then((late) => {
          if (isStale()) late.getTracks().forEach((t) => t.stop());
        })
        .catch(() => {});
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CameraTimeoutError()), CAMERA_START_TIMEOUT_MS);
      });
      const stream = await Promise.race([request, timeout]);
      clearTimeout(timer);
      if (isStale()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      setDeviceId(track?.getSettings().deviceId ?? requestedId ?? null);
      setMirrored(shouldMirrorPreview(track?.getSettings().facingMode, track?.label));
      // Camera names are only exposed after permission is granted.
      const all = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
      if (isStale()) return;
      setDevices(all.filter((d) => d.kind === 'videoinput'));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      if (isStale()) return;
      setState('live');
    } catch (err) {
      clearTimeout(timer);
      if (isStale()) return;
      if (err instanceof CameraTimeoutError) {
        // Invalidate this attempt so a late stream is stopped on arrival.
        attemptRef.current += 1;
      }
      setState('error');
      const name = err instanceof DOMException ? err.name : '';
      setError(
        err instanceof CameraTimeoutError
          ? 'The camera is taking too long to start. Check the permission prompt, or upload a photo instead.'
          : name === 'NotAllowedError'
          ? 'Camera permission denied. Allow access or upload a photo instead.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'No camera found. Upload a photo instead.'
            : name === 'NotReadableError'
              ? 'Camera is in use by another app (e.g. Zoom or FaceTime). Close it and try again.'
              : !window.isSecureContext
                ? 'Camera needs HTTPS or localhost. Open the secure link or upload a photo.'
                : 'Could not start the camera. Upload a photo instead.'
      );
    }
  }, [stopCamera]);

  // Release the camera when the viewer unmounts (modal closed or image chosen).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Capture the raw frame, never the mirrored preview, so receipt text reads
    // the right way round for OCR.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    stopCamera();
    setState('idle');
    onCapture(dataUrl);
  };

  const isLive = state === 'live';

  const switchToNext = () => {
    if (devices.length < 2) return;
    const i = devices.findIndex((d) => d.deviceId === deviceId);
    startCamera(devices[(i + 1) % devices.length].deviceId);
  };

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover ${mirrored ? '-scale-x-100' : ''} ${isLive ? '' : 'hidden'}`}
        />

        {isLive && devices.length > 1 && (
          <div className="absolute left-3 right-3 top-3 z-10 flex items-center gap-2">
            <select
              aria-label="Camera"
              value={deviceId ?? ''}
              onChange={(e) => startCamera(e.target.value)}
              className="min-w-0 flex-1 truncate rounded-xl bg-black/60 px-3 py-2 text-xs text-white backdrop-blur focus:outline-none"
            >
              {devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={switchToNext}
              aria-label="Switch camera"
              className="rounded-xl bg-black/60 p-2 text-white backdrop-blur hover:bg-black/75"
            >
              <SwitchCamera className="h-4 w-4" />
            </button>
          </div>
        )}

        {isLive && (
          <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
        )}

        {!isLive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            {state === 'error' ? (
              <>
                <AlertCircle className="h-8 w-8 text-amber-500" />
                <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs">{error}</p>
                <button
                  type="button"
                  onClick={() => startCamera(deviceId)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => startCamera(deviceId)}
                disabled={state === 'starting'}
                className="group flex flex-col items-center gap-3 disabled:opacity-60"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 transition">
                  <Camera className="h-8 w-8" />
                </div>
                <span className="text-sm font-bold">
                  {state === 'starting' ? 'Starting camera…' : 'Open Payd Lens Camera'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        {isLive && (
          <button
            type="button"
            onClick={capture}
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition"
          >
            <Camera className="h-4 w-4" /> Capture Receipt
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            stopCamera();
            setState('idle');
            onUploadClick();
          }}
          className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition"
        >
          <Upload className="h-4 w-4" /> Upload Photo
        </button>
      </div>
    </div>
  );
}
