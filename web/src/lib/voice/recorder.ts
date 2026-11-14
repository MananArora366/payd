// Records the microphone for AI speech recognition. Stops by itself after the speaker pauses,
// then hands back the recording as 16 kHz mono 16-bit WAV, which every browser can produce and
// every speech model accepts (Chrome's default WebM/Opus is not supported everywhere).

export const TARGET_SAMPLE_RATE = 16_000;

export interface RecorderOptions {
  /** Hard limit; the server rejects longer audio. */
  maxSeconds: number;
  /** Stop after this much quiet once speech has started. */
  silenceMs?: number;
  /** Give up if nobody speaks for this long. */
  noSpeechMs?: number;
  /** Called with the input level (0..1) about 20 times a second, for a live meter. */
  onLevel?: (level: number) => void;
  /** Called when the recorder stops by itself (pause, time limit or no speech). */
  onAutoStop?: (reason: 'silence' | 'max' | 'no_speech') => void;
}

export interface Recording {
  /** Stop and get the WAV (base64, no data: prefix). Null when nothing usable was heard. */
  stop: () => Promise<{ base64: string; mimeType: 'audio/wav'; seconds: number } | null>;
  /** Stop and throw the audio away. */
  cancel: () => void;
}

/** True when this browser can record audio for AI speech recognition. */
export function canRecordAudio(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof (window.AudioContext || (window as any).webkitAudioContext) !== 'undefined'
  );
}

/** Level above which a frame counts as speech (RMS of a -1..1 signal). */
const SPEECH_RMS = 0.02;

export async function startRecording(opts: RecorderOptions): Promise<Recording> {
  const { maxSeconds, silenceMs = 1600, noSpeechMs = 8000, onLevel, onAutoStop } = opts;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const meterCtx = new AC();
  const analyser = meterCtx.createAnalyser();
  analyser.fftSize = 1024;
  meterCtx.createMediaStreamSource(stream).connect(analyser);
  const frame = new Float32Array(analyser.fftSize);

  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start(250);

  const startedAt = performance.now();
  let heardSpeech = false;
  let lastSpeechAt = startedAt;
  let finished = false;

  const release = () => {
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    meterCtx.close().catch(() => {});
  };

  const autoStop = (reason: 'silence' | 'max' | 'no_speech') => {
    if (finished) return;
    clearInterval(timer);
    onAutoStop?.(reason);
  };

  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(frame);
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length);
    onLevel?.(Math.min(1, rms * 8));

    const now = performance.now();
    if (rms > SPEECH_RMS) {
      heardSpeech = true;
      lastSpeechAt = now;
    }
    if (now - startedAt > maxSeconds * 1000) autoStop('max');
    else if (heardSpeech && now - lastSpeechAt > silenceMs) autoStop('silence');
    else if (!heardSpeech && now - startedAt > noSpeechMs) autoStop('no_speech');
  }, 50);

  const halt = async () => {
    finished = true;
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    release();
  };

  return {
    async stop() {
      if (finished) return null;
      await halt();
      if (!heardSpeech || chunks.length === 0) return null;
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      const pcm = await decodeToMono16k(await blob.arrayBuffer());
      const seconds = pcm.length / TARGET_SAMPLE_RATE;
      if (seconds < 0.3) return null;
      return { base64: bytesToBase64(encodeWav(pcm, TARGET_SAMPLE_RATE)), mimeType: 'audio/wav', seconds };
    },
    cancel() {
      if (finished) return;
      halt().catch(() => {});
    },
  };
}

/** Decodes any browser recording and resamples it to 16 kHz mono. */
async function decodeToMono16k(encoded: ArrayBuffer): Promise<Float32Array> {
  const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  try {
    const decoded = await ctx.decodeAudioData(encoded);
    const length = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
    const offline = new OfflineAudioContext(1, Math.max(1, length), TARGET_SAMPLE_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination); // down-mixes to mono
    src.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    ctx.close().catch(() => {});
  }
}

/** 16-bit PCM WAV. Exported for tests. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}
