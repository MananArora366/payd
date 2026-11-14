'use client';

import React from 'react';

interface VoiceWaveformProps {
  isRecording: boolean;
}

export function VoiceWaveform({ isRecording }: VoiceWaveformProps) {
  if (!isRecording) return null;

  // 9-bar equalizer matching PaydIOS/preview/index.html
  const barHeights = [16, 34, 48, 56, 38, 52, 28, 42, 20];
  const barDelays = [0.1, 0.3, 0.15, 0.4, 0.25, 0.35, 0.05, 0.2, 0.45];

  return (
    <div className="py-2 space-y-4">
      {/* Concentric ripple orb */}
      <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
        <span
          className="absolute w-20 h-20 rounded-full border-2 border-silver-400/40 animate-mic-ripple pointer-events-none"
          style={{ animationDelay: '0s' }}
        />
        <span
          className="absolute w-28 h-28 rounded-full border-2 border-silver-400/30 animate-mic-ripple pointer-events-none"
          style={{ animationDelay: '0.5s' }}
        />
        <div className="w-16 h-16 rounded-full bg-silver-100 flex items-center justify-center text-zinc-900 z-10">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
      </div>

      {/* 9-bar equalizer */}
      <div className="flex items-center justify-center gap-1.5 h-14">
        {barHeights.map((height, idx) => (
          <span
            key={idx}
            className="w-1.5 bg-silver-300 rounded-full animate-bar-jump"
            style={{
              height: `${height}px`,
              animationDelay: `${barDelays[idx]}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
