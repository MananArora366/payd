'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { usePayd } from '@/lib/store/PaydContext';
import { VoiceIntent } from '@/lib/ai/gemini';
import { VoiceWaveform } from './VoiceWaveform';
import { ConfirmationCard } from './ConfirmationCard';
import { ClarificationCard } from './ClarificationCard';
import { formatMinorUnits, calculateBilateralDebts } from '@/lib/ledger';
import { Mic, MicOff, Loader2, Keyboard, Send, Bot, X, Volume2, Camera } from 'lucide-react';
import { useDialog } from '@/lib/hooks/useDialog';

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
    transactions,
    splits,
    settlements,
    aiEnabled,
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

  const [voiceError, setVoiceError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  // Latest processTranscript, so speech callbacks never use a stale closure.
  const processTranscriptRef = useRef<(text: string) => Promise<boolean>>(async () => false);
  // Full original utterance (notes may be truncated server-side), used for clarification follow-ups.
  const lastTranscriptRef = useRef('');

  const speechErrorMessage = (code: string): string => {
    switch (code) {
      case 'not-allowed':
      case 'service-not-allowed':
        return 'Microphone access is blocked. You can type your request instead.';
      case 'no-speech':
        return "We didn't catch that. Try again, or type your request below.";
      case 'audio-capture':
        return 'No microphone was found. You can type your request instead.';
      case 'network':
        return 'Voice recognition needs a network connection. You can type your request instead.';
      default:
        return 'Voice input is not available right now. You can type your request instead.';
    }
  };

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
              processTranscriptRef.current(transcriptText);
            } else {
              currentInterim += transcriptText;
            }
          }
          setInterimTranscript(currentInterim);
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition error:', event.error);
          setIsRecording(false);
          if (event.error === 'aborted') return;
          setVoiceError(speechErrorMessage(event.error));
          setShowTypedInput(true);
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognitionRef.current = recognition;
      }
    }
    return () => {
      try {
        recognitionRef.current?.abort?.();
      } catch {
        // ignore
      }
    };
  }, []);

  const toggleRecording = () => {
    setVoiceError(null);
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          try {
            recognitionRef.current.stop();
            setTimeout(() => {
              try {
                recognitionRef.current?.start();
              } catch {
                setVoiceError(speechErrorMessage('unavailable'));
                setShowTypedInput(true);
              }
            }, 150);
          } catch {
            setVoiceError(speechErrorMessage('unavailable'));
            setShowTypedInput(true);
          }
        }
      } else {
        // Fallback to typed input if Web Speech is not available
        setVoiceError('Voice input is not supported in this browser. Type your request instead.');
        setShowTypedInput(true);
      }
    }
  };

  /** Returns true when the request was understood and a card was shown. */
  const processTranscript = async (rawTranscript: string): Promise<boolean> => {
    if (!rawTranscript.trim()) return false;
    setIsProcessing(true);
    setVoiceError(null);
    setTranscript(rawTranscript);
    lastTranscriptRef.current = rawTranscript;

    try {
      // Build context for Gemini/Voice parser
      const context = {
        currentUser: {
          id: currentUser.id,
          name: currentUser.name,
          currency: 'AED',
        },
        knownMembers: users.map((u) => ({ id: u.id, name: u.name })),
        groups: groups.map((g) => ({ id: g.id, name: g.name })),
        categories: categories.map((c) => c.name),
      };

      const res = await fetch('/api/ai/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: rawTranscript, context, aiEnabled }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data.intent) {
        throw new Error(data?.error || 'Failed to interpret speech');
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
      return true;
    } catch (err: any) {
      console.error('Error processing transcript:', err);
      const tooLong = rawTranscript.length > 2000;
      setVoiceError(
        tooLong
          ? 'That request is too long. Please keep it under 2,000 characters.'
          : "Sorry, we couldn't understand that just now. Check the text below and try again."
      );
      // Keep the text so the user can edit and resend it.
      setTypedCommand(rawTranscript);
      setShowTypedInput(true);
      return false;
    } finally {
      setIsProcessing(false);
    }
  };
  processTranscriptRef.current = processTranscript;

  // Per-person balances (positive: they owe me) and top spending categories for Q&A.
  const queryInsights = useMemo(() => {
    const people: { name: string; netMinor: number }[] = [];
    try {
      const bilateral = calculateBilateralDebts(transactions, splits, settlements);
      for (const u of users) {
        if (u.id === currentUser.id) continue;
        const theyOweMe = bilateral.get(u.id)?.get(currentUser.id) || 0;
        const iOweThem = bilateral.get(currentUser.id)?.get(u.id) || 0;
        const netMinor = theyOweMe - iOweThem;
        if (netMinor !== 0) people.push({ name: u.name, netMinor });
      }
    } catch (err) {
      console.warn('Could not compute per-person balances for Q&A:', err);
    }

    const txById = new Map(transactions.map((t) => [t.id, t]));
    const catNameById = new Map(categories.map((c) => [c.id, c.name]));
    const byCategory = new Map<string, number>();
    for (const sp of splits) {
      if (sp.user_id !== currentUser.id) continue;
      const tx = txById.get(sp.transaction_id);
      if (!tx || tx.deleted_at || tx.type !== 'expense') continue;
      const name = (tx.category_id && catNameById.get(tx.category_id)) || 'Other';
      byCategory.set(name, (byCategory.get(name) || 0) + sp.share_minor);
    }
    const topCategories = [...byCategory.entries()]
      .map(([name, spentMinor]) => ({ name, spentMinor }))
      .sort((a, b) => b.spentMinor - a.spentMinor)
      .slice(0, 5);

    return { people: people.slice(0, 50), topCategories };
  }, [transactions, splits, settlements, users, categories, currentUser.id]);

  // Deterministic query aggregation handler
  const handleFinancialQuery = async (queryText: string) => {
    const monthlyBudget = budgets.find(
      (b) => b.user_id === currentUser.id && b.category_id === null
    );

    const dataContext = {
      currency: 'AED',
      userNetBalance,
      owedToMeMinor: userOwedToMe,
      iOweMinor: userIOwe,
      spentMinor: userSpending.totalSpentMinor,
      incomeMinor: userSpending.totalIncomeMinor,
      budgetMinor: monthlyBudget ? monthlyBudget.limit_minor : null,
      people: queryInsights.people,
      topCategories: queryInsights.topCategories,
      formattedNet: formatMinorUnits(userNetBalance, 'AED'),
      formattedOwedToMe: formatMinorUnits(userOwedToMe, 'AED'),
      formattedIOwe: formatMinorUnits(userIOwe, 'AED'),
      formattedSpent: formatMinorUnits(userSpending.totalSpentMinor, 'AED'),
      formattedIncome: formatMinorUnits(userSpending.totalIncomeMinor, 'AED'),
      formattedBudget: monthlyBudget
        ? formatMinorUnits(monthlyBudget.limit_minor, 'AED')
        : 'None set',
      formattedRemaining: monthlyBudget
        ? formatMinorUnits(
            Math.max(0, monthlyBudget.limit_minor - userSpending.totalSpentMinor),
            'AED'
          )
        : 'N/A',
      type: queryText.toLowerCase().includes('spend') ? 'monthly_spend' : 'balance_summary',
    };

    try {
      const res = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText, dataContext, aiEnabled }),
      });
      const resData = await res.json().catch(() => null);
      if (!res.ok || !resData?.answer) throw new Error(resData?.error || 'Query failed');
      setAiQueryAnswer(resData.answer);
    } catch (err) {
      setAiQueryAnswer(
        `Your net balance is ${dataContext.formattedNet}. Total spent is ${dataContext.formattedSpent}.`
      );
    }
  };

  const handleClarificationAnswer = (clarifiedText: string) => {
    const combined = `${lastTranscriptRef.current || activeIntent?.notes || ''} ${clarifiedText}`.trim();
    setNeedsClarification(false);
    processTranscript(combined);
  };

  const handleTypedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = typedCommand.trim();
    if (!text) return;
    if (text.length > 2000) {
      setVoiceError('That request is too long. Please keep it under 2,000 characters.');
      return;
    }
    const ok = await processTranscript(text);
    if (ok) {
      setTypedCommand('');
      setShowTypedInput(false);
    }
  };

  const overlayOpen = Boolean(activeIntent || aiQueryAnswer || isRecording || isProcessing || showTypedInput);
  // Esc dismisses whatever card is showing (not while a request is in flight).
  const { dialogProps } = useDialog(overlayOpen, () => {
    if (isProcessing) return;
    if (isRecording) {
      try {
        recognitionRef.current?.abort?.();
      } catch {
        // ignore
      }
      setIsRecording(false);
    }
    setAiQueryAnswer(null);
    setActiveIntent(null);
    setNeedsClarification(false);
    setShowTypedInput(false);
    setVoiceError(null);
  });

  return (
    <>
      {/* Active Modal / Slide-up Cards */}
      {overlayOpen && (
        <div {...dialogProps} aria-labelledby={undefined} aria-label="Payd voice assistant" className="focus:outline-none fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
          {/* 1. Live Recording State matching iOS Waveform Sheet */}
          {isRecording && (
            <div className="w-full max-w-md bg-[#18181b] border border-silver-500/40 rounded-2xl p-6 shadow-2xl text-center space-y-4 animate-in slide-in-from-bottom-6">
              <div className="flex justify-between items-center text-xs font-heading text-silver-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-silver-400 animate-ping" />
                  Listening...
                </span>
                <button
                  onClick={() => {
                    try {
                      recognitionRef.current?.abort?.();
                    } catch {
                      // ignore
                    }
                    setIsRecording(false);
                  }}
                  aria-label="Stop listening"
                  className="p-1 rounded-full text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <VoiceWaveform isRecording={isRecording} />

              <p className="text-sm font-body text-zinc-200 min-h-[48px] flex items-center justify-center px-3 italic">
                {interimTranscript || transcript || 'Speak now: "Paid 120 AED for dinner with Prakarsh split equally"'}
              </p>

              <button
                onClick={toggleRecording}
                className="w-full py-3.5 rounded-2xl bg-silver-100 hover:bg-white text-zinc-900 font-semibold text-sm transition active:scale-95"
              >
                Tap when you're done
              </button>

              <button
                type="button"
                onClick={() => {
                  try {
                    recognitionRef.current?.abort?.();
                  } catch {
                    // ignore
                  }
                  setIsRecording(false);
                  setShowTypedInput(true);
                }}
                className="w-full py-2 text-xs text-zinc-400 hover:text-white font-body flex items-center justify-center gap-1.5"
              >
                <Keyboard className="w-3.5 h-3.5" />
                Type instead
              </button>
            </div>
          )}

          {/* 2. Processing Spinner */}
          {isProcessing && !isRecording && (
            <div className="w-full max-w-sm bg-[#18181b] border border-white/10 rounded-2xl p-6 shadow-2xl text-center space-y-4 animate-in zoom-in-95">
              <div className="w-12 h-12 mx-auto rounded-full bg-silver-500/15 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-silver-300 animate-spin" />
              </div>
              <div>
                <h4 className="font-heading text-sm text-white">Interpreting Speech</h4>
                <p className="text-xs text-zinc-400 mt-1 font-body">
                  Working out the details…
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
            <div className="w-full max-w-md bg-[#18181b] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between pb-2 border-b border-white/8">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-full bg-silver-500/20 text-silver-400">
                    <Bot className="w-4 h-4" />
                  </span>
                  <span className="text-sm font-semibold text-silver-400">
                    Payd Financial Intelligence
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAiQueryAnswer(null)}
                  aria-label="Close answer"
                  className="p-1 rounded-full text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-[#27272a]/60 border border-white/8 text-zinc-200 text-sm font-body leading-relaxed">
                {aiQueryAnswer}
              </div>

              <div className="text-[11px] text-zinc-400 italic">
                * Answer grounded in real-time ledger calculation. Gemini formats explanations only.
              </div>

              <button
                onClick={() => setAiQueryAnswer(null)}
                className="w-full py-2.5 rounded-xl bg-[#27272a] hover:bg-[#3f3f46] text-white text-sm font-semibold transition"
              >
                Close
              </button>
            </div>
          )}

          {/* 6. Typed Fallback Command Input */}
          {showTypedInput && !isProcessing && !activeIntent && !aiQueryAnswer && !isRecording && (
            <div className="w-full max-w-md bg-[#18181b] border border-white/10 rounded-2xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-silver-400">
                  Type instead
                </span>
                <button
                  onClick={() => {
                    setShowTypedInput(false);
                    setVoiceError(null);
                  }}
                  aria-label="Close typed input"
                  className="p-1 rounded-full text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {voiceError && (
                <div role="alert" className="p-3 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl font-body">
                  {voiceError}
                </div>
              )}

              <form onSubmit={handleTypedSubmit} className="space-y-3">
                <input
                  type="text"
                  autoFocus
                  maxLength={2000}
                  aria-label="Type your request"
                  placeholder="e.g. Paid 120 AED for dinner with Prakarsh and Veer"
                  value={typedCommand}
                  onChange={(e) => setTypedCommand(e.target.value)}
                  className="w-full px-4 py-3 text-sm bg-[#09090b] border border-white/10 rounded-2xl text-white focus:outline-none focus:border-silver-500 font-body placeholder:text-zinc-600"
                />

                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1.5 overflow-x-auto text-[11px] text-zinc-400 py-1">
                    <button
                      type="button"
                      onClick={() => setTypedCommand('Paid 120 AED for dinner with Prakarsh and Veer')}
                      className="px-2.5 py-1 bg-[#27272a] hover:bg-silver-600/30 text-zinc-300 rounded-lg whitespace-nowrap transition text-[11px]"
                    >
                      Dinner 120 split
                    </button>
                    <button
                      type="button"
                      onClick={() => setTypedCommand('How much did I spend this week?')}
                      className="px-2.5 py-1 bg-[#27272a] hover:bg-silver-600/30 text-zinc-300 rounded-lg whitespace-nowrap transition text-[11px]"
                    >
                      Spend query
                    </button>
                    <button
                      type="button"
                      onClick={() => setTypedCommand('Prakarsh paid me back 80 AED')}
                      className="px-2.5 py-1 bg-[#27272a] hover:bg-silver-600/30 text-zinc-300 rounded-lg whitespace-nowrap transition text-[11px]"
                    >
                      Repayment
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="p-3 rounded-xl bg-silver-600 hover:bg-silver-500 text-white font-medium transition shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Floating Action Trigger for Keyboard fallback & hidden DOM hook for BottomNav Center FAB */}
      <button
        id="payd-voice-mic-trigger"
        onClick={toggleRecording}
        className="hidden"
        aria-hidden="true"
      />

      <div className="fixed bottom-24 right-4 z-30 flex items-center gap-2">
        <button
          onClick={() => {
            setVoiceError(null);
            setShowTypedInput(true);
          }}
          aria-label="Type instead of speaking"
          className="p-3 rounded-2xl bg-[#18181b] hover:bg-[#27272a] border border-white/10 shadow-xl text-zinc-300 transition hover:border-silver-500/40"
          title="Type instead of speaking"
        >
          <Keyboard className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}
