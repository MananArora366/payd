import { NextRequest, NextResponse } from 'next/server';
import { aiAllowedByUser, readJsonBody, validateInterpretContext } from '@/lib/ai/request';
import {
  MAX_AUDIO_SECONDS,
  MAX_VOICE_BODY_BYTES,
  interpretVoiceAudio,
  validateAudio,
  voiceProvider,
} from '@/lib/ai/voice-audio';

// Hears a recording and returns { transcript, intent }. When AI speech is unavailable (Bedrock off and
// no Gemini key, or the user turned AI off) it answers 503 with code "speech_unavailable" so the client can fall
// back to the browser's own speech recognition.
/** Tells the client whether AI speech is available, so it can pick a recognizer before recording. */
export async function GET() {
  return NextResponse.json(
    { available: voiceProvider() !== null, maxSeconds: MAX_AUDIO_SECONDS },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const read = await readJsonBody(req, MAX_VOICE_BODY_BYTES);
    if (!read.ok) return NextResponse.json({ success: false, error: read.error }, { status: read.status });

    if (!aiAllowedByUser(read.body)) {
      return NextResponse.json({ success: false, code: 'speech_unavailable', error: 'AI is turned off' }, { status: 503 });
    }

    const audio = validateAudio(read.body.audio, read.body.mimeType);
    if (!audio.ok) return NextResponse.json({ success: false, error: audio.error }, { status: audio.status });

    const ctx = validateInterpretContext(read.body.context);
    if (!ctx.ok) return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });

    const result = await interpretVoiceAudio(audio.data, audio.mimeType, ctx.context);
    if (!result) {
      return NextResponse.json(
        { success: false, code: 'speech_unavailable', error: 'AI speech recognition is not configured' },
        { status: 503 }
      );
    }
    if (!result.transcript || !result.intent) {
      return NextResponse.json({ success: false, code: 'no_speech', error: "We didn't catch that" }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      provider: result.provider,
      model: result.model,
      transcript: result.transcript,
      intent: result.intent,
    });
  } catch (error: unknown) {
    console.error('Error in /api/ai/voice:', error);
    return NextResponse.json(
      { success: false, error: 'Something went wrong while listening. Please try again.' },
      { status: 500 }
    );
  }
}
