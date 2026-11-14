import { NextRequest, NextResponse } from 'next/server';
import { deterministicParseIntent, interpretVoiceTranscriptWithSource } from '@/lib/ai/gemini';
import {
  BEDROCK_MODEL_ID,
  interpretVoiceTranscriptBedrockWithSource,
  isBedrockConfigured,
} from '@/lib/ai/bedrock';
import { aiAllowedByUser, readJsonBody, validateInterpretContext, validateText } from '@/lib/ai/request';

const MODEL_BY_PROVIDER: Record<string, string> = {
  'aws-bedrock': BEDROCK_MODEL_ID,
  gemini: 'gemini-2.0-flash',
  deterministic: 'payd-rules-v1',
};

export async function POST(req: NextRequest) {
  try {
    const read = await readJsonBody(req);
    if (!read.ok) return NextResponse.json({ success: false, error: read.error }, { status: read.status });

    const text = validateText(read.body.transcript, 'transcript');
    if (!text.ok) return NextResponse.json({ success: false, error: text.error }, { status: text.status });

    const ctx = validateInterpretContext(read.body.context);
    if (!ctx.ok) return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });

    // The client cannot force a provider: Bedrock is server-side opt-in only (BEDROCK_ENABLED=true).
    // The user's AI toggle can switch to the built-in rules.
    const { intent, provider } = !aiAllowedByUser(read.body)
      ? { intent: deterministicParseIntent(text.text, ctx.context), provider: 'deterministic' as const }
      : isBedrockConfigured()
        ? await interpretVoiceTranscriptBedrockWithSource(text.text, ctx.context)
        : await interpretVoiceTranscriptWithSource(text.text, ctx.context);

    return NextResponse.json({
      success: true,
      provider,
      model: MODEL_BY_PROVIDER[provider],
      intent,
    });
  } catch (error: unknown) {
    console.error('Error in /api/ai/interpret:', error);
    return NextResponse.json(
      { success: false, error: 'Something went wrong while interpreting that. Please try again.' },
      { status: 500 }
    );
  }
}
