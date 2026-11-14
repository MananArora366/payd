import { z } from 'zod';
import type { InterpretContext } from './gemini';

/** Max characters accepted for a transcript or query. */
export const MAX_TEXT_LENGTH = 2000;
/** Max raw request body size accepted by the AI routes (bytes, approx. chars). */
export const MAX_BODY_BYTES = 64 * 1024;
/** Max serialized size of the query dataContext forwarded to a model. */
export const MAX_DATA_CONTEXT_CHARS = 16 * 1024;

export const DEFAULT_INTERPRET_CONTEXT: InterpretContext = {
  currentUser: { id: '11111111-1111-1111-1111-111111111111', name: 'Manan Arora', currency: 'AED' },
  knownMembers: [
    { id: '11111111-1111-1111-1111-111111111111', name: 'Manan Arora' },
    { id: '22222222-2222-2222-2222-222222222222', name: 'Prakarsh Thakur' },
    { id: '33333333-3333-3333-3333-333333333333', name: 'Veer Nanwani' },
    { id: '44444444-4444-4444-4444-444444444444', name: 'Aisha Rahman' },
    { id: '55555555-5555-5555-5555-555555555555', name: 'Omar Haddad' },
    { id: '66666666-6666-6666-6666-666666666666', name: 'Zara Kapoor' },
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

const shortString = z.string().trim().min(1).max(100);
const entity = z.object({ id: z.string().max(100), name: shortString });

const InterpretContextInput = z.object({
  currentUser: z
    .object({ id: z.string().max(100), name: shortString, currency: z.string().max(10).optional() })
    .optional(),
  knownMembers: z.array(entity).max(200).optional(),
  groups: z.array(entity).max(200).optional(),
  categories: z.array(shortString).max(100).optional(),
});

export type RequestError = { ok: false; status: number; error: string };

/**
 * Reads a JSON request body defensively: requires application/json, caps size,
 * and turns malformed or empty bodies into 400s instead of 500s.
 */
export async function readJsonBody(req: Request): Promise<{ ok: true; body: Record<string, unknown> } | RequestError> {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return { ok: false, status: 400, error: 'Content-Type must be application/json' };
  }
  const declared = Number(req.headers.get('content-length') || '0');
  if (declared > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: 'Request body too large' };
  }
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { ok: false, status: 400, error: 'Could not read request body' };
  }
  if (raw.length > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: 'Request body too large' };
  }
  if (!raw.trim()) {
    return { ok: false, status: 400, error: 'Request body is empty' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, status: 400, error: 'Request body is not valid JSON' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, status: 400, error: 'Request body must be a JSON object' };
  }
  return { ok: true, body: parsed as Record<string, unknown> };
}

/** Validates a transcript/query field: non-empty string, max MAX_TEXT_LENGTH chars. */
export function validateText(value: unknown, field: string): { ok: true; text: string } | RequestError {
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, status: 400, error: `Missing ${field} string` };
  }
  if (value.length > MAX_TEXT_LENGTH) {
    return { ok: false, status: 400, error: `${field} is too long (max ${MAX_TEXT_LENGTH} characters)` };
  }
  return { ok: true, text: value.trim() };
}

/** Validates the interpret context. Missing parts fall back to defaults; wrong types are a 400. */
export function validateInterpretContext(value: unknown): { ok: true; context: InterpretContext } | RequestError {
  if (value === undefined || value === null) {
    return { ok: true, context: DEFAULT_INTERPRET_CONTEXT };
  }
  const parsed = InterpretContextInput.safeParse(value);
  if (!parsed.success) {
    return { ok: false, status: 400, error: 'Invalid context' };
  }
  const c = parsed.data;
  const d = DEFAULT_INTERPRET_CONTEXT;
  return {
    ok: true,
    context: {
      currentUser: c.currentUser
        ? { id: c.currentUser.id, name: c.currentUser.name, currency: 'AED' }
        : d.currentUser,
      knownMembers: c.knownMembers ?? d.knownMembers,
      groups: c.groups ?? d.groups,
      categories: c.categories && c.categories.length > 0 ? c.categories : d.categories,
    },
  };
}

/** Validates the query dataContext: optional plain object with a bounded serialized size. */
export function validateDataContext(value: unknown): { ok: true; dataContext: Record<string, unknown> } | RequestError {
  if (value === undefined || value === null) return { ok: true, dataContext: {} };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, status: 400, error: 'dataContext must be an object' };
  }
  if (JSON.stringify(value).length > MAX_DATA_CONTEXT_CHARS) {
    return { ok: false, status: 400, error: 'dataContext is too large' };
  }
  return { ok: true, dataContext: value as Record<string, unknown> };
}

/**
 * The user's "AI features" setting. A request can only opt OUT of AI; it can never
 * turn AI on when the server has it disabled (BEDROCK_ENABLED / GEMINI_API_KEY).
 */
export function aiAllowedByUser(body: Record<string, unknown>): boolean {
  return body.aiEnabled !== false;
}
