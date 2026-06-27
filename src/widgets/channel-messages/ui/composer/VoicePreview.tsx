/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   VoicePreview.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Review step after Stop: play the just-recorded clip back (real peaks waveform
 * with playback progress) and then Send or Discard. Progress is driven off the
 * recorder's measured duration, not the webm blob's (opus duration is unreliable).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Check, Pause, Play, Trash2 } from 'lucide-react';

import { WaveBars } from './WaveBars';
import type { VoiceResult } from '../../model/useVoiceRecorder';

interface VoicePreviewProps {
  result: VoiceResult;
  onSend: () => void;
  onDiscard: () => void;
}

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export const VoicePreview: React.FC<VoicePreviewProps> = ({ result, onSend, onDiscard }) => {
  const [url] = useState(() => URL.createObjectURL(result.blob));
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const seconds = result.durationMs / 1000 || 1;

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play(); else audio.pause();
  };

  return (
    <div className="flex w-full items-center gap-3 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setProgress(Math.min(1, e.currentTarget.currentTime / seconds))}
        onEnded={() => { setPlaying(false); setProgress(0); }}
      />
      <button
        type="button"
        onClick={onDiscard}
        aria-label="Discard recording"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--osio-fg-muted)] hover:text-[var(--osio-danger)]"
      >
        <Trash2 size={16} />
      </button>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause playback' : 'Play recording'}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--osio-border-default)] text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]"
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <WaveBars values={result.peaks} progress={progress} />
      <span className="shrink-0 text-sm tabular-nums text-[var(--osio-fg-default)]">{formatClock(result.durationMs)}</span>
      <button
        type="button"
        onClick={onSend}
        aria-label="Send voice message"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] hover:opacity-90"
      >
        <Check size={16} />
      </button>
    </div>
  );
};
