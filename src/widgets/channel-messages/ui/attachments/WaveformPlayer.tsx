/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WaveformPlayer.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 14:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 14:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * audio-type attachment → the WhatsApp green voice bubble: play/pause toggle,
 * waveform bars (flex divs) from metadata.waveform, a seek-on-click track, and
 * elapsed/total time, and the 1× → 1.5× → 2× speed pill. The bytes are
 * membership-gated, so the hidden audio src is the authed object URL; until it
 * arrives the play button waits, and when the server cannot serve it (or serves
 * bytes the browser cannot decode) the button becomes a retry instead of a
 * silent no-op.
 */

import React, { useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';

import type { Attachment } from '@/shared/chat/messageApi';

import { useAuthedObject } from './useAuthedObjectUrl';

interface WaveformPlayerProps {
  attachment: Attachment;
}

const FALLBACK_BARS = [4, 9, 6, 12, 7, 14, 8, 5, 11, 6, 13, 7, 10, 5, 9, 6, 12, 8, 4, 10];

export const PLAYBACK_RATES = [1, 1.5, 2] as const;

export function nextPlaybackRate(rate: number): number {
  const index = PLAYBACK_RATES.indexOf(rate as (typeof PLAYBACK_RATES)[number]);
  return PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length];
}

const ROUND_BUTTON =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--osio-accent-fg)]/15 hover:bg-[var(--osio-accent-fg)]/25 disabled:opacity-60';

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function WaveformBars({ samples, progress, onSeek }: Readonly<{
  samples: number[];
  progress: number;
  onSeek: (ratio: number) => void;
}>) {
  const peak = Math.max(1, ...samples);
  return (
    <button
      type="button"
      aria-label="Seek voice message"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onSeek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
      }}
      className="flex h-8 flex-1 items-center gap-[2px]"
    >
      {samples.map((value, index) => {
        const played = index / samples.length <= progress;
        return (
          <span
            key={index}
            style={{ height: `${Math.max(12, (value / peak) * 100)}%` }}
            className={`w-[3px] shrink-0 rounded-full ${played ? 'bg-[var(--osio-accent-fg)]' : 'bg-[var(--osio-accent-fg)]/40'}`}
          />
        );
      })}
    </button>
  );
}

export const WaveformPlayer: React.FC<WaveformPlayerProps> = ({ attachment }) => {
  const { src, failed, retry } = useAuthedObject(attachment.url);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<number>(PLAYBACK_RATES[0]);
  const [undecodable, setUndecodable] = useState(false);
  const unavailable = failed || undecodable;
  const [elapsed, setElapsed] = useState(0);
  const [loadedDuration, setLoadedDuration] = useState(0);

  const durationMs = attachment.metadata?.durationMs;
  const total = durationMs ? durationMs / 1000 : loadedDuration;
  const samples = attachment.metadata?.waveform?.length ? attachment.metadata.waveform : FALLBACK_BARS;
  const progress = total > 0 ? Math.min(1, elapsed / total) : 0;

  return (
    <div className="mt-1 flex max-w-md items-center gap-3 rounded-2xl bg-[var(--osio-accent)] px-3 py-2 text-[var(--osio-accent-fg)]">
      {unavailable ? (
        <button
          type="button"
          aria-label="Retry loading voice message"
          title="This voice message could not be loaded"
          onClick={() => { setUndecodable(false); retry(); }}
          className={ROUND_BUTTON}
        >
          <RotateCcw size={18} />
        </button>
      ) : (
        <button
          type="button"
          aria-label={playing ? 'Pause voice message' : 'Play voice message'}
          aria-busy={!src}
          disabled={!src}
          onClick={() => {
            const el = audioRef.current;
            if (!el) return;
            if (el.paused) { void el.play(); } else { el.pause(); }
          }}
          className={ROUND_BUTTON}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
      )}
      <WaveformBars
        samples={samples}
        progress={progress}
        onSeek={(ratio) => { if (audioRef.current && total > 0) audioRef.current.currentTime = ratio * total; }}
      />
      <span className="shrink-0 text-xs tabular-nums">{unavailable ? 'Unavailable' : formatClock(playing || elapsed ? elapsed : total)}</span>
      {!unavailable && (
        <button
          type="button"
          aria-label={`Playback speed ${rate}×`}
          onClick={() => {
            const next = nextPlaybackRate(rate);
            setRate(next);
            if (audioRef.current) audioRef.current.playbackRate = next;
          }}
          className="h-6 shrink-0 rounded-full bg-[var(--osio-accent-fg)]/15 px-2 text-xs font-medium tabular-nums hover:bg-[var(--osio-accent-fg)]/25"
        >
          {rate}×
        </button>
      )}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          event.currentTarget.playbackRate = rate;
          const d = event.currentTarget.duration;
          if (Number.isFinite(d)) setLoadedDuration(d);
        }}
        onError={() => { if (src) setUndecodable(true); }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setElapsed(0); }}
        onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
        className="hidden"
      >
        <track kind="captions" />
      </audio>
    </div>
  );
};
