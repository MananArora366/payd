/**
 * Transport-independent JSON-RPC 2.0 dispatcher for the Payd MCP server.
 * The HTTP route parses the body and hands each message here; batches are
 * handled by calling this once per element.
 */

import { callTool, listTools, McpUnknownToolError, MCP_RESOURCES, readResource } from './tools';

export const MCP_PROTOCOL_VERSION = '2024-11-05';
export const SUPPORTED_PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18'];
export const SERVER_INFO = { name: 'payd-mcp', version: '1.1.0' };

export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

type RpcId = string | number | null;

export interface RpcResponse {
  jsonrpc: '2.0';
  id: RpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const rpcError = (id: RpcId, code: number, message: string, data?: unknown): RpcResponse => ({
  jsonrpc: '2.0',
  id,
  error: data === undefined ? { code, message } : { code, message, data },
});

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isValidId = (v: unknown): v is RpcId => v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

/**
 * Handles one JSON-RPC message. Returns the response object, or null when the
 * message is a notification (no `id`) which gets no response.
 */
export async function handleRpcMessage(msg: unknown): Promise<RpcResponse | null> {
  if (!isPlainObject(msg)) return rpcError(null, RPC.INVALID_REQUEST, 'Invalid Request: expected a JSON-RPC object');

  const hasId = Object.prototype.hasOwnProperty.call(msg, 'id');
  const id: RpcId = hasId && isValidId(msg.id) ? msg.id : null;
  if (hasId && !isValidId(msg.id)) return rpcError(null, RPC.INVALID_REQUEST, 'Invalid Request: id must be a string, number or null');
  if (msg.jsonrpc !== '2.0') return rpcError(id, RPC.INVALID_REQUEST, 'Invalid Request: jsonrpc must be "2.0"');
  if (typeof msg.method !== 'string' || !msg.method) return rpcError(id, RPC.INVALID_REQUEST, 'Invalid Request: method must be a non-empty string');
  if (msg.params !== undefined && msg.params !== null && typeof msg.params !== 'object') {
    return rpcError(id, RPC.INVALID_REQUEST, 'Invalid Request: params must be an object or array');
  }

  const method = msg.method;
  const params = isPlainObject(msg.params) ? msg.params : {};

  // Notifications (no id) never get a response, even on error.
  if (!hasId) return null;

  try {
    const result = await dispatch(method, params);
    if ('error' in result) return rpcError(id, result.error.code, result.error.message, result.error.data);
    return { jsonrpc: '2.0', id, result: result.result };
  } catch (err) {
    if (err instanceof McpUnknownToolError) return rpcError(id, RPC.INVALID_PARAMS, err.message);
    console.error('[payd-mcp] internal error handling', method, err);
    return rpcError(id, RPC.INTERNAL_ERROR, 'Internal error');
  }
}

type DispatchResult = { result: unknown } | { error: { code: number; message: string; data?: unknown } };

async function dispatch(method: string, params: Record<string, unknown>): Promise<DispatchResult> {
  switch (method) {
    case 'initialize': {
      const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : MCP_PROTOCOL_VERSION;
      return {
        result: {
          protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false }, resources: { listChanged: false, subscribe: false } },
          serverInfo: SERVER_INFO,
          instructions:
            'Payd ledger tools read the Payd demo seed ledger; write-style tools return drafts the user confirms in the Payd app. Careem tools are sandbox mocks. Mutating tools need confirmed_by_user: true.',
        },
      };
    }
    case 'ping':
      return { result: {} };
    case 'tools/list':
      return { result: { tools: listTools() } };
    case 'tools/call': {
      if (typeof params.name !== 'string' || !params.name) {
        return { error: { code: RPC.INVALID_PARAMS, message: 'Invalid params: name (tool name) is required' } };
      }
      if (params.arguments !== undefined && params.arguments !== null && !isPlainObject(params.arguments)) {
        return { error: { code: RPC.INVALID_PARAMS, message: 'Invalid params: arguments must be an object' } };
      }
      return { result: await callTool(params.name, params.arguments) };
    }
    case 'resources/list':
      return { result: { resources: MCP_RESOURCES } };
    case 'resources/templates/list':
      return { result: { resourceTemplates: [] } };
    case 'resources/read': {
      if (typeof params.uri !== 'string') return { error: { code: RPC.INVALID_PARAMS, message: 'Invalid params: uri is required' } };
      const contents = readResource(params.uri);
      if (!contents) return { error: { code: RPC.INVALID_PARAMS, message: `Resource not found: ${params.uri}`, data: { uri: params.uri } } };
      return { result: { contents: [contents] } };
    }
    case 'prompts/list':
      return { result: { prompts: [] } };
    default:
      return { error: { code: RPC.METHOD_NOT_FOUND, message: `Method not found: ${method}` } };
  }
}

/**
 * Handles a parsed request body (single message or batch). Returns the body
 * to send, or null when nothing should be sent (all notifications).
 */
export async function handleRpcPayload(payload: unknown): Promise<RpcResponse | RpcResponse[] | null> {
  if (Array.isArray(payload)) {
    if (payload.length === 0) return rpcError(null, RPC.INVALID_REQUEST, 'Invalid Request: empty batch');
    const responses = (await Promise.all(payload.map(handleRpcMessage))).filter((r): r is RpcResponse => r !== null);
    return responses.length ? responses : null;
  }
  return handleRpcMessage(payload);
}
