import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  VoiceIntent,
  VoiceIntentSchema,
  deterministicParseIntent,
  deterministicAnswerQuery,
  sanitizeIntent,
  type AiProvider,
  type InterpretContext,
} from './gemini';

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const defaultModelId = process.env.BEDROCK_MODEL_ID || 'global.anthropic.claude-opus-5-5';

let client: BedrockRuntimeClient | null = null;

export function getBedrockClient(): BedrockRuntimeClient {
  if (!client) {
    const credentials =
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN,
          }
        : undefined;

    client = new BedrockRuntimeClient({
      region,
      credentials,
    });
  }
  return client;
}

export const CAREEM_AGENT_PLAYBOOK = `
# Careem Builders '26 Agent Playbook Rules:
1. Always pass user's coordinates (latitude/longitude) - nearly every tool is location-scoped. Get saved addresses from user_info if user says "home" or "work".
2. Respect chain dependencies: context_blob from request_ride must be passed verbatim to create_ride and expires quickly (120s); pricingId from get_ride_cancellation_attributes is required by cancel_ride; catalog_option_ids from food_get_item_options are required to add customizable food items.
3. Never checkout blind: call cart_get_basket_price first and pass its total as total_price to checkout. Confirm order contents, address, and price with user before any mutating tool.
4. Payment defaults are auto-resolved (working card -> wallet -> cash); only pass payment_type if the user asks.
5. Personalize with get_activities(past) - prefer user's known favourites over cold search.
6. Budget for multi-step journeys: full food order is ~6+ sequential tool calls; keep agent's tool-loop limits generous.
7. Errors come back as error string field in tool's structured output, or as MCP tool errors. Retry idempotent reads; never blind-retry mutating tools.
8. Long streams: keepalive comments (: keepalive) arrive every 15 s on SSE streams - ignore them.
> The Golden Rule: Read-only tools are free to call while reasoning. Mutating tools spend user's money or change real-world state - ALWAYS confirm first, never blind-retry after a timeout.
`;

/**
 * Bedrock is strictly opt-in: it is used only when BEDROCK_ENABLED === 'true'.
 * Ambient AWS credentials (AWS_ACCESS_KEY_ID, AWS_PROFILE, ...) inherited from a
 * shell or another tool must NOT enable it, because every call is billed.
 */
export function isBedrockConfigured(): boolean {
  return process.env.BEDROCK_ENABLED === 'true';
}

export const BEDROCK_MODEL_ID = defaultModelId;

/**
 * Returns the first content block that carries a non-empty string `text`.
 * Reasoning models return e.g. [{ reasoningContent }, { text }], so block 0 is
 * not necessarily the answer.
 */
export function extractModelText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (block && typeof block === 'object' && typeof (block as { text?: unknown }).text === 'string') {
      const text = ((block as { text: string }).text).trim();
      if (text) return text;
    }
  }
  return null;
}

/**
 * Robustly extracts a JSON object from model output: strips ``` / ```json fences,
 * tries a direct parse, then falls back to the first balanced {...} object
 * (string-aware, so braces inside strings are ignored). Returns null on failure.
 */
export function extractJsonObject(text: string): unknown | null {
  if (typeof text !== 'string') return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    // fall through to brace scanning
  }
  const start = candidate.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Parse a Bedrock Converse output content array into a validated VoiceIntent, or null. */
export function parseIntentFromContent(content: unknown): VoiceIntent | null {
  const text = extractModelText(content);
  if (!text) return null;
  const parsed = extractJsonObject(text);
  if (!parsed) return null;
  const validated = VoiceIntentSchema.safeParse(parsed);
  return validated.success ? validated.data : null;
}

/**
 * Interpret voice intent using AWS Bedrock (Claude via BEDROCK_MODEL_ID).
 * Incorporates Careem Agent Playbook guidelines.
 */
export async function interpretVoiceTranscriptBedrock(
  transcript: string,
  context: any
): Promise<VoiceIntent> {
  return (await interpretVoiceTranscriptBedrockWithSource(transcript, context)).intent;
}

/**
 * Same as interpretVoiceTranscriptBedrock, but reports whether Bedrock actually
 * produced the intent ('aws-bedrock') or the deterministic parser did.
 */
