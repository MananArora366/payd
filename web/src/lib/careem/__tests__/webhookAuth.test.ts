import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WEBHOOK_SECRET,
  MAX_WEBHOOK_BODY_BYTES,
  getWebhookSecret,
  guardWebhookRequest,
  isJsonContentType,
  secretsMatch,
} from '../webhookAuth';

const URL_ = 'http://127.0.0.1:3000/api/careem/webhook';

function req(body: string | undefined, headers: Record<string, string> = {}) {
  return new Request(URL_, { method: 'POST', headers, body });
}
const GOOD = { 'content-type': 'application/json', 'x-payd-webhook-secret': 's3cret' };

describe('webhook secret', () => {
  it('defaults to the shared local dev secret', () => {
    expect(getWebhookSecret({})).toBe(DEFAULT_WEBHOOK_SECRET);
    expect(getWebhookSecret({ PAYD_WEBHOOK_SECRET: '' })).toBe('payd-local-dev-secret');
    expect(getWebhookSecret({ PAYD_WEBHOOK_SECRET: 'abc' })).toBe('abc');
  });

  it('secretsMatch compares exactly, including length differences', () => {
    expect(secretsMatch('abc', 'abc')).toBe(true);
    expect(secretsMatch('abd', 'abc')).toBe(false);
    expect(secretsMatch('abcd', 'abc')).toBe(false);
    expect(secretsMatch('', 'abc')).toBe(false);
    expect(secretsMatch(null, 'abc')).toBe(false);
    expect(secretsMatch('abc', '')).toBe(false);
  });
});

describe('isJsonContentType', () => {
  it('accepts application/json with params and +json types only', () => {
    expect(isJsonContentType('application/json')).toBe(true);
    expect(isJsonContentType('Application/JSON; charset=utf-8')).toBe(true);
    expect(isJsonContentType('application/cloudevents+json')).toBe(true);
    expect(isJsonContentType('text/plain')).toBe(false);
    expect(isJsonContentType('application/x-www-form-urlencoded')).toBe(false);
    expect(isJsonContentType(null)).toBe(false);
  });
});

describe('guardWebhookRequest', () => {
  it('401 without or with a wrong secret (checked before anything else)', async () => {
    expect(await guardWebhookRequest(req('{}', { 'content-type': 'text/plain' }), { secret: 's3cret' })).toMatchObject({ ok: false, status: 401 });
    expect(await guardWebhookRequest(req('{}', { ...GOOD, 'x-payd-webhook-secret': 'nope' }), { secret: 's3cret' })).toMatchObject({ ok: false, status: 401 });
  });

  it('415 for non-JSON content types', async () => {
    const r = req('{}', { ...GOOD, 'content-type': 'text/plain' });
    expect(await guardWebhookRequest(r, { secret: 's3cret' })).toMatchObject({ ok: false, status: 415 });
  });

  it('413 when the body exceeds the cap', async () => {
    const big = JSON.stringify({ pad: 'x'.repeat(MAX_WEBHOOK_BODY_BYTES) });
    expect(await guardWebhookRequest(req(big, GOOD), { secret: 's3cret' })).toMatchObject({ ok: false, status: 413 });
    expect(await guardWebhookRequest(req('{"a":12345}', GOOD), { secret: 's3cret', maxBytes: 5 })).toMatchObject({ ok: false, status: 413 });
  });

  it('400 for invalid JSON', async () => {
    expect(await guardWebhookRequest(req('{nope', GOOD), { secret: 's3cret' })).toMatchObject({ ok: false, status: 400 });
  });

  it('returns the parsed body when everything checks out (empty body → undefined)', async () => {
    expect(await guardWebhookRequest(req('{"id":"evt_1"}', GOOD), { secret: 's3cret' })).toEqual({ ok: true, body: { id: 'evt_1' } });
    expect(await guardWebhookRequest(req(undefined, GOOD), { secret: 's3cret' })).toEqual({ ok: true, body: undefined });
  });
});
