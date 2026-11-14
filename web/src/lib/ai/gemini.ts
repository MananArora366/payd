import { z } from 'zod';
import { GoogleGenAI, Type } from '@google/genai';
import { formatMinorUnits } from '@/lib/ledger/currency';

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

export interface InterpretContext {
  currentUser: { id: string; name: string; currency: string };
  knownMembers: MemberContext[];
  groups: GroupContext[];
  categories: string[];
}

/** Max characters of the transcript we keep in `notes`. */
export const MAX_NOTES_LENGTH = 140;

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/**
 * Parses spoken number words ("seventy five", "one hundred and twenty", "two thousand five hundred").
 * Returns the value of the first run of number words in the text, or null.
 */
export function parseNumberWords(text: string): number | null {
  const tokens = text.toLowerCase().replace(/-/g, ' ').split(/[^a-z]+/).filter(Boolean);
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t in NUMBER_WORDS || t === 'hundred' || t === 'thousand') break;
    i++;
  }
  if (i >= tokens.length) return null;

  let total = 0;
  let current = 0;
  let consumed = 0;
  for (; i < tokens.length; i++) {
    const t = tokens[i];
    if (t in NUMBER_WORDS) {
      current += NUMBER_WORDS[t];
      consumed++;
    } else if (t === 'hundred') {
      current = (current || 1) * 100;
      consumed++;
    } else if (t === 'thousand') {
      total += (current || 1) * 1000;
      current = 0;
      consumed++;
    } else if (t === 'and' && consumed > 0) {
      continue;
    } else {
      break;
    }
  }
  if (consumed === 0) return null;
  const value = total + current;
  return value > 0 ? value : null;
}

const CURRENCY_TOKEN = '(?:aed|dhs?|dirhams?|usd|dollars?|bucks|eur|euros?|gbp|pounds?|inr|rupees?|\\$|€|£|₹)';
const NUMBER_TOKEN = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';

function toAmount(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0 || n > 1e12) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Extracts a money amount (major units) from free text.
 * Prefers a number adjacent to a currency marker ("AED 1,250.50", "75 dirhams"),
 * then any number, then spoken number words.
 */
export function extractAmount(text: string): number | null {
  const lower = text.toLowerCase();
  const adjacent =
    lower.match(new RegExp(`${CURRENCY_TOKEN}\\s*${NUMBER_TOKEN}`, 'i')) ||
    lower.match(new RegExp(`${NUMBER_TOKEN}\\s*${CURRENCY_TOKEN}`, 'i'));
  if (adjacent?.[1]) {
    const v = toAmount(adjacent[1]);
    if (v !== null) return v;
  }
  const any = lower.match(new RegExp(`(?:^|[^\\d.,])${NUMBER_TOKEN}`));
  if (any?.[1]) {
    const v = toAmount(any[1]);
    if (v !== null) return v;
  }
  return parseNumberWords(lower);
}

export function detectCurrency(text: string, defaultCurrency: string): string {
  const t = text.toLowerCase();
  if (/\$|\b(?:dollars?|usd|bucks)\b/.test(t)) return 'USD';
  if (/€|\b(?:euros?|eur)\b/.test(t)) return 'EUR';
  if (/£|\b(?:pounds?|gbp)\b/.test(t)) return 'GBP';
  if (/₹|\b(?:rupees?|inr)\b/.test(t)) return 'INR';
  if (/\b(?:aed|dhs?|dirhams?)\b/.test(t)) return 'AED';
  return defaultCurrency || 'AED';
}

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Food and dining': ['dinner', 'lunch', 'breakfast', 'brunch', 'coffee', 'cafe', 'restaurant', 'burger', 'pizza', 'food', 'eating', 'shawarma'],
  'Groceries': ['supermarket', 'groceries', 'grocery', 'carrefour', 'lulu', 'milk', 'vegetables'],
  'Transportation': ['uber', 'careem', 'taxi', 'metro', 'petrol', 'fuel', 'parking', 'cab', 'salik'],
  'Entertainment': ['movie', 'cinema', 'concert', 'game', 'bowling', 'party'],
  'Rent and accommodation': ['rent', 'airbnb', 'housing'],
  'Utilities and bills': ['dewa', 'wifi', 'wi-fi', 'internet', 'electricity', 'water bill', 'bill', 'phone'],
  'Healthcare': ['doctor', 'pharmacy', 'medicine', 'hospital', 'clinic'],
  'Education': ['course', 'tuition', 'books', 'school', 'university'],
  'Travel': ['flight', 'airline', 'hotel', 'trip', 'hatta'],
  'Subscriptions': ['netflix', 'spotify', 'prime', 'gym'],
  'Shopping': ['clothes', 'amazon', 'mall', 'shopping'],
};

function hasWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

/** Resolve a category name against the supplied list (case-insensitive). Returns the list's spelling or null. */
export function resolveCategory(name: string | null | undefined, categories: string[]): string | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return categories.find((c) => c.toLowerCase() === n) ?? null;
}

function matchCategoryKeyword(text: string, categories: string[]): { category: string; keyword: string } | null {
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    const resolved = resolveCategory(cat, categories);
    if (!resolved) continue;
    const kw = kws.find((k) => hasWord(text, k));
    if (kw) return { category: resolved, keyword: kw };
  }
  return null;
}

/** Truncate the transcript for `notes` so huge inputs are not echoed back. */
export function truncateNotes(text: string, max = MAX_NOTES_LENGTH): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/**
 * Build a short, human description for the confirmation card title
 * ("Dinner", "Repayment from Rahul") rather than echoing the raw transcript.
 */
export function buildShortDescription(intent: Pick<VoiceIntent, 'intent' | 'notes' | 'category' | 'payer'>, maxLen = 40): string {
  const notes = intent.notes || '';
  if (intent.intent === 'record_repayment') {
    return intent.payer ? `Repayment from ${intent.payer.split(' ')[0]}` : 'Repayment';
  }
  for (const kws of Object.values(CATEGORY_KEYWORDS)) {
    const kw = kws.find((k) => hasWord(notes, k));
    if (kw) {
      const venue = notes.match(/\bat\s+([A-Z][\w'&-]*(?:\s+[A-Z][\w'&-]*){0,2})/);
      const base = kw.charAt(0).toUpperCase() + kw.slice(1);
      const title = venue ? `${base} at ${venue[1]}` : base;
      return title.slice(0, maxLen);
    }
  }
  const stripped = notes
    .replace(new RegExp(`${CURRENCY_TOKEN}`, 'gi'), ' ')
    .replace(/\d[\d,.]*/g, ' ')
    .replace(/\b(?:i|paid|pay|spent|spend|for|on|with|and|split|equally|between|the|a|an|me|my|just|today|yesterday)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped) {
    const words = stripped.split(' ').slice(0, 5).join(' ');
    const title = words.charAt(0).toUpperCase() + words.slice(1);
    return title.slice(0, maxLen);
  }
  if (intent.category) return intent.category;
  return intent.intent === 'add_income' ? 'Income' : 'Expense';
}

/**
 * Post-process any intent (LLM or deterministic) so it only references the supplied
 * categories, keeps notes short and clamps confidence.
 */
export function sanitizeIntent(intent: VoiceIntent, ctx: InterpretContext, rawTranscript?: string): VoiceIntent {
  let category = resolveCategory(intent.category, ctx.categories);
  if (!category && intent.intent !== 'record_repayment' && intent.intent !== 'query') {
    category = resolveCategory('Other', ctx.categories);
  }
  if (intent.intent === 'record_repayment') category = null;
  const notesSource = intent.notes ?? rawTranscript ?? null;
  return {
    ...intent,
    amount: intent.amount !== null && Number.isFinite(intent.amount) && intent.amount > 0 ? Math.round(intent.amount * 100) / 100 : null,
    category,
    notes: notesSource ? truncateNotes(notesSource) : null,
    confidence: Math.min(1, Math.max(0, Number.isFinite(intent.confidence) ? intent.confidence : 0.5)),
  };
}

