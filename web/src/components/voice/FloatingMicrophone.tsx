'use client';

import React, { useState, useRef, useEffect } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { VoiceIntent } from '@/lib/ai/gemini';
import { VoiceWaveform } from './VoiceWaveform';
import { ConfirmationCard } from './ConfirmationCard';
import { ClarificationCard } from './ClarificationCard';
import { formatMinorUnits } from '@/lib/ledger';
import { Mic, MicOff, Sparkles, Keyboard, Send, Bot, X, Volume2, Camera } from 'lucide-react';

interface FloatingMicrophoneProps {
  onOpenReceiptScanner?: () => void;
}

export function FloatingMicrophone({ onOpenReceiptScanner }: FloatingMicrophoneProps = {}) {
  const {
    currentUser,
    users,
    groups,
    categories,
    userNetBalance,
    userOwedToMe,
    userIOwe,
    userSpending,
    budgets,
  } = usePayd();

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTypedInput, setShowTypedInput] = useState(false);
  const [typedCommand, setTypedCommand] = useState('');

  // Flow cards
  const [activeIntent, setActiveIntent] = useState<VoiceIntent | null>(null);
  const [needsClarification, setNeedsClarification] = useState(false);
  const [aiQueryAnswer, setAiQueryAnswer] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);

  // Initialize Web Speech API if supported
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setIsRecording(true);
          setInterimTranscript('');
        };

        recognition.onresult = (event: any) => {
          let currentInterim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcriptText = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              setTranscript(transcriptText);
              processTranscript(transcriptText);
            } else {
              currentInterim += transcriptText;
            }
          }
          setInterimTranscript(currentInterim);
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition error:', event.error);
          setIsRecording(false);
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, [currentUser, users, groups, categories]);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          recognitionRef.current.stop();
          setTimeout(() => recognitionRef.current?.start(), 150);
        }
      } else {
        // Fallback to typed input if Web Speech is not available
        setShowTypedInput(true);
      }
    }
  };

  const processTranscript = async (rawTranscript: string) => {
    if (!rawTranscript.trim()) return;
    setIsProcessing(true);
    setTranscript(rawTranscript);

    try {
      // Build context for Gemini/Voice parser
      const context = {
        currentUser: {
          id: currentUser.id,
          name: currentUser.name,
          currency: currentUser.default_currency,
        },
        knownMembers: users.map((u) => ({ id: u.id, name: u.name })),
        groups: groups.map((g) => ({ id: g.id, name: g.name })),
        categories: categories.map((c) => c.name),
      };

      const res = await fetch('/api/ai/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: rawTranscript, context }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to interpret speech');
      }

      const intent: VoiceIntent = data.intent;

      // Handle Query vs Action
      if (intent.intent === 'query') {
        await handleFinancialQuery(rawTranscript);
      } else if (intent.missing_fields && intent.missing_fields.length > 0) {
        setActiveIntent(intent);
        setNeedsClarification(true);
      } else {
        setActiveIntent(intent);
        setNeedsClarification(false);
      }
    } catch (err: any) {
      console.error('Error processing transcript:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Deterministic query aggregation handler
  const handleFinancialQuery = async (queryText: string) => {
    const monthlyBudget = budgets.find(
      (b) => b.user_id === currentUser.id && b.category_id === null
    );

    const dataContext = {
      userNetBalance,
      formattedNet: formatMinorUnits(userNetBalance, currentUser.default_currency),
      formattedOwedToMe: formatMinorUnits(userOwedToMe, currentUser.default_currency),
      formattedIOwe: formatMinorUnits(userIOwe, currentUser.default_currency),
      formattedSpent: formatMinorUnits(userSpending.totalSpentMinor, currentUser.default_currency),
      formattedIncome: formatMinorUnits(userSpending.totalIncomeMinor, currentUser.default_currency),
      formattedBudget: monthlyBudget
        ? formatMinorUnits(monthlyBudget.limit_minor, currentUser.default_currency)
        : 'None set',
      formattedRemaining: monthlyBudget
        ? formatMinorUnits(
            Math.max(0, monthlyBudget.limit_minor - userSpending.totalSpentMinor),
            currentUser.default_currency
          )
        : 'N/A',
      type: queryText.toLowerCase().includes('spend') ? 'monthly_spend' : 'balance_summary',
    };

    try {
      const res = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText, dataContext }),
      });
      const resData = await res.json();
      setAiQueryAnswer(resData.answer || 'Could not fetch answer.');
    } catch (err) {
      setAiQueryAnswer(
        `Your net balance is ${dataContext.formattedNet}. Total spent is ${dataContext.formattedSpent}.`
      );
    }
  };

  const handleClarificationAnswer = (clarifiedText: string) => {
    const combined = `${activeIntent?.notes || ''} ${clarifiedText}`;
    setNeedsClarification(false);
    processTranscript(combined);
  };

  const handleTypedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (typedCommand.trim()) {
      processTranscript(typedCommand.trim());
      setTypedCommand('');
      setShowTypedInput(false);
    }
  };

  return (
    <>
      {/* Active Modal / Slide-up Cards */}
      {(activeIntent || aiQueryAnswer || isRecording || isProcessing || showTypedInput) && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          {/* 1. Live Recording State */}
          {isRecording && (
            <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 shadow-2xl text-center space-y-4">
              <div className="flex justify-between items-center text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Listening...
                </span>
                <button
                  onClick={() => setIsRecording(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <VoiceWaveform isRecording={isRecording} />

              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 min-h-[48px] flex items-center justify-center px-3 italic">
                {interimTranscript || transcript || 'Speak now: "Paid 120 AED for dinner with Rahul split equally"'}
              </p>

              <button
                onClick={toggleRecording}
                className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/30 transition"
              >
                Tap to Finish & Parse
              </button>
            </div>
          )}

          {/* 2. Processing Spinner */}
          {isProcessing && !isRecording && (
            <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-emerald-500 animate-spin" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-white">Interpreting Speech</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Parsing voice intent & applying deterministic ledger rules...
                </p>
              </div>
            </div>
          )}

          {/* 3. Clarification Card */}
          {needsClarification && activeIntent && !isProcessing && (
            <ClarificationCard
              intent={activeIntent}
              onAnswer={handleClarificationAnswer}
              onCancel={() => {
                setActiveIntent(null);
                setNeedsClarification(false);
              }}
            />
          )}

          {/* 4. Confirmation Card */}
          {!needsClarification && activeIntent && !isProcessing && (
            <ConfirmationCard
              intent={activeIntent}
              onConfirm={() => setActiveIntent(null)}
              onCancel={() => setActiveIntent(null)}
            />
          )}

          {/* 5. Deterministic AI Financial Q&A Answer Card */}
          {aiQueryAnswer && !isProcessing && (
            <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-full bg-teal-100 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400">
                    <Bot className="w-4 h-4" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                    Payd Financial Intelligence
                  </span>
                </div>
                <button
                  onClick={() => setAiQueryAnswer(null)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-sm font-medium leading-relaxed">
                {aiQueryAnswer}
              </div>

              <div className="text-[11px] text-slate-400 italic">
                * Answer grounded in real-time ledger calculation. Gemini formats explanations only.
              </div>

              <button
                onClick={() => setAiQueryAnswer(null)}
                className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 text-sm font-semibold transition"
              >
                Close
              </button>
            </div>
          )}

          {/* 6. Typed Fallback Command Input */}
          {showTypedInput && !isProcessing && !activeIntent && !aiQueryAnswer && !isRecording && (
            <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Voice Command (Typed Fallback)
                </span>
                <button
                  onClick={() => setShowTypedInput(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleTypedSubmit} className="space-y-3">
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. Paid 120 AED for dinner with Rahul and Sarah"
                  value={typedCommand}
                  onChange={(e) => setTypedCommand(e.target.value)}
                  className="w-full px-4 py-3 text-sm bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />

                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1.5 overflow-x-auto text-[11px] text-slate-400 py-1">
                    <button
                      type="button"
                      onClick={() => setTypedCommand('Paid 120 AED for dinner with Rahul and Sarah')}
                      className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 rounded-lg whitespace-nowrap transition"
                    >
                      Dinner 120 split
                    </button>
                    <button
                      type="button"
                      onClick={() => setTypedCommand('How much did I spend this week?')}
                      className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 rounded-lg whitespace-nowrap transition"
                    >
                      Spend query
                    </button>
                    <button
                      type="button"
                      onClick={() => setTypedCommand('Rahul paid me back 80 AED')}
                      className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 rounded-lg whitespace-nowrap transition"
                    >
                      Repayment
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-md transition shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Floating Hero Microphone Button (Bottom Right, positioned above BottomNav) */}
      <div className="fixed bottom-20 sm:bottom-8 right-4 sm:right-8 z-40 flex items-center gap-2.5">
        {onOpenReceiptScanner && (
          <button
            onClick={onOpenReceiptScanner}
            className="flex items-center gap-2 p-3.5 sm:px-4 sm:py-3.5 rounded-2xl bg-white dark:bg-slate-850 hover:bg-emerald-50 dark:hover:bg-slate-800 border-2 border-emerald-500/30 hover:border-emerald-500 shadow-xl text-emerald-600 dark:text-emerald-400 hover:scale-105 active:scale-95 transition"
            title="Scan receipt with Payd Lens"
          >
            <Camera className="w-5 h-5" />
            <span className="hidden sm:inline text-xs font-bold">Scan Receipt</span>
          </button>
        )}

        <button
          onClick={() => setShowTypedInput(true)}
          className="p-3 rounded-2xl bg-white dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-750 shadow-xl text-slate-600 dark:text-slate-300 transition"
          title="Type command fallback"
        >
          <Keyboard className="w-5 h-5" />
        </button>

        <button
          onClick={toggleRecording}
          className="group relative flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 text-white shadow-2xl shadow-emerald-500/40 hover:scale-105 active:scale-95 transition-all duration-200"
          title="Hold or tap to speak expense"
        >
          <span className="absolute inset-0 rounded-3xl bg-emerald-400 opacity-20 group-hover:animate-ping" />
          <Mic className="w-7 h-7 relative z-10" />
        </button>
      </div>
    </>
  );
}
