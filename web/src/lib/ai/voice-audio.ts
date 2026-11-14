import { GoogleGenAI, Type } from '@google/genai';
import { ConverseCommand, type AudioFormat } from '@aws-sdk/client-bedrock-runtime';
import { z } from 'zod';
import { extractModelText, getBedrockClient, interpretVoiceTranscriptBedrockWithSource, isBedrockConfigured } from './bedrock';
import {
  INTENT_RESPONSE_SCHEMA,
  InterpretContext,
  VoiceIntent,
  VoiceIntentSchema,
  intentSystemInstruction,
  isGeminiConfigured,
  sanitizeIntent,
} from './gemini';

/** Bedrock speech model that writes down what was said. Voxtral Small hears names and currencies well. */
export const BEDROCK_VOICE_MODEL_ID = process.env.BEDROCK_VOICE_MODEL_ID || 'mistral.voxtral-small-24b-2507';
/** Gemini model used for voice when Bedrock is off. Flash models accept audio input. */
export const VOICE_AUDIO_MODEL = process.env.GEMINI_VOICE_MODEL || 'gemini-2.0-flash';

export type VoiceProvider = 'aws-bedrock' | 'gemini';

/** Which engine hears recordings: Bedrock when it is enabled, else Gemini, else none. */
export function voiceProvider(): VoiceProvider | null {
  if (isBedrockConfigured()) return 'aws-bedrock';
  if (isGeminiConfigured()) return 'gemini';
  return null;
}

/** Longest recording accepted, in seconds. The client stops recording at the same limit. */
export const MAX_AUDIO_SECONDS = 30;
/** 16 kHz mono 16-bit WAV is 32 KB/s; base64 adds a third. Leave headroom for the JSON around it. */
export const MAX_VOICE_BODY_BYTES = Math.ceil(MAX_AUDIO_SECONDS * 32_000 * (4 / 3)) + 64 * 1024;

export const ALLOWED_AUDIO_MIME = ['audio/wav', 'audio/x-wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/flac', 'audio/aac'];

/** Validates the base64 audio payload. Returns the cleaned base64 string and MIME type. */
export function validateAudio(
  audio: unknown,
  mimeType: unknown
): { ok: true; data: string; mimeType: string } | { ok: false; status: number; error: string } {
  if (typeof audio !== 'string' || audio.length < 100) {
    return { ok: false, status: 400, error: 'Missing audio' };
  }
  const mime = typeof mimeType === 'string' ? mimeType.split(';')[0].trim().toLowerCase() : '';
  if (!ALLOWED_AUDIO_MIME.includes(mime)) {
    return { ok: false, status: 415, error: 'Unsupported audio format' };
  }
  const data = audio.replace(/^data:[^,]*,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    return { ok: false, status: 400, error: 'Audio must be base64' };
  }
  return { ok: true, data, mimeType: mime };
}

const BEDROCK_AUDIO_FORMAT: Record<string, AudioFormat> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp3': 'mp3',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/aac': 'aac',
};