/**
 * Fallback deterministic rule-based natural language parser.
 * Used when no LLM provider is enabled or the provider fails.
 */
export function deterministicParseIntent(transcript: string, ctx: InterpretContext): VoiceIntent {
  const text = transcript.toLowerCase().trim();
  const missing_fields: string[] = [];

  // Determine intent
  let intent: VoiceIntent['intent'] = 'add_expense';
  if (/\b(how much|who owes|who do i owe|balance|what is my|what's my|did i spend|how am i doing)\b/.test(text)) {
    intent = 'query';
  } else if (/\b(paid me back|paid back|repaid|settled|pay back|paid off)\b/.test(text)) {
    intent = 'record_repayment';
  } else if (/\b(income|salary|received|earned|got paid|freelance)\b/.test(text)) {
    intent = 'add_income';
  } else if (/\b(split|between|with)\b/.test(text)) {
    intent = 'split_expense';
  }

  const amount = extractAmount(transcript);
  const currency = detectCurrency(transcript, ctx.currentUser.currency || 'AED');

  const keywordMatch = matchCategoryKeyword(text, ctx.categories);

  // Participant matching against known members (first name, whole word)
  const participants: string[] = [];
  for (const member of ctx.knownMembers) {
    const firstName = member.name.toLowerCase().split(' ')[0];
    if (firstName && hasWord(text, firstName) && !participants.includes(member.name)) {
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
    if (
      text.includes(`${firstName} paid`) ||
      text.includes(`paid by ${firstName}`) ||
      text.includes(`${firstName} repaid`) ||
      text.includes(`${firstName} settled`)
    ) {
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
    clarification_question = intent === 'record_repayment' ? 'How much was paid back?' : 'How much was the expense?';
  } else if (missing_fields.includes('participants')) {
    clarification_question = 'Who would you like to split this with?';
  }

  let category: string | null = null;
  if (intent === 'add_expense' || intent === 'split_expense' || intent === 'add_income') {
    category = keywordMatch?.category ?? resolveCategory('Other', ctx.categories);
  }

  // Heuristic confidence: rule-based parsing is never as sure as a full model.
  let confidence = 0.45;
  if (intent === 'query') confidence = 0.7;
  else {
    if (amount) confidence += 0.2;
    if (keywordMatch || intent === 'record_repayment' || intent === 'add_income') confidence += 0.1;
    if (intent !== 'split_expense' || participants.length > 0) confidence += 0.1;
    confidence -= 0.15 * missing_fields.length;
  }
  confidence = Math.round(Math.min(0.85, Math.max(0.1, confidence)) * 100) / 100;

  return {
    intent,
    amount,
    currency,
    category,
    payer,
    participants,
    split_method,
    group_name: matchedGroup,
    notes: truncateNotes(transcript),
    confidence,
    missing_fields,
    clarification_question,
  };
}

// ---------------------------------------------------------------------------
// Deterministic ledger Q&A (used when no LLM is enabled or it fails)
// ---------------------------------------------------------------------------

export interface QueryPersonBalance {
  name: string;
  /** Positive: they owe the current user. Negative: the current user owes them. Integer fils. */
  netMinor: number;
}

export interface QueryCategorySpend {
  name: string;
  spentMinor: number;
}

/**
 * Shape sent by the voice UI to /api/ai/query. Every field is optional so older
 * clients still work. All *Minor values are integer fils (AED).
 */
export interface QueryDataContext {
  userNetBalance?: number;
  owedToMeMinor?: number;
  iOweMinor?: number;
  spentMinor?: number;
  incomeMinor?: number;
  budgetMinor?: number | null;
  people?: QueryPersonBalance[];
  topCategories?: QueryCategorySpend[];
  [key: string]: unknown;
}

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function aed(minor: number): string {
  return formatMinorUnits(Math.round(minor), 'AED');
}

/**
 * Answers common ledger questions straight from the supplied numbers. No LLM involved.
 */
export function deterministicAnswerQuery(query: string, rawCtx: QueryDataContext | Record<string, unknown> | null | undefined): string {
  const ctx = (rawCtx && typeof rawCtx === 'object' ? rawCtx : {}) as QueryDataContext;
  const q = (query || '').toLowerCase();

  const people = Array.isArray(ctx.people)
    ? ctx.people.filter((p): p is QueryPersonBalance => !!p && typeof p.name === 'string' && isInt(p.netMinor))
    : [];
  const owesMe = people.filter((p) => p.netMinor > 0).sort((a, b) => b.netMinor - a.netMinor);
  const iOweList = people.filter((p) => p.netMinor < 0).sort((a, b) => a.netMinor - b.netMinor);

  const owedToMe = isInt(ctx.owedToMeMinor) ? ctx.owedToMeMinor : owesMe.reduce((s, p) => s + p.netMinor, 0);
  const iOwe = isInt(ctx.iOweMinor) ? ctx.iOweMinor : -iOweList.reduce((s, p) => s + p.netMinor, 0);
  const net = isInt(ctx.userNetBalance) ? ctx.userNetBalance : owedToMe - iOwe;

  // Questions about a specific person
  const person = people.find((p) => {
    const first = p.name.toLowerCase().split(' ')[0];
    return first && hasWord(q, first);
  });
  if (person && /\b(owes?|owed|balance|settle[ds]?|even)\b/.test(q)) {
    const first = person.name.split(' ')[0];
    if (person.netMinor > 0) return `${first} owes you ${aed(person.netMinor)}.`;
    if (person.netMinor < 0) return `You owe ${first} ${aed(-person.netMinor)}.`;
    return `You and ${first} are all settled up.`;
  }

  if (/who owes me|owes me the most|who.*owe.*me/.test(q)) {
    if (owesMe.length === 0) {
      if (!(people.length > 0 || isInt(ctx.owedToMeMinor))) return `You are owed ${aed(owedToMe)} in total.`;
      // Say which way the money actually flows, so "nobody" isn't mistaken for "all settled".
      const topOwed = iOweList[0];
      return topOwed
        ? `Nobody owes you anything right now. You owe ${topOwed.name.split(' ')[0]} ${aed(-topOwed.netMinor)}.`
        : 'Nobody owes you anything right now.';
    }
    const top = owesMe[0];
    const others = owesMe.slice(1, 3).map((p) => `${p.name.split(' ')[0]} (${aed(p.netMinor)})`);
    return `${top.name.split(' ')[0]} owes you the most: ${aed(top.netMinor)}.` +
      (others.length ? ` Also: ${others.join(', ')}.` : '') +
      ` In total you are owed ${aed(owedToMe)}.`;
  }

  if (/how much am i owed|owed to me|am i owed/.test(q)) {
    return owedToMe > 0 ? `You are owed ${aed(owedToMe)} in total.` : 'Nobody owes you anything right now.';
  }

  if (/who do i owe|how much do i owe|do i owe|what do i owe|\bi owe\b/.test(q)) {
    if (iOwe <= 0) return 'You do not owe anyone right now.';
    if (iOweList.length > 0) {
      const parts = iOweList.slice(0, 3).map((p) => `${p.name.split(' ')[0]} (${aed(-p.netMinor)})`);
      return `You owe ${aed(iOwe)} in total: ${parts.join(', ')}.`;
    }
    return `You owe ${aed(iOwe)} in total.`;
  }

  if (/categor|most on|biggest expense|top spend/.test(q)) {
    const cats = Array.isArray(ctx.topCategories)
      ? ctx.topCategories.filter((c) => c && typeof c.name === 'string' && isInt(c.spentMinor) && c.spentMinor > 0)
      : [];
    if (cats.length === 0) return 'I could not find any categorised spending yet.';
    const sorted = [...cats].sort((a, b) => b.spentMinor - a.spentMinor);
    return `Your top category is ${sorted[0].name} at ${aed(sorted[0].spentMinor)}.`;
  }

  if (/budget|remaining|left to spend/.test(q)) {
    if (!isInt(ctx.budgetMinor)) return 'You have not set a monthly budget yet.';
    const spent = isInt(ctx.spentMinor) ? ctx.spentMinor : 0;
    const remaining = ctx.budgetMinor - spent;
    return remaining >= 0
      ? `You have ${aed(remaining)} left of your ${aed(ctx.budgetMinor)} budget.`
      : `You are ${aed(-remaining)} over your ${aed(ctx.budgetMinor)} budget.`;
  }

  if (/spen[dt]/.test(q)) {
    if (isInt(ctx.spentMinor)) {
      const budget = isInt(ctx.budgetMinor) ? ` against a budget of ${aed(ctx.budgetMinor)}` : '';
      return `You have spent ${aed(ctx.spentMinor)}${budget}.`;
    }
    if (typeof ctx.formattedSpent === 'string') return `You have spent ${ctx.formattedSpent}.`;
  }

  if (/income|earn/.test(q) && isInt(ctx.incomeMinor)) {
    return `Your recorded income is ${aed(ctx.incomeMinor)}.`;
  }

  // Default: net balance summary
  if (net > 0) return `Overall you are owed ${aed(net)} (owed to you ${aed(owedToMe)}, you owe ${aed(iOwe)}).`;
  if (net < 0) return `Overall you owe ${aed(-net)} (you owe ${aed(iOwe)}, owed to you ${aed(owedToMe)}).`;
  return 'You are all settled up. Your net balance is AED 0.00.';
}

/**
 * Interprets a spoken voice transcript using Google Gemini or deterministic fallback.
 * Strictly adheres to Invariant 2: Gemini parses language ONLY; it never writes to the DB.
 */
export async function interpretVoiceTranscript(
  transcript: string,
  ctx: InterpretContext
): Promise<VoiceIntent> {
  return (await interpretVoiceTranscriptWithSource(transcript, ctx)).intent;
}

export type AiProvider = 'aws-bedrock' | 'gemini' | 'deterministic';

export function isGeminiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return !!apiKey && apiKey.trim() !== '' && apiKey !== 'your-gemini-api-key';
}

/** Same as interpretVoiceTranscript, but reports which engine actually produced the intent. */
export async function interpretVoiceTranscriptWithSource(
  transcript: string,
  ctx: InterpretContext
): Promise<{ intent: VoiceIntent; provider: AiProvider }> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!isGeminiConfigured() || !apiKey) {
    // Graceful deterministic parsing
    return { intent: deterministicParseIntent(transcript, ctx), provider: 'deterministic' };
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
    return { intent: sanitizeIntent(validated, ctx, transcript), provider: 'gemini' };
  } catch (error) {
    console.error('Gemini interpretation error, falling back to deterministic parser:', error);
    return { intent: deterministicParseIntent(transcript, ctx), provider: 'deterministic' };
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
  return (await formatFinancialAnswerWithSource(query, dataContext)).answer;
}

/** Same as formatFinancialAnswer, but reports which engine produced the answer. */
export async function formatFinancialAnswerWithSource(
  query: string,
  dataContext: Record<string, any>
): Promise<{ answer: string; provider: AiProvider }> {
  const apiKey = process.env.GEMINI_API_KEY;
  const fallback = () => ({ answer: deterministicAnswerQuery(query, dataContext), provider: 'deterministic' as const });

  if (!isGeminiConfigured() || !apiKey) {
    return fallback();
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

    const text = response.text?.trim();
    return text ? { answer: text, provider: 'gemini' } : fallback();
  } catch (err) {
    console.error('Error generating financial answer:', err);
    return fallback();
  }
}
