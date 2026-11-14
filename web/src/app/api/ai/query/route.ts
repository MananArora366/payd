import { NextRequest, NextResponse } from 'next/server';
import { formatFinancialAnswer } from '@/lib/ai/gemini';
import { queryLedgerBedrock, isBedrockConfigured } from '@/lib/ai/bedrock';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, dataContext, provider } = body;

    if (!query) {
      return NextResponse.json({ error: 'Missing query string' }, { status: 400 });
    }

    const useBedrock = provider === 'bedrock' || isBedrockConfigured();
    const answer = useBedrock
      ? await queryLedgerBedrock(query, dataContext || {})
      : await formatFinancialAnswer(query, dataContext || {});

    return NextResponse.json({
      success: true,
      provider: useBedrock ? 'aws-bedrock' : 'gemini',
      model: useBedrock ? 'anthropic.claude-3-5-sonnet-20241022-v2:0' : 'gemini-2.5-flash',
      answer,
    });
  } catch (error: any) {
    console.error('Error in /api/ai/query:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
