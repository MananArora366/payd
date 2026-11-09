'use client';

import React from 'react';

interface VoiceWaveformProps {
  isRecording: boolean;
}

export function VoiceWaveform({ isRecording }: VoiceWaveformProps) {
  if (!isRecording) return null;

  return (
    <div className="flex items-center justify-center gap-1.5 h-12 py-2">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
        <span
          key={i}
          className="w-1.5 bg-gradient-to-t from-emerald-500 to-teal-300 rounded-full animate-pulse-wave"
          style={{
            height: `${Math.sin(i * 0.5) * 24 + 28}px`,
            animationDelay: `${(i % 5) * 0.15}s`,
            animationDuration: `${0.8 + (i % 4) * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}
