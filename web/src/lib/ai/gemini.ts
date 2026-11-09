import { z } from 'zod';
import { GoogleGenAI, Type } from '@google/genai';

export const VoiceIntentSchema = z.object({
  intent: z.enum(['add_expense', 'add_income', 'split_expense', 'record_repayment', 'query']),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  category: z.string().nullable(),
  payer: z.string().nullable(),
  participants: z.array(z.string()),
  split_method: z.enum(['equal', 'exact', 'percentage', 'shares']).nullable(),
  group_name: z.string().nullable(),
  notes: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  missing_fields: z.array(z.string()),
  clarification_question: z.string().nullable().optional(),
});

export type VoiceIntent = z.infer<typeof VoiceIntentSchema>;

interface MemberContext {
  id: string;
  name: string;
}

interface GroupContext {
  id: string;
  name: string;
}

interface InterpretContext {
  currentUser: { id: string; name: string; currency: string };
  knownMembers: MemberContext[];
  groups: GroupContext[];
  categories: string[];
}

/**
 * Fallback deterministic rule-based natural language parser.
 * Used when GEMINI_API_KEY is not set or during offline/mock execution.
 */
export function deterministicParseIntent(transcript: string, ctx: InterpretContext): VoiceIntent {
  const text = transcript.toLowerCase().trim();
  const missing_fields: string[] = [];

  // Determine intent
  let intent: VoiceIntent['intent'] = 'add_expense';
  if (text.includes('how much') || text.includes('who owes') || text.includes('balance') || text.includes('what is my') || text.includes('did i spend')) {
    intent = 'query';
  } else if (text.includes('paid me back') || text.includes('repaid') || text.includes('settled') || text.includes('pay back')) {
    intent = 'record_repayment';
  } else if (text.includes('income') || text.includes('salary') || text.includes('received') || text.includes('earned') || text.includes('got paid')) {
    intent = 'add_income';
  } else if (text.includes('split') || text.includes('between') || text.includes('with')) {
    intent = 'split_expense';
  }

  // Extract amount
  // Matches "120 dirhams", "AED 50", "$30", "45.50", "100"
  let amount: number | null = null;
  const amountMatch = text.match(/(?:aed|\$|€|£|₹|dirhams?|dhs?)?\s*(\d+(?:\.\d{1,2})?)\s*(?:aed|\$|€|£|₹|dirhams?|dhs?|bucks)?/i);
  if (amountMatch && amountMatch[1]) {
    amount = parseFloat(amountMatch[1]);
  }

  // Currency
  let currency = ctx.currentUser.currency || 'AED';
  if (text.includes('$') || text.includes('dollar') || text.includes('usd')) currency = 'USD';
  else if (text.includes('€') || text.includes('euro')) currency = 'EUR';
  else if (text.includes('£') || text.includes('pound')) currency = 'GBP';
  else if (text.includes('₹') || text.includes('rupee') || text.includes('inr')) currency = 'INR';
  else if (text.includes('aed') || text.includes('dirham') || text.includes('dh')) currency = 'AED';

  // Category matching
  let matchedCategory: string | null = null;
  const catKeywords: Record<string, string[]> = {
    'Food and dining': ['dinner', 'lunch', 'breakfast', 'coffee', 'cafe', 'restaurant', 'burger', 'pizza', 'food', 'eating'],
    'Groceries': ['supermarket', 'groceries', 'grocery', 'carrefour', 'lulu', 'milk', 'vegetables'],
    'Transportation': ['uber', 'careem', 'taxi', 'metro', 'petrol', 'fuel', 'gas', 'parking', 'cab'],
    'Entertainment': ['movie', 'cinema', 'concert', 'game', 'bowling', 'party'],
    'Rent and accommodation': ['rent', 'hotel', 'airbnb', 'housing'],
    'Utilities and bills': ['dewa', 'wifi', 'internet', 'electricity', 'water', 'bill', 'phone'],
    'Healthcare': ['doctor', 'pharmacy', 'medicine', 'hospital', 'clinic'],
    'Education': ['course', 'tuition', 'books', 'school', 'university'],
    'Travel': ['flight', 'airline', 'hotel', 'trip', 'hatta'],
    'Subscriptions': ['netflix', 'spotify', 'prime', 'gym'],
    'Shopping': ['clothes', 'amazon', 'mall', 'shopping'],
  };

  for (const [cat, kws] of Object.entries(catKeywords)) {
    if (kws.some((kw) => text.includes(kw))) {
      matchedCategory = cat;
      break;
    }
  }

  // Participant matching against known members
  const participants: string[] = [];
  for (const member of ctx.knownMembers) {
    const firstName = member.name.toLowerCase().split(' ')[0];
    if (text.includes(firstName)) {
      participants.push(member.name);
    }
  }

  // Group matching
  let matchedGroup: string | null = null;
  for (const grp of ctx.groups) {
    if (text.includes(grp.name.toLowerCase())) {
      matchedGroup = grp.name;
    }
  }

  // Split method
  let split_method: VoiceIntent['split_method'] = null;
  if (intent === 'split_expense') {
    split_method = 'equal';
    if (text.includes('percent')) split_method = 'percentage';
    else if (text.includes('share')) split_method = 'shares';
    else if (text.includes('exact')) split_method = 'exact';
  }

  // Payer
  let payer: string | null = ctx.currentUser.name;
  for (const member of ctx.knownMembers) {
    const firstName = member.name.toLowerCase().split(' ')[0];
    if (text.includes(`${firstName} paid`) || text.includes(`paid by ${firstName}`)) {
      payer = member.name;
    }
  }

  // If split expense and participants found, make sure payer/currentUser is included
  if (intent === 'split_expense' && participants.length > 0) {
    if (!participants.includes(ctx.currentUser.name) && payer === ctx.currentUser.name) {
      participants.unshift(ctx.currentUser.name);
    }
  }

  // Invariant validation / missing fields
  if (intent !== 'query') {
    if (!amount) missing_fields.push('amount');
    if (intent === 'split_expense' && participants.length === 0) {
      missing_fields.push('participants');
    }
  }

  let clarification_question: string | null = null;
  if (missing_fields.includes('amount')) {
    clarification_question = 'How much was the expense?';
  } else if (missing_fields.includes('participants')) {
    clarification_question = 'Who would you like to split this with?';
  }

  return {
    intent,
    amount,
    currency,
    category: matchedCategory || (intent === 'add_income' ? 'Other' : 'Food and dining'),
    payer,
    participants,
    split_method,
    group_name: matchedGroup,
    notes: transcript,
    confidence: 0.92,
    missing_fields,
    clarification_question,
  };
}

