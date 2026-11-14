'use client';

import React, { useState } from 'react';
import { VoiceIntent } from '@/lib/ai/gemini';
import { HelpCircle, ArrowRight, X, Mic } from 'lucide-react';

interface ClarificationCardProps {
  intent: VoiceIntent;
  onAnswer: (clarifiedText: string) => void;
  onCancel: () => void;
}

export function ClarificationCard({ intent, onAnswer, onCancel }: ClarificationCardProps) {
  const [answer, setAnswer] = useState('');

  const question =
    intent.clarification_question ||
    (intent.missing_fields.includes('amount')
      ? 'How much was the expense amount?'
      : intent.missing_fields.includes('participants')
      ? 'Who would you like to split this with?'
      : 'Could you please clarify the details?');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (answer.trim()) {
      onAnswer(answer.trim());
    }
  };

  return (
    <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800/60 rounded-2xl p-5 shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
            <HelpCircle className="w-4 h-4" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Need Quick Clarification
          </span>
        </div>
        <button
          onClick={onCancel}
          className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-900 dark:text-white">{question}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 italic">
          Original voice command: &quot;{intent.notes}&quot;
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            autoFocus
            placeholder="e.g. 150 dirhams with Veer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            className="flex-1 px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="submit"
            className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-md transition"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>

      <div className="flex justify-end pt-1">
        <button
          onClick={onCancel}
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
        >
          Cancel voice command
        </button>
      </div>
    </div>
  );
}
