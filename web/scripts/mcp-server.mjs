#!/usr/bin/env node

/**
 * Payd Model Context Protocol (MCP) server over stdio, for Claude Desktop,
 * Cursor and similar clients.
 *
 * This is a thin stdio <-> HTTP bridge. Each newline-delimited JSON-RPC
 * message from stdin is forwarded to the Payd HTTP MCP endpoint
 * (src/app/api/mcp/route.ts), and the reply is written to stdout. The tool
 * set, schemas and validation therefore live in exactly one place
 * (src/lib/mcp/tools.ts), and stdio and HTTP always expose the same tools.
 *
 * Requires the Payd web app to be running (`npm run dev`).
 * Endpoint: PAYD_MCP_URL (default http://127.0.0.1:3000/api/mcp).
 */

import { createInterface } from 'node:readline';

const ENDPOINT = process.env.PAYD_MCP_URL || 'http://127.0.0.1:3000/api/mcp';
const TIMEOUT_MS = Number(process.env.PAYD_MCP_TIMEOUT_MS) || 30_000;

const write = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

/** ids of the request(s) in a message, so bridge failures can be reported against them. */
function requestIds(msg) {
  const list = Array.isArray(msg) ? msg : [msg];
  return list
    .filter((m) => m && typeof m === 'object' && Object.prototype.hasOwnProperty.call(m, 'id'))
    .map((m) => m.id ?? null);
}

async function forward(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    write(rpcError(null, -32700, 'Parse error: message is not valid JSON'));
    return;
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: line,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 202) return; // notification(s) acknowledged, nothing to send
    const text = await res.text();
    if (!text.trim()) return;
    try {
      write(JSON.parse(text));
    } catch {
      for (const id of requestIds(msg)) write(rpcError(id, -32603, `Payd server returned an unexpected response (HTTP ${res.status})`));
    }
  } catch (err) {
    console.error(`[payd-mcp] could not reach ${ENDPOINT}:`, err?.message || err);
    for (const id of requestIds(msg)) {
      write(rpcError(id, -32603, `Payd server is not reachable at ${ENDPOINT}. Start it with "npm run dev".`));
    }
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
let chain = Promise.resolve();

rl.on('line', (line) => {
  if (!line.trim()) return;
  // Keep replies in request order.
  chain = chain.then(() => forward(line));
});

rl.on('close', async () => {
  await chain;
  process.exit(0);
});

console.error(`Payd MCP stdio bridge running -> ${ENDPOINT}`);