/**
 * Interprets a spoken voice transcript using Google Gemini or deterministic fallback.
 * Strictly adheres to Invariant 2: Gemini parses language ONLY; it never writes to the DB.
 */
export async function interpretVoiceTranscript(
  transcript: string,
  ctx: InterpretContext
): Promise<VoiceIntent> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey === 'your-gemini-api-key') {
    // Graceful deterministic parsing
    return deterministicParseIntent(transcript, ctx);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `You are Payd's financial voice parser.
Convert natural speech into structured JSON for an expense tracker.
IMPORTANT INVARIANTS:
1. You only extract intent and entities. You DO NOT calculate balances or split amounts.
2. If amount is missing, add 'amount' to missing_fields and ask a brief clarification_question.
3. If split participants are unclear, add 'participants' to missing_fields and ask a brief clarification_question.
4. Current user is "${ctx.currentUser.name}" (ID: ${ctx.currentUser.id}, Default Currency: ${ctx.currentUser.currency}).
Known contacts/group members: ${ctx.knownMembers.map((m) => m.name).join(', ')}.
Available groups: ${ctx.groups.map((g) => g.name).join(', ')}.
Standard Categories: ${ctx.categories.join(', ')}.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: `Voice transcript: "${transcript}"` }],
        },
      ],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intent: {
              type: Type.STRING,
              enum: ['add_expense', 'add_income', 'split_expense', 'record_repayment', 'query'],
            },
            amount: { type: Type.NUMBER, nullable: true },
            currency: { type: Type.STRING, nullable: true },
            category: { type: Type.STRING, nullable: true },
            payer: { type: Type.STRING, nullable: true },
            participants: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            split_method: {
              type: Type.STRING,
              enum: ['equal', 'exact', 'percentage', 'shares'],
              nullable: true,
            },
            group_name: { type: Type.STRING, nullable: true },
            notes: { type: Type.STRING, nullable: true },
            confidence: { type: Type.NUMBER },
            missing_fields: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            clarification_question: { type: Type.STRING, nullable: true },
          },
          required: ['intent', 'confidence', 'missing_fields', 'participants'],
        },
      },
    });

    const parsedJson = JSON.parse(response.text || '{}');
    const validated = VoiceIntentSchema.parse(parsedJson);
    return validated;
  } catch (error) {
    console.error('Gemini interpretation error, falling back to deterministic parser:', error);
    return deterministicParseIntent(transcript, ctx);
  }
}

/**
 * Formats deterministic query results into natural spoken text.
 * Strictly adheres to Invariant 2: Database aggregates run deterministically FIRST.
 * Gemini formats the human response grounded in real data.
 */
export async function formatFinancialAnswer(
  query: string,
  dataContext: Record<string, any>
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  const fallbackAnswer = () => {
    if (dataContext.type === 'balance_summary') {
      const net = dataContext.userNetBalance;
      if (net > 0) return `You are in the green! Overall you are owed ${dataContext.formattedOwedToMe}.`;
      if (net < 0) return `You currently owe ${dataContext.formattedIOwe} across your shared groups.`;
      return `All your shared expenses and settlements are completely even. You owe nothing!`;
    }
    if (dataContext.type === 'monthly_spend') {
      return `You have spent ${dataContext.formattedSpent} this month against your budget of ${dataContext.formattedBudget}. Remaining: ${dataContext.formattedRemaining}.`;
    }
    return `Based on your Payd records: Total spent is ${dataContext.formattedSpent || 'AED 0.00'}. Net balance is ${dataContext.formattedNet || 'AED 0.00'}.`;
  };

  if (!apiKey || apiKey.trim() === '' || apiKey === 'your-gemini-api-key') {
    return fallbackAnswer();
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `User query: "${query}"\n\nGrounded deterministic data:\n${JSON.stringify(
                dataContext,
                null,
                2
              )}\n\nPlease provide a friendly, concise, 1-2 sentence response directly answering the user's question with these exact numbers.`,
            },
          ],
        },
      ],
    });

    return response.text?.trim() || fallbackAnswer();
  } catch (err) {
    console.error('Error generating financial answer:', err);
    return fallbackAnswer();
  }
}
