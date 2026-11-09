import { NextRequest, NextResponse } from 'next/server';
import { interpretVoiceTranscript } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcript, context } = body;

    if (!transcript || typeof transcript !== 'string') {
      return NextResponse.json({ error: 'Missing transcript string' }, { status: 400 });
    }

    const defaultContext = {
      currentUser: { id: '11111111-1111-1111-1111-111111111111', name: 'Manan Arora', currency: 'AED' },
      knownMembers: [
        { id: '11111111-1111-1111-1111-111111111111', name: 'Manan Arora' },
        { id: '22222222-2222-2222-2222-222222222222', name: 'Rahul' },
        { id: '33333333-3333-3333-3333-333333333333', name: 'Sarah' },
        { id: '44444444-4444-4444-4444-444444444444', name: 'Priya' },
      ],
      groups: [
        { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Dubai Flatmates' },
        { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'Hatta Road Trip' },
      ],
      categories: [
        'Food and dining',
        'Groceries',
        'Transportation',
        'Shopping',
        'Entertainment',
        'Rent and accommodation',
        'Utilities and bills',
        'Healthcare',
        'Education',
        'Travel',
        'Subscriptions',
        'Other',
      ],
    };

    const ctx = context || defaultContext;
    const intent = await interpretVoiceTranscript(transcript, ctx);

    return NextResponse.json({ success: true, intent });
  } catch (error: any) {
    console.error('Error in /api/ai/interpret:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
