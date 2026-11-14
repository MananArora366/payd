import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import {
  isBedrockConfigured,
  extractModelText,
  extractJsonObject,
  parseIntentFromContent,
  interpretVoiceTranscriptBedrockWithSource,
  queryLedgerBedrockWithSource,
} from './bedrock';
import {
  deterministicParseIntent,
  deterministicAnswerQuery,
  extractAmount,
  parseNumberWords,
  buildShortDescription,
  MAX_NOTES_LENGTH,
} from './gemini';
import { POST as interpretPOST } from '@/app/api/ai/interpret/route';
import { POST as queryPOST } from '@/app/api/ai/query/route';

const ctx = {
  currentUser: { id: 'u1', name: 'Manan Arora', currency: 'AED' },
  knownMembers: [
    { id: 'u1', name: 'Manan Arora' },
    { id: 'u2', name: 'Rahul' },
    { id: 'u3', name: 'Sarah' },
  ],
  groups: [{ id: 'g1', name: 'Dubai Flatmates' }],
  categories: ['Food and dining', 'Groceries', 'Transportation', 'Other'],
};

const validIntent = {
  intent: 'split_expense',
  amount: 120,
  currency: 'AED',
  category: 'Food and dining',
  payer: 'Manan Arora',
  participants: ['Manan Arora', 'Rahul'],
  split_method: 'equal',
  group_name: null,
  notes: 'dinner',
  confidence: 0.9,
  missing_fields: [],
  clarification_question: null,
};

// Never let a test reach real (billed) Bedrock.
const savedEnv = { ...process.env };
let sendSpy: any;
beforeEach(() => {
  delete process.env.BEDROCK_ENABLED;
  delete process.env.GEMINI_API_KEY;
  sendSpy = vi
    .spyOn(BedrockRuntimeClient.prototype, 'send')
    .mockRejectedValue(new Error('live Bedrock call attempted in test') as never);
});
afterEach(() => {
  sendSpy.mockRestore();
  process.env = { ...savedEnv };
});

describe('isBedrockConfigured', () => {
  it('ignores inherited AWS credentials; only BEDROCK_ENABLED=true enables it', () => {
    process.env.AWS_ACCESS_KEY_ID = 'AKIA_TEST';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret';
    process.env.AWS_PROFILE = 'default';
    expect(isBedrockConfigured()).toBe(false);
    process.env.BEDROCK_ENABLED = 'false';
    expect(isBedrockConfigured()).toBe(false);
    process.env.BEDROCK_ENABLED = 'true';
    expect(isBedrockConfigured()).toBe(true);
  });
});

