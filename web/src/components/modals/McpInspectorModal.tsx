'use client';

import React, { useState } from 'react';
import {
  X,
  Cpu,
  Play,
  Check,
  Copy,
  Terminal,
  Layers,
  Sparkles,
  ShieldCheck,
  Code2,
  ExternalLink,
} from 'lucide-react';

interface McpInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AVAILABLE_TOOLS = [
  {
    id: 'payd_get_balances',
    name: 'payd_get_balances',
    summary: 'Retrieve net balances, who owes whom, and total outstanding debt in AED.',
    defaultParams: { groupId: 'Dubai Flatmates' },
  },
  {
    id: 'payd_simplify_debts',
    name: 'payd_simplify_debts',
    summary: 'Run greedy min-cash-flow graph solver to collapse circular group debts into minimal settlements.',
    defaultParams: { groupId: 'Dubai Flatmates' },
  },
  {
    id: 'payd_add_expense',
    name: 'payd_add_expense',
    summary: 'Record an expense into the ledger with strict integer minor units and zero-loss invariant validation.',
    defaultParams: {
      title: 'Dinner at Al Safadi DIFC',
      amount_aed: 260.0,
      payer_name: 'Manan',
      group_name: 'Dubai Flatmates',
    },
  },
  {
    id: 'payd_check_reimbursement_lag',
    name: 'payd_check_reimbursement_lag',
    summary: 'Analyze friend repayment turnaround lag index (Speedy ⚡ / Average ⏱️ / Lagging 🐢) and exposure.',
    defaultParams: {},
  },
  {
    id: 'payd_spin_coffee_roulette',
    name: 'payd_spin_coffee_roulette',
    summary: 'Run Fair Payer Roulette to decide who covers coffee or lunch based on debt weights.',
    defaultParams: { amount_aed: 45.0, mode: 'debt_weighted' },
  },
  {
    id: 'payd_trigger_recurring_split',
    name: 'payd_trigger_recurring_split',
    summary: 'Trigger an automated monthly recurring subscription split (Du 5G Wi-Fi, DEWA, etc.).',
    defaultParams: { subscription_name: 'Du 5G Home High-Speed Wi-Fi' },
  },
];

