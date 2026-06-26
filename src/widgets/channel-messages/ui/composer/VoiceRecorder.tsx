/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   VoiceRecorder.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Voice capture flow: record → pause/resume → stop → review → send. While
 * recording, a live real-amplitude waveform (WaveBars over the recorder's
 * `samples`) tracks the voice tonality; Stop hands off to VoicePreview for
 * playback before the deliberate Send. Hard-capped at one minute.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Pause, Square, Trash2 } from 'lucide-react';

import { useToastStore } from '@/shared/ui/primitives/useToastStore';
import { useVoiceRecorder, type VoiceResult } from '../../model/useVoiceRecorder';
import { VoicePreview } from './VoicePreview';
import { WaveBars } from './WaveBars';

interface VoiceRecorderProps {
  onComplete: (result: VoiceResult) => void;
  onCancel: () => void;
}

const MAX_MS = 60_000; // voice notes are capped at one minute

/** Map a getUserMedia rejection to actionable guidance (usually a blocked permission). */
function micErrorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access is blocked — allow it via the camera/mic icon in your browser’s address bar, then retry.';
  }
  if (name === 'NotFoundError') return 'No microphone was found. Connect one and try again.';
  if (name === 'NotReadableError') return 'Your microphone is in use by another app. Close it and retry.';
  return 'Could not start recording. Check your browser’s microphone permission for this site.';
}

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const ICON_BTN =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]';

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onComplete, onCancel }) => {
  const { status, elapsedMs, samples, start, pause, resume, stop, cancel } = useVoiceRecorder();
  const [preview, setPreview] = useState<VoiceResult | null>(null);
  const stoppingRef = useRef(false);

  const handleStop = useCallback(async () => {
    if (stoppingRef.current) return; // guard the cap + button racing each other
    stoppingRef.current = true;
    const result = await stop();
    if (result && result.blob.size > 0) setPreview(result);
    else onCancel();
  }, [stop, onCancel]);

  useEffect(() => {
    void start().catch((err: unknown) => {
      useToastStore.getState().push({ kind: 'error', title: 'Microphone unavailable', description: micErrorMessage(err) });
      onCancel();
    });
    return () => cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hard one-minute cap — finalize to the review step.
  useEffect(() => {
    if (elapsedMs >= MAX_MS && status === 'recording') void handleStop();
  }, [elapsedMs, status, handleStop]);

  if (preview) {
    return <VoicePreview result={preview} onSend={() => onComplete(preview)} onDiscard={() => { cancel(); onCancel(); }} />;
  }

  return (
    <div className="flex w-full items-center gap-3 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2">
      <button type="button" onClick={() => { cancel(); onCancel(); }} aria-label="Cancel recording"
        className={`${ICON_BTN} hover:text-[var(--osio-danger)]`}>
        <Trash2 size={16} />
      </button>
      <span className="shrink-0 text-sm tabular-nums text-[var(--osio-fg-default)]">
        {formatClock(elapsedMs)} <span className="text-[var(--osio-fg-subtle)]">/ 1:00</span>
      </span>
      <WaveBars values={samples} />
      {status === 'paused' ? (
        <button type="button" onClick={resume} aria-label="Resume recording" className={ICON_BTN}>
          <Mic size={16} />
        </button>
      ) : (
        <button type="button" onClick={pause} aria-label="Pause recording" className={ICON_BTN}>
          <Pause size={16} />
        </button>
      )}
      <button type="button" onClick={handleStop} aria-label="Stop and review"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] hover:opacity-90">
        <Square size={16} />
      </button>
    </div>
  );
};
