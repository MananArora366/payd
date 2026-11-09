import { NextRequest, NextResponse } from 'next/server';
import { formatFinancialAnswer } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, dataContext } = body;

    if (!query) {
      return NextResponse.json({ error: 'Missing query string' }, { status: 400 });
    }

    const answer = await formatFinancialAnswer(query, dataContext || {});
    return NextResponse.json({ success: true, answer });
  } catch (error: any) {
    console.error('Error in /api/ai/query:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