export function McpInspectorModal({ isOpen, onClose }: McpInspectorModalProps) {
  const [activeTab, setActiveTab] = useState<'playground' | 'config' | 'resources'>('playground');
  const [selectedToolId, setSelectedToolId] = useState(AVAILABLE_TOOLS[0].id);
  const [requestParams, setRequestParams] = useState(
    JSON.stringify(AVAILABLE_TOOLS[0].defaultParams, null, 2)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [responseJson, setResponseJson] = useState<any>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isOpen) return null;

  const currentTool = AVAILABLE_TOOLS.find((t) => t.id === selectedToolId) || AVAILABLE_TOOLS[0];

  const handleSelectTool = (tool: (typeof AVAILABLE_TOOLS)[0]) => {
    setSelectedToolId(tool.id);
    setRequestParams(JSON.stringify(tool.defaultParams, null, 2));
    setResponseJson(null);
  };

  const handleExecuteTool = async () => {
    setIsLoading(true);
    setResponseJson(null);

    let parsedArgs = {};
    try {
      parsedArgs = JSON.parse(requestParams);
    } catch {
      setResponseJson({ error: 'Invalid JSON in tool arguments' });
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: selectedToolId,
            arguments: parsedArgs,
          },
        }),
      });

      const data = await res.json();
      setResponseJson(data);
    } catch (err: any) {
      setResponseJson({ error: err.message || 'Failed to call MCP endpoint' });
    } finally {
      setIsLoading(false);
    }
  };

  const clientConfigSnippet = `{
  "mcpServers": {
    "payd": {
      "command": "node",
      "args": ["/Users/user/Desktop/payd/web/scripts/mcp-server.mjs"]
    }
  }
}`;

  const handleCopyConfig = () => {
    navigator.clipboard.writeText(clientConfigSnippet);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-[#18181b] border border-white/10 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4 text-white font-body">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-500 text-white shadow-md shadow-cyan-500/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-sm text-white">
                  PAYD MODEL CONTEXT PROTOCOL (MCP)
                </h3>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-heading tracking-wider flex items-center gap-1 border border-emerald-500/30">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  SERVER ACTIVE
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-body">
                JSON-RPC 2.0 Agentic tools powering Claude, Cursor, and Gemini integrations
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-full text-zinc-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-slate-100 dark:bg-slate-850 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('playground')}
            className={`flex-1 py-1.5 rounded-lg transition flex items-center justify-center gap-1.5 ${
              activeTab === 'playground'
                ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs font-bold'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Tools Playground</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`flex-1 py-1.5 rounded-lg transition flex items-center justify-center gap-1.5 ${
              activeTab === 'config'
                ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs font-bold'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Claude Desktop & Cursor Config</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('resources')}
            className={`flex-1 py-1.5 rounded-lg transition flex items-center justify-center gap-1.5 ${
              activeTab === 'resources'
                ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs font-bold'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Resources</span>
          </button>
        </div>

        {/* TAB 1: Tools Playground */}
        {activeTab === 'playground' && (
          <div className="space-y-4">
            {/* Tool Selection Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {AVAILABLE_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => handleSelectTool(tool)}
                  className={`p-2.5 rounded-xl text-left border transition flex flex-col justify-between ${
                    selectedToolId === tool.id
                      ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-700 dark:text-cyan-400'
                      : 'bg-slate-50 dark:bg-slate-850/60 border-slate-200/60 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <span className="text-xs font-bold font-mono truncate">{tool.name}</span>
                  <span className="text-[10px] text-slate-400 line-clamp-1 mt-1 font-sans">
                    {tool.summary}
                  </span>
                </button>
              ))}
            </div>

            {/* Selected Tool Details & Parameter Editor */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {/* Left Column: Request parameters */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    Input Parameters (JSON)
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">tools/call</span>
                </div>

                <textarea
                  value={requestParams}
                  onChange={(e) => setRequestParams(e.target.value)}
                  rows={8}
                  className="w-full font-mono text-xs p-3 rounded-2xl bg-slate-950 text-emerald-400 border border-slate-800 focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none shadow-inner"
                />

                <button
                  type="button"
                  onClick={handleExecuteTool}
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-cyan-600/25 transition disabled:opacity-50"
                >
                  <Play className={`w-3.5 h-3.5 fill-current ${isLoading ? 'animate-pulse' : ''}`} />
                  <span>{isLoading ? 'Executing JSON-RPC...' : `Execute ${currentTool.name}`}</span>
                </button>
              </div>

              {/* Right Column: Live JSON-RPC Response */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    Live Response (JSON-RPC 2.0)
                  </span>
                  <span className="text-[10px] text-emerald-500 font-semibold">
                    {responseJson ? '200 OK' : 'Awaiting request'}
                  </span>
                </div>

                <pre className="font-mono text-[11px] p-3 rounded-2xl bg-slate-950 text-slate-200 border border-slate-800 h-44 overflow-auto whitespace-pre-wrap shadow-inner leading-relaxed">
                  {responseJson
                    ? JSON.stringify(responseJson, null, 2)
                    : '// Click Execute to send standard JSON-RPC 2.0 tool call to /api/mcp'}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Config */}
        {activeTab === 'config' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Add Payd to your <strong>Claude Desktop</strong> or <strong>Cursor</strong> configuration to enable AI agents to natively manage your finances, split bills, and check balances.
            </p>

            <div className="relative">
              <pre className="font-mono text-xs p-4 rounded-2xl bg-slate-950 text-cyan-400 border border-slate-800 overflow-x-auto shadow-inner">
                {clientConfigSnippet}
              </pre>

              <button
                type="button"
                onClick={handleCopyConfig}
                className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied!' : 'Copy Config'}</span>
              </button>
            </div>

            <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl text-xs text-cyan-700 dark:text-cyan-300 space-y-1">
              <span className="font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" /> Zero-Trust Stdio Communication
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                The MCP server communicates locally through stdin/stdout without sending private personal financial records to external third-party servers.
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: Resources */}
        {activeTab === 'resources' && (
          <div className="space-y-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Registered MCP Resources
            </span>

            <div className="space-y-2">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                    payd://ledger/summary
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
                    application/json
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Full aggregate financial snapshot: net savings, income, burn rate, and member balances.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                    payd://groups/roster
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
                    application/json
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Active shared groups, member IDs, and currency definitions across Dubai and GCC.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
