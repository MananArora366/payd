import { NextRequest, NextResponse } from 'next/server';
import { listTools, MCP_RESOURCES } from '@/lib/mcp/tools';
import {
  handleRpcPayload,
  rpcError,
  RPC,
  MCP_PROTOCOL_VERSION,
  SERVER_INFO,
  type RpcResponse,
} from '@/lib/mcp/jsonrpc';

/**
 * Payd MCP over HTTP (JSON-RPC 2.0, single message or batch).
 * Tool definitions, schemas and validation live in src/lib/mcp/tools.ts;
 * the stdio server (scripts/mcp-server.mjs) proxies to this endpoint.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Maximum accepted request body (1 MB). */
const MAX_BODY_BYTES = 1024 * 1024;

export async function GET() {
  const tools = listTools();
  return NextResponse.json({
    status: 'online',
    protocol: 'Model Context Protocol (MCP)',
    specVersion: MCP_PROTOCOL_VERSION,
    server: {
      ...SERVER_INFO,
      description: 'Model Context Protocol server for Payd Social Financial Ledger & Tracker',
    },
    capabilities: {
      tools: { listChanged: false },
      resources: { listChanged: false, subscribe: false },
    },
    toolCount: tools.length,
    resourceCount: MCP_RESOURCES.length,
    tools,
    resources: MCP_RESOURCES,
    endpoint: '/api/mcp',
    transport: 'POST JSON-RPC 2.0 to this endpoint (single object or batch array).',
  });
}

/** Reads the body as text, giving up once it exceeds MAX_BODY_BYTES. Returns null when too large. */
async function readBodyCapped(req: NextRequest): Promise<string | null> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function POST(req: NextRequest) {
  let text: string | null;
  try {
    text = await readBodyCapped(req);
  } catch {
    return NextResponse.json(rpcError(null, RPC.PARSE_ERROR, 'Parse error: could not read request body'), { status: 400 });
  }
  if (text === null) {
    return NextResponse.json(rpcError(null, RPC.INVALID_REQUEST, 'Request body too large (limit 1 MB)'), { status: 413 });
  }

  let payload: unknown;
  try {
    if (!text.trim()) throw new Error('empty');
    payload = JSON.parse(text);
  } catch {
    return NextResponse.json(rpcError(null, RPC.PARSE_ERROR, 'Parse error: request body is not valid JSON'), { status: 400 });
  }

  let response: RpcResponse | RpcResponse[] | null;
  try {
    response = await handleRpcPayload(payload);
  } catch (err) {
    console.error('[payd-mcp] unexpected error', err);
    return NextResponse.json(rpcError(null, RPC.INTERNAL_ERROR, 'Internal error'), { status: 500 });
  }

  // Only notifications: acknowledged with no body.
  if (response === null) return new NextResponse(null, { status: 202 });

  const status = !Array.isArray(response) && response.error?.code === RPC.INVALID_REQUEST ? 400 : 200;
  return NextResponse.json(response, { status });
}
