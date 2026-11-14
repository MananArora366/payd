import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const generateContent = vi.fn();
vi.mock('@google/genai', async (orig) => {
  const actual = await orig<typeof import('@google/genai')>();
  return { ...actual, GoogleGenAI: vi.fn(() => ({ models: { generateContent } })) };
});

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { validateAudio, cleanTranscript, MAX_VOICE_BODY_BYTES } from './voice-audio';
import { encodeWav } from '@/lib/voice/recorder';
import { GET as voiceGET, POST as voicePOST } from '@/app/api/ai/voice/route';

const AUDIO = 'UklGR'.padEnd(400, 'A');

function post(body: unknown) {
  return voicePOST(
    new Request('http://localhost/api/ai/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as any
  );
}

describe('validateAudio', () => {
  it('accepts base64 WAV and strips a data URL prefix', () => {
    const r = validateAudio(`data:audio/wav;base64,${AUDIO}`, 'audio/wav');
    expect(r).toEqual({ ok: true, data: AUDIO, mimeType: 'audio/wav' });
  });
  it('rejects missing, non-base64 and unsupported audio', () => {
    expect(validateAudio(undefined, 'audio/wav')).toMatchObject({ ok: false, status: 400 });
    expect(validateAudio('not base64!'.repeat(20), 'audio/wav')).toMatchObject({ ok: false, status: 400 });
    expect(validateAudio(AUDIO, 'video/mp4')).toMatchObject({ ok: false, status: 415 });
  });
  it('allows 30 seconds of 16 kHz WAV through the body limit', () => {
    const thirtySecondsBase64 = Math.ceil((30 * 32_000 * 4) / 3);
    expect(MAX_VOICE_BODY_BYTES).toBeGreaterThan(thirtySecondsBase64);
  });
});

describe('encodeWav', () => {
  it('writes a 16-bit mono PCM header and clamps samples', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2]), 16_000);
    const view = new DataView(wav.buffer);
    const tag = (o: number) => String.fromCharCode(...wav.subarray(o, o + 4));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(40, true)).toBe(8); // 4 samples × 2 bytes
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x8000);
    expect(view.getInt16(50, true)).toBe(0x7fff); // 2 clamps to 1
  });
});

describe('cleanTranscript', () => {
  it('strips quotes, labels and no-speech markers', () => {
    expect(cleanTranscript('"Paid 120 dirhams."')).toBe('Paid 120 dirhams.');
    expect(cleanTranscript('Transcript: paid 50')).toBe('paid 50');
    expect(cleanTranscript('[no speech]')).toBe('');
    expect(cleanTranscript('  ')).toBe('');
  });
});

