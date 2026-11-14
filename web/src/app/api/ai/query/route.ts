import { NextRequest, NextResponse } from 'next/server';
import { deterministicAnswerQuery, formatFinancialAnswerWithSource } from '@/lib/ai/gemini';
import { BEDROCK_MODEL_ID, queryLedgerBedrockWithSource, isBedrockConfigured } from '@/lib/ai/bedrock';
import { aiAllowedByUser, readJsonBody, validateDataContext, validateText } from '@/lib/ai/request';

const MODEL_BY_PROVIDER: Record<string, string> = {
  'aws-bedrock': BEDROCK_MODEL_ID,
  gemini: 'gemini-2.0-flash',
  deterministic: 'payd-rules-v1',
};

export async function POST(req: NextRequest) {
  try {
    const read = await readJsonBody(req);
    if (!read.ok) return NextResponse.json({ success: false, error: read.error }, { status: read.status });

    const text = validateText(read.body.query, 'query');
    if (!text.ok) return NextResponse.json({ success: false, error: text.error }, { status: text.status });

    const data = validateDataContext(read.body.dataContext);
    if (!data.ok) return NextResponse.json({ success: false, error: data.error }, { status: data.status });

    // Bedrock is server-side opt-in only (BEDROCK_ENABLED=true); the client cannot force it.
    // The user's AI toggle can switch to the built-in rules.
    const { answer, provider } = !aiAllowedByUser(read.body)
      ? { answer: deterministicAnswerQuery(text.text, data.dataContext), provider: 'deterministic' as const }
      : isBedrockConfigured()
        ? await queryLedgerBedrockWithSource(text.text, data.dataContext)
        : await formatFinancialAnswerWithSource(text.text, data.dataContext);

    return NextResponse.json({
      success: true,
      provider,
      model: MODEL_BY_PROVIDER[provider],
      answer,
    });
  } catch (error: unknown) {
    console.error('Error in /api/ai/query:', error);
    return NextResponse.json(
      { success: false, error: 'Something went wrong while answering that. Please try again.' },
      { status: 500 }
    );
  }
}