/** Strips quotes and labels speech models sometimes wrap around a transcript. */
export function cleanTranscript(raw: string): string {
  let t = raw.trim().replace(/^(transcript|transcription)\s*:\s*/i, '');
  if (/^["'“].*["'”]$/s.test(t)) t = t.slice(1, -1);
  t = t.trim();
  return /^\[?(no speech|silence|inaudible)\]?\.?$/i.test(t) ? '' : t;
}

/** Writes down what was said, using a Bedrock speech model. Names from the user's circle help spelling. */
export async function transcribeAudioBedrock(audioBase64: string, mimeType: string, ctx: InterpretContext): Promise<string> {
  const format = BEDROCK_AUDIO_FORMAT[mimeType];
  if (!format) throw new Error(`Unsupported audio format for Bedrock: ${mimeType}`);
  const names = [...ctx.knownMembers.map((m) => m.name), ...ctx.groups.map((g) => g.name)].join(', ');
  const response = await getBedrockClient().send(
    new ConverseCommand({
      modelId: BEDROCK_VOICE_MODEL_ID,
      messages: [
        {
          role: 'user',
          content: [
            { audio: { format, source: { bytes: Buffer.from(audioBase64, 'base64') } } },
            {
              text: `Transcribe this recording exactly, in the language spoken. Reply with the transcript only.
Amounts are usually in AED (dirhams). Names that may come up: ${names || 'none'}. If nobody speaks, reply with an empty string.`,
            },
          ],
        },
      ],
      inferenceConfig: { maxTokens: 400, temperature: 0 },
    })
  );
  return cleanTranscript(extractModelText(response.output?.message?.content) || '');
}

const AudioResultSchema = VoiceIntentSchema.extend({ transcript: z.string() });

/** Models may leave out nullable fields or overshoot confidence; fill and clamp before strict parsing. */
export function normalizeModelOutput(raw: unknown): Record<string, unknown> {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  for (const key of ['amount', 'currency', 'category', 'payer', 'split_method', 'group_name', 'notes', 'clarification_question']) {
    if (o[key] === undefined) o[key] = null;
  }
  if (!Array.isArray(o.participants)) o.participants = [];
  if (!Array.isArray(o.missing_fields)) o.missing_fields = [];
  if (typeof o.transcript !== 'string') o.transcript = '';
  const c = typeof o.confidence === 'number' && Number.isFinite(o.confidence) ? o.confidence : 0.5;
  o.confidence = Math.min(1, Math.max(0, c));
  return o;
}

/**
 * Hears a recording and returns what was said plus the filled-in intent. Bedrock: Voxtral writes it
 * down, then Claude extracts the fields exactly like a typed request. Gemini: one call does both.
 * Returns null when no voice engine is configured, so the caller can fall back to browser speech.
 */
export async function interpretVoiceAudio(
  audioBase64: string,
  mimeType: string,
  ctx: InterpretContext
): Promise<{ transcript: string; intent: VoiceIntent | null; provider: VoiceProvider; model: string } | null> {
  const provider = voiceProvider();
  if (provider === 'aws-bedrock') {
    const transcript = await transcribeAudioBedrock(audioBase64, mimeType, ctx);
    if (!transcript) return { transcript, intent: null, provider, model: BEDROCK_VOICE_MODEL_ID };
    const { intent } = await interpretVoiceTranscriptBedrockWithSource(transcript, ctx);
    return { transcript, intent, provider, model: BEDROCK_VOICE_MODEL_ID };
  }
  if (provider === 'gemini') {
    const r = await interpretVoiceAudioGemini(audioBase64, mimeType, ctx);
    return r && { ...r, intent: r.transcript ? r.intent : null, provider, model: VOICE_AUDIO_MODEL };
  }
  return null;
}

/**
 * Hears a recording and turns it into a VoiceIntent in one call: Gemini writes down what was said,
 * then extracts the same fields as the text parser. Like the text parser, it never writes to the DB.
 * Returns null when Gemini is not configured, so the caller can fall back to browser speech.
 */
export async function interpretVoiceAudioGemini(
  audioBase64: string,
  mimeType: string,
  ctx: InterpretContext
): Promise<{ transcript: string; intent: VoiceIntent } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!isGeminiConfigured() || !apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = `${intentSystemInstruction(ctx)}
You receive a voice recording instead of text. First write down exactly what the speaker said in "transcript",
in the language they used, spelling names as they appear in the known contacts and groups when they match.
Then fill the other fields from that transcript. If the recording has no speech, return an empty transcript,
intent "query", confidence 0 and missing_fields ["speech"].`;

  const response = await ai.models.generateContent({
    model: VOICE_AUDIO_MODEL,
    contents: [
      {
        role: 'user',
        parts: [{ inlineData: { mimeType, data: audioBase64 } }, { text: 'Transcribe this recording and extract the intent.' }],
      },
    ],
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        ...INTENT_RESPONSE_SCHEMA,
        properties: { transcript: { type: Type.STRING }, ...INTENT_RESPONSE_SCHEMA.properties },
        required: ['transcript', ...INTENT_RESPONSE_SCHEMA.required],
      },
    },
  });

  const parsed = AudioResultSchema.parse(normalizeModelOutput(JSON.parse(response.text || '{}')));
  const { transcript, ...intent } = parsed;
  return { transcript: transcript.trim(), intent: sanitizeIntent(intent, ctx, transcript) };
}
