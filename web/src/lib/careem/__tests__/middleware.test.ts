import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { isAllowedOrigin, middleware } from '../../../middleware';

function call(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return middleware(new NextRequest(`http://127.0.0.1:3000${path}`, { method: init.method ?? 'POST', headers: init.headers }));
}
const JSON_CT = { 'content-type': 'application/json' };

describe('isAllowedOrigin', () => {
  it('allows same host and local dev origins, rejects others and "null"', () => {
    expect(isAllowedOrigin('https://abc.ngrok-free.app', ['abc.ngrok-free.app'])).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000', ['x'])).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:3000', [null])).toBe(true);
    expect(isAllowedOrigin('https://evil.example', ['127.0.0.1:3000'])).toBe(false);
    expect(isAllowedOrigin('null', ['127.0.0.1:3000'])).toBe(false);
    expect(isAllowedOrigin('http://localhost:3001', ['127.0.0.1:3000'])).toBe(false);
  });
});

describe('middleware', () => {
  it('403 for a foreign Origin on state-changing requests', () => {
    expect(call('/api/careem/webhook', { headers: { ...JSON_CT, origin: 'https://evil.example' } }).status).toBe(403);
    expect(call('/api/ai/query', { headers: { ...JSON_CT, origin: 'https://evil.example' } }).status).toBe(403);
  });

  it('lets requests without Origin through (curl, MCP clients, careem-mcp webhook)', () => {
    const res = call('/api/careem/webhook', { headers: JSON_CT });
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('lets GETs with a foreign Origin through', () => {
    const res = call('/api/careem/events', { method: 'GET', headers: { origin: 'https://evil.example' } });
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('415 for non-JSON POSTs to /api/ai/* and /api/mcp', () => {
    expect(call('/api/ai/receipt-scan', { headers: { 'content-type': 'text/plain' } }).status).toBe(415);
    expect(call('/api/mcp', { headers: { 'content-type': 'application/x-www-form-urlencoded' } }).status).toBe(415);
    expect(call('/api/mcp').status).toBe(415);
    expect(call('/api/mcp', { headers: { ...JSON_CT, origin: 'http://localhost:3000' } }).headers.get('x-middleware-next')).toBe('1');
  });

  it('JSON 400 for malformed percent-encoding', async () => {
    const res = call('/api/careem/events/%E0%A4%A', { method: 'GET' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false });
  });
});