export async function interpretVoiceTranscriptBedrockWithSource(
  transcript: string,
  context: InterpretContext
): Promise<{ intent: VoiceIntent; provider: AiProvider }> {
  const fallback = () => ({ intent: deterministicParseIntent(transcript, context), provider: 'deterministic' as const });

  if (!isBedrockConfigured()) {
    return fallback();
  }
  try {
    const bedrock = getBedrockClient();

    const systemPrompt = `You are the AI Financial Intelligence Engine for Payd, an intelligent social finance super-app built on Careem MCP and AWS Bedrock.
Parse user voice transcripts into structured expense or settlement intents.
Today's Date: ${new Date().toISOString().split('T')[0]}
Current Active User: ${context.currentUser.name} (Currency: ${context.currentUser.currency || 'AED'})
Known Circle Members: ${context.knownMembers.map((m: any) => m.name).join(', ')}
Known Groups: ${context.groups.map((g: any) => g.name).join(', ')}
Available Categories: ${context.categories.join(', ')}

${CAREEM_AGENT_PLAYBOOK}

Return ONLY valid JSON matching this schema:
{
  "intent": "add_expense" | "add_income" | "split_expense" | "record_repayment" | "query",
  "amount": number | null,
  "currency": string | null,
  "category": string | null,
  "payer": string | null,
  "participants": string[],
  "split_method": "equal" | "exact" | "percentage" | "shares" | null,
  "group_name": string | null,
  "notes": string | null,
  "confidence": number,
  "missing_fields": string[],
  "clarification_question": string | null
}`;

    const command = new ConverseCommand({
      modelId: defaultModelId,
      messages: [
        {
          role: 'user',
          content: [{ text: `Voice transcript to interpret:\n"${transcript}"` }],
        },
      ],
      system: [{ text: systemPrompt }],
      inferenceConfig: {
        maxTokens: 512,
      },
    });

    const response = await bedrock.send(command);
    const intent = parseIntentFromContent(response.output?.message?.content);
    if (!intent) {
      console.warn('[AWS Bedrock] No parseable intent in response; using deterministic parser.');
      return fallback();
    }
    return { intent: sanitizeIntent(intent, context, transcript), provider: 'aws-bedrock' };
  } catch (error) {
    console.warn('[AWS Bedrock] Fallback to deterministic parser:', error);
    return fallback();
  }
}

/**
 * Ask ledger questions using AWS Bedrock (Claude via BEDROCK_MODEL_ID).
 * Falls back to a deterministic answer computed from ledgerSummary.
 */
export async function queryLedgerBedrock(
  question: string,
  ledgerSummary: any
): Promise<string> {
  return (await queryLedgerBedrockWithSource(question, ledgerSummary)).answer;
}

export async function queryLedgerBedrockWithSource(
  question: string,
  ledgerSummary: Record<string, unknown>
): Promise<{ answer: string; provider: AiProvider }> {
  const fallback = () => ({ answer: deterministicAnswerQuery(question, ledgerSummary), provider: 'deterministic' as const });

  if (!isBedrockConfigured()) {
    return fallback();
  }

  try {
    const bedrock = getBedrockClient();
    const command = new ConverseCommand({
      modelId: defaultModelId,
      messages: [
        {
          role: 'user',
          content: [
            {
              text: `Context on user's social debts and ledger (all *Minor values are integer fils; 100 fils = AED 1; people[].netMinor > 0 means that person owes the user):\n${JSON.stringify(ledgerSummary, null, 2)}\n\nQuestion: ${question}`,
            },
          ],
        },
      ],
      system: [
        {
          text: 'You are the Payd Financial Intelligence Assistant on AWS Bedrock. Answer clearly, accurately, and concisely in 1-2 sentences with AED figures. Use only the numbers in the provided context.',
        },
      ],
      inferenceConfig: {
        maxTokens: 256,
      },
    });

    const response = await bedrock.send(command);
    const text = extractModelText(response.output?.message?.content);
    const answer = text?.replace(/^```\w*\s*|```$/g, '').trim();
    if (!answer) return fallback();
    return { answer, provider: 'aws-bedrock' };
  } catch (err: any) {
    console.warn('[AWS Bedrock Query Error]:', err);
    return fallback();
  }
}