describe('Bedrock response parsing', () => {
  const fenced = '```json\n' + JSON.stringify(validIntent) + '\n```';
  const blocks = [
    { reasoningContent: { reasoningText: { text: 'thinking {not json}' } } },
    { text: fenced },
  ];

  it('skips reasoningContent and takes the first text block', () => {
    expect(extractModelText(blocks)).toBe(fenced);
    expect(extractModelText([{ text: '   ' }, { text: 'second' }])).toBe('second');
    expect(extractModelText(undefined)).toBeNull();
    expect(extractModelText([{ reasoningContent: {} }])).toBeNull();
  });

  it('extracts JSON from fences, prose and nested braces', () => {
    expect(extractJsonObject(fenced)).toEqual(validIntent);
    expect(extractJsonObject('Here you go: {"a": {"b": "}"}, "c": 1} thanks')).toEqual({ a: { b: '}' }, c: 1 });
    expect(extractJsonObject('no json here')).toBeNull();
    expect(extractJsonObject('{"broken": ')).toBeNull();
  });

  it('parses a [reasoningContent, text] fixture into a valid intent', () => {
    const intent = parseIntentFromContent(blocks);
    expect(intent?.intent).toBe('split_expense');
    expect(intent?.amount).toBe(120);
  });

  it('interpret: reports aws-bedrock only when Bedrock produced the intent', async () => {
    process.env.BEDROCK_ENABLED = 'true';
    sendSpy.mockResolvedValueOnce({ output: { message: { content: blocks } } } as never);
    const ok = await interpretVoiceTranscriptBedrockWithSource('Paid 120 for dinner with Rahul', ctx);
    expect(ok.provider).toBe('aws-bedrock');
    expect(ok.intent.amount).toBe(120);

    sendSpy.mockResolvedValueOnce({ output: { message: { content: [{ reasoningContent: {} }] } } } as never);
    const empty = await interpretVoiceTranscriptBedrockWithSource('Paid 120 for dinner with Rahul', ctx);
    expect(empty.provider).toBe('deterministic');
    expect(empty.intent.amount).toBe(120);
  });

  it('interpret: category outside the supplied list is coerced to a listed one', async () => {
    process.env.BEDROCK_ENABLED = 'true';
    sendSpy.mockResolvedValueOnce({
      output: { message: { content: [{ text: JSON.stringify({ ...validIntent, category: 'Wizardry' }) }] } },
    } as never);
    const res = await interpretVoiceTranscriptBedrockWithSource('Paid 120 for dinner with Rahul', ctx);
    expect(ctx.categories).toContain(res.intent.category);
  });

  it('query: uses the text block, falls back deterministically on empty/failure', async () => {
    process.env.BEDROCK_ENABLED = 'true';
    sendSpy.mockResolvedValueOnce({
      output: { message: { content: [{ reasoningContent: {} }, { text: 'Rahul owes you AED 50.00.' }] } },
    } as never);
    const ok = await queryLedgerBedrockWithSource('who owes me the most?', {});
    expect(ok).toEqual({ answer: 'Rahul owes you AED 50.00.', provider: 'aws-bedrock' });

    sendSpy.mockRejectedValueOnce(new Error('offline') as never);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fail = await queryLedgerBedrockWithSource('who owes me the most?', {
      people: [{ name: 'Rahul', netMinor: 5000 }],
    });
    expect(fail.provider).toBe('deterministic');
    expect(fail.answer).toContain('Rahul owes you the most');
  });

  it('does not call Bedrock when BEDROCK_ENABLED is unset', async () => {
    const res = await interpretVoiceTranscriptBedrockWithSource('Paid 50 for lunch', ctx);
    expect(res.provider).toBe('deterministic');
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe('deterministic parser', () => {
  it('parses thousands separators and number words', () => {
    expect(extractAmount('Paid AED 1,250.50 for rent')).toBe(1250.5);
    expect(extractAmount('spent 1,250.50 dirhams')).toBe(1250.5);
    expect(parseNumberWords('seventy five dirhams')).toBe(75);
    expect(parseNumberWords('one hundred and twenty')).toBe(120);
    expect(parseNumberWords('two thousand five hundred')).toBe(2500);
    expect(deterministicParseIntent('Paid seventy five dirhams for lunch', ctx).amount).toBe(75);
  });

  it('prefers the number next to a currency marker', () => {
    expect(extractAmount('split with 3 people, 90 AED for pizza')).toBe(90);
  });

  it('only returns categories from the supplied list', () => {
    const i = deterministicParseIntent('Spent 40 on netflix', ctx); // Subscriptions is not in ctx
    expect(ctx.categories).toContain(i.category);
    expect(i.category).toBe('Other');
    const noOther = deterministicParseIntent('Spent 40 on netflix', { ...ctx, categories: ['Groceries'] });
    expect(noOther.category).toBeNull();
  });

  it('repayments do not default to Food and have a payer', () => {
    const i = deterministicParseIntent('Rahul paid me back 80 AED', ctx);
    expect(i.intent).toBe('record_repayment');
    expect(i.category).toBeNull();
    expect(i.payer).toBe('Rahul');
    expect(i.amount).toBe(80);
  });

  it('does not echo huge transcripts and does not claim fixed 0.92 confidence', () => {
    const long = 'Paid 10 AED for coffee ' + 'blah '.repeat(500);
    const i = deterministicParseIntent(long, ctx);
    expect(i.notes!.length).toBeLessThanOrEqual(MAX_NOTES_LENGTH);
    expect(i.confidence).toBeLessThan(0.9);
    const missing = deterministicParseIntent('Split dinner with Rahul', ctx);
    expect(missing.confidence).toBeLessThan(i.confidence);
  });

  it('dirham detection does not trigger on "Abu Dhabi"', () => {
    expect(deterministicParseIntent('Paid 10 dollars in Abu Dhabi', ctx).currency).toBe('USD');
  });

  it('builds a short description instead of the raw transcript', () => {
    expect(buildShortDescription(deterministicParseIntent('Paid 120 AED for dinner with Rahul and Sarah', ctx))).toBe('Dinner');
    expect(buildShortDescription(deterministicParseIntent('Rahul paid me back 80 AED', ctx))).toBe('Repayment from Rahul');
  });
});

describe('deterministic query answers', () => {
  const data = {
    userNetBalance: 3000,
    owedToMeMinor: 8000,
    iOweMinor: 5000,
    spentMinor: 120000,
    budgetMinor: 200000,
    people: [
      { name: 'Rahul', netMinor: 5000 },
      { name: 'Sarah', netMinor: 3000 },
      { name: 'Priya', netMinor: -5000 },
    ],
    topCategories: [
      { name: 'Groceries', spentMinor: 40000 },
      { name: 'Food and dining', spentMinor: 60000 },
    ],
  };

  it('who owes me the most', () => {
    expect(deterministicAnswerQuery('Who owes me the most?', data)).toMatch(/^Rahul owes you the most: AED 50\.00/);
  });
  it('who owes me the most when I only owe others (seed data shape)', () => {
    const seed = { currency: 'AED', userNetBalance: -9667, owedToMeMinor: 0, iOweMinor: 9667, people: [{ name: 'Rahul Sharma', netMinor: -9667 }] };
    expect(deterministicAnswerQuery('who owes me the most?', seed)).toBe(
      'Nobody owes you anything right now. You owe Rahul AED 96.67.'
    );
  });
  it('how much do I owe', () => {
    expect(deterministicAnswerQuery('How much do I owe?', data)).toBe('You owe AED 50.00 in total: Priya (AED 50.00).');
  });
  it('how much am I owed', () => {
    expect(deterministicAnswerQuery('How much am I owed?', data)).toBe('You are owed AED 80.00 in total.');
  });
  it('net balance', () => {
    expect(deterministicAnswerQuery("What's my balance?", data)).toContain('Overall you are owed AED 30.00');
  });
  it('specific person', () => {
    expect(deterministicAnswerQuery('Does Priya owe me anything?', data)).toBe('You owe Priya AED 50.00.');
  });
  it('top category', () => {
    expect(deterministicAnswerQuery('What category do I spend most on?', data)).toBe(
      'Your top category is Food and dining at AED 600.00.'
    );
  });
  it('budget and spend', () => {
    expect(deterministicAnswerQuery('How much budget is remaining?', data)).toContain('AED 800.00 left');
    expect(deterministicAnswerQuery('How much did I spend this month?', data)).toContain('AED 1,200.00');
  });
  it('works with an empty context (legacy clients)', () => {
    expect(deterministicAnswerQuery('balance?', {})).toContain('settled up');
  });
});

describe('AI routes input validation (Bedrock disabled)', () => {
  const req = (body: string, contentType = 'application/json') =>
    new Request('http://localhost/api/ai/x', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
    }) as any;

  it('interpret: rejects bad bodies with 400 JSON', async () => {
    for (const r of [
      req('', 'application/json'),
      req('not json'),
      req('{"transcript": 5}'),
      req('[]'),
      req(JSON.stringify({ transcript: 'Paid 10 for coffee' }), 'text/plain'),
      req(JSON.stringify({ transcript: 'x'.repeat(2001) })),
      req(JSON.stringify({ transcript: 'Paid 10', context: { knownMembers: 'nope' } })),
    ]) {
      const res = await interpretPOST(r);
      expect(res.status).toBe(400);
      expect((await res.json()).success).toBe(false);
    }
  });

  it('interpret: missing context uses defaults; provider reported honestly', async () => {
    const res = await interpretPOST(req(JSON.stringify({ transcript: 'Paid 1,250.50 AED for groceries', provider: 'bedrock' })));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.provider).toBe('deterministic');
    expect(json.intent.amount).toBe(1250.5);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('query: deterministic answer from dataContext', async () => {
    const res = await queryPOST(
      req(JSON.stringify({ query: 'who owes me the most?', dataContext: { people: [{ name: 'Sarah', netMinor: 1234 }] } }))
    );
    const json = await res.json();
    expect(json.provider).toBe('deterministic');
    expect(json.answer).toContain('Sarah owes you the most: AED 12.34');
  });

  it('query: rejects oversize and wrong-typed input', async () => {
    expect((await queryPOST(req(JSON.stringify({ query: 'q'.repeat(2001) })))).status).toBe(400);
    expect((await queryPOST(req(JSON.stringify({ query: 'hi', dataContext: [1] })))).status).toBe(400);
    expect((await queryPOST(req(JSON.stringify({})))).status).toBe(400);
  });
});
