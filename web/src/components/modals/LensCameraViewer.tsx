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

/**
 * Live camera viewfinder for Payd Lens. Works with phone cameras (prefers the
 * rear camera), a MacBook's built-in FaceTime webcam, Continuity Camera and
 * USB webcams. Lists every camera so the user can switch, and falls back to
 * file upload when the camera is unsupported or denied.
 */
export function LensCameraViewer({ onCapture, onUploadClick }: LensCameraViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Bumped by every stop; a getUserMedia call that resolves after a newer stop/start
  // (or after unmount) sees a stale id and releases its stream instead of leaking it.
  const requestRef = useRef(0);
  const [state, setState] = useState<CameraState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    requestRef.current += 1;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
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
    const request = requestRef.current;
    const isStale = () => request !== requestRef.current;
    try {
      const size = { width: { ideal: 1920 }, height: { ideal: 1080 } };
      const stream = await navigator.mediaDevices.getUserMedia({
        // A specific camera if chosen; otherwise prefer the rear camera on
        // phones. Laptops have no rear camera, so `ideal` falls back to the
        // built-in webcam.
        video: requestedId
          ? { deviceId: { exact: requestedId }, ...size }
          : { facingMode: { ideal: 'environment' }, ...size },
        audio: false,
      });
      if (isStale()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setDeviceId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? requestedId ?? null);
      // Camera names are only exposed after permission is granted.
      const all = await navigator.mediaDevices.enumerateDevices();
      if (isStale()) return; // a newer stop already released this stream
      setDevices(all.filter((d) => d.kind === 'videoinput'));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setState('live');
    } catch (err) {
      if (isStale()) return; // a newer request owns the UI state now
      setState('error');
      const name = err instanceof DOMException ? err.name : '';
      setError(
        name === 'NotAllowedError'
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
  useEffect(() => stopCamera, [stopCamera]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
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
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover ${isLive ? '' : 'hidden'}`}
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
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 transition group-hover:scale-105">
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
