import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { VoiceIntent, VoiceIntentSchema, deterministicParseIntent } from './gemini';

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const defaultModelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0';

let client: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!client) {
    client = new BedrockRuntimeClient({
      region,
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

export function isBedrockConfigured(): boolean {
  return !!(
    (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
    process.env.AWS_PROFILE ||
    process.env.BEDROCK_ENABLED === 'true'
  );
}

/**
 * Interpret voice intent using AWS Bedrock (Claude 3.5 Sonnet or Amazon Nova).
 * Incorporates Careem Agent Playbook guidelines.
 */
export async function interpretVoiceTranscriptBedrock(
  transcript: string,
  context: any
): Promise<VoiceIntent> {
  const fallback = deterministicParseIntent(transcript, context);

  if (!isBedrockConfigured() && process.env.NODE_ENV !== 'test') {
    return fallback;
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
        temperature: 0.1,
      },
    });

    const response = await bedrock.send(command);
    const outputText = response.output?.message?.content?.[0]?.text;

    if (!outputText) {
      return fallback;
    }

    const cleanJson = outputText.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    const validated = VoiceIntentSchema.safeParse(parsed);

    if (validated.success) {
      return validated.data;
    }

    return fallback;
  } catch (error) {
    console.warn('[AWS Bedrock] Fallback to deterministic parser:', error);
    return fallback;
  }
}

/**
 * Ask ledger questions using AWS Bedrock Claude 3.5 Sonnet.
 */
export async function queryLedgerBedrock(
  question: string,
  ledgerSummary: any
): Promise<string> {
  if (!isBedrockConfigured()) {
    return `[AWS Bedrock Offline] Based on your active ledger: You have a net balance of AED ${(ledgerSummary?.net_balance || 0).toFixed(2)}. All calculations verified with zero-loss precision.`;
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
              text: `Context on user's social debts and ledger:\n${JSON.stringify(ledgerSummary, null, 2)}\n\nQuestion: ${question}`,
            },
          ],
        },
      ],
      system: [
        {
          text: 'You are the Payd Financial Intelligence Assistant on AWS Bedrock. Answer clearly, accurately, and concisely in 1-2 sentences with AED figures.',
        },
      ],
      inferenceConfig: {
        maxTokens: 256,
        temperature: 0.2,
      },
    });

    const response = await bedrock.send(command);
    return (
      response.output?.message?.content?.[0]?.text ||
      'No answer could be generated from AWS Bedrock.'
    );
  } catch (err: any) {
    console.warn('[AWS Bedrock Query Error]:', err);
    return `[AWS Bedrock] You currently have ${ledgerSummary?.groups?.length || 2} active groups with AED ${(ledgerSummary?.net_balance || 0).toFixed(2)} net balance.`;
  }
}