describe('/api/ai/voice', () => {
  const saved = { gemini: process.env.GEMINI_API_KEY, bedrock: process.env.BEDROCK_ENABLED };
  beforeEach(() => {
    generateContent.mockReset();
    process.env.BEDROCK_ENABLED = 'false';
  });
  afterEach(() => {
    process.env.GEMINI_API_KEY = saved.gemini;
    process.env.BEDROCK_ENABLED = saved.bedrock;
    vi.restoreAllMocks();
  });

  it('with Bedrock on, Voxtral writes it down and Claude fills the fields', async () => {
    process.env.BEDROCK_ENABLED = 'true';
    process.env.GEMINI_API_KEY = '';
    const send = vi.spyOn(BedrockRuntimeClient.prototype, 'send').mockImplementation(async (cmd: any) => {
      const content = cmd.input.messages[0].content;
      if (content[0].audio) {
        return { output: { message: { content: [{ text: '"Paid 120 dirhams for dinner with Aisha, split equally."' }] } } };
      }
      return {
        output: {
          message: {
            content: [
              {
                text: JSON.stringify({
                  intent: 'split_expense', amount: 120, currency: 'AED', category: 'Food and dining', payer: 'Prakarsh Thakur',
                  participants: ['Aisha Rahman'], split_method: 'equal', group_name: null, notes: 'Dinner',
                  confidence: 0.9, missing_fields: [], clarification_question: null,
                }),
              },
            ],
          },
        },
      };
    });
    const res = await post({ audio: AUDIO, mimeType: 'audio/wav' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ provider: 'aws-bedrock', model: 'mistral.voxtral-small-24b-2507' });
    expect(data.transcript).toBe('Paid 120 dirhams for dinner with Aisha, split equally.');
    expect(data.intent).toMatchObject({ intent: 'split_expense', amount: 120, participants: ['Aisha Rahman'] });

    const [hear, parse] = send.mock.calls.map((c: any) => c[0].input);
    expect(hear.modelId).toBe('mistral.voxtral-small-24b-2507');
    expect(hear.messages[0].content[0].audio.format).toBe('wav');
    expect(hear.messages[0].content[1].text).toContain('Aisha Rahman');
    expect(parse.messages[0].content[0].text).toContain('Paid 120 dirhams');
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('with Bedrock on, a silent recording is 422 no_speech and Claude is not called', async () => {
    process.env.BEDROCK_ENABLED = 'true';
    const send = vi
      .spyOn(BedrockRuntimeClient.prototype, 'send')
      .mockImplementation(async () => ({ output: { message: { content: [{ text: '' }] } } }) as any);
    const res = await post({ audio: AUDIO, mimeType: 'audio/wav' });
    expect(res.status).toBe(422);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('GET reports whether AI speech is configured', async () => {
    process.env.GEMINI_API_KEY = '';
    expect(await (await voiceGET()).json()).toMatchObject({ available: false, maxSeconds: 30 });
    process.env.GEMINI_API_KEY = 'test-key';
    expect(await (await voiceGET()).json()).toMatchObject({ available: true });
    process.env.GEMINI_API_KEY = '';
    process.env.BEDROCK_ENABLED = 'true';
    expect(await (await voiceGET()).json()).toMatchObject({ available: true });
  });

  it('answers 503 speech_unavailable without a key, so the client falls back', async () => {
    process.env.GEMINI_API_KEY = '';
    const res = await post({ audio: AUDIO, mimeType: 'audio/wav' });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'speech_unavailable' });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('answers 503 when the user turned AI off, without sending audio anywhere', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const res = await post({ audio: AUDIO, mimeType: 'audio/wav', aiEnabled: false });
    expect(res.status).toBe(503);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('returns the transcript and a sanitized intent from one Gemini call', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        transcript: 'Paid 120 dirhams for dinner with Aisha, split equally',
        intent: 'split_expense',
        amount: 120.004,
        currency: 'AED',
        category: 'food and dining',
        payer: 'me',
        participants: ['Aisha Rahman'],
        split_method: 'equal',
        group_name: null,
        notes: 'Dinner',
        confidence: 1.4,
        missing_fields: [],
      }),
    });
    const res = await post({ audio: AUDIO, mimeType: 'audio/wav' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.transcript).toBe('Paid 120 dirhams for dinner with Aisha, split equally');
    expect(data.intent).toMatchObject({ intent: 'split_expense', amount: 120, category: 'Food and dining', confidence: 1 });
    expect(data.intent).not.toHaveProperty('transcript');

    const call = generateContent.mock.calls[0][0];
    expect(call.contents[0].parts[0]).toEqual({ inlineData: { mimeType: 'audio/wav', data: AUDIO } });
    expect(call.config.responseSchema.required).toContain('transcript');
  });

  it('answers 422 no_speech when the recording is silent', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    generateContent.mockResolvedValue({
      text: JSON.stringify({ transcript: '', intent: 'query', participants: [], confidence: 0, missing_fields: ['speech'] }),
    });
    const res = await post({ audio: AUDIO, mimeType: 'audio/wav' });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'no_speech' });
  });

  it('answers 500 with a friendly message when Gemini returns unusable output', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    generateContent.mockResolvedValue({ text: 'Sorry, I could not process that audio.' });
    const logged: unknown[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => logged.push(args);
    try {
      const res = await post({ audio: AUDIO, mimeType: 'audio/wav' });
      expect(res.status).toBe(500);
      expect((await res.json()).error).toMatch(/try again/);
      expect(logged).toHaveLength(1);
    } finally {
      console.error = origError;
    }
  });
});
