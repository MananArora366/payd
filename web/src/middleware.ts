// API request hygiene for /api/*:
// - State-changing requests that carry a foreign Origin are rejected (403). Requests without an
//   Origin header (server-to-server, curl, MCP clients, the careem-mcp webhook) are allowed;
//   browsers always send Origin on cross-origin POSTs, so this blocks cross-site forms/fetches.
// - POSTs to /api/ai/* and /api/mcp must be JSON (415), so `text/plain` "simple requests" can't
//   reach them without a CORS preflight.
// - Malformed percent-encoding in the path gets a JSON 400 instead of an HTML error page.

import { NextResponse, type NextRequest } from 'next/server';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DEV_ORIGIN_HOSTS = new Set(['localhost:3000', '127.0.0.1:3000']);

function json(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** True if `origin` (an Origin header value) is this app, or the local dev server. */
export function isAllowedOrigin(origin: string, requestHosts: Array<string | null | undefined>): boolean {
  let host: string;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    host = u.host.toLowerCase();
  } catch {
    return false; // includes the opaque "null" origin
  }
  if (DEV_ORIGIN_HOSTS.has(host)) return true;
  return requestHosts.some((h) => !!h && h.split(',')[0].trim().toLowerCase() === host);
}

export function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const mime = contentType.split(';')[0].trim().toLowerCase();
  return mime === 'application/json' || (mime.startsWith('application/') && mime.endsWith('+json'));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  try {
    decodeURIComponent(pathname);
  } catch {
    return json(400, 'Malformed URL encoding');
  }

  const method = req.method.toUpperCase();
  if (!STATE_CHANGING.has(method)) return NextResponse.next();

  const origin = req.headers.get('origin');
  if (origin !== null) {
    const hosts = [req.headers.get('host'), req.headers.get('x-forwarded-host'), req.nextUrl.host];
    if (!isAllowedOrigin(origin, hosts)) return json(403, 'Cross-origin request blocked');
  }

  const needsJson = pathname === '/api/mcp' || pathname.startsWith('/api/ai/');
  if (needsJson && method === 'POST' && !isJsonContentType(req.headers.get('content-type'))) {
    return json(415, 'Content-Type must be application/json');
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
