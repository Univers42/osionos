/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useVoiceRecorder.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Voice recorder with a real record → pause/resume → stop sequence. MediaRecorder
 * captures audio/webm;opus; an AudioContext analyser feeds a LIVE waveform — the
 * `samples` array is the real per-~90ms amplitude envelope of the voice (a
 * scrolling window), so the bars track tonality like a hardware recorder, not a
 * decorative animation. The timer is pause-aware (paused time is excluded). stop()
 * resolves the blob + active durationMs + decode-time peaks for the preview/upload.
 *
 * The recorder itself lives in `voiceRecorderCore.ts` — plain, without React, and
 * shared with the dictation. This hook is its React face.
 *
 * `maxMs` is the cap: the recorder stops itself at it. The voice note passes
 * nothing (its own UI caps the minute); the dictation passes 30 000.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { createVoiceRecorder } from './voiceRecorderCore';
import type { VoiceRecorderCore, VoiceRecorderState } from './voiceRecorderCore';

export type { RecorderStatus, VoiceResult } from './voiceRecorderCore';

export interface VoiceRecorderOptions {
  /** The cap of the recording, in milliseconds. The recorder stops itself at it. */
  maxMs?: number;
  /** The peaks of the preview are computed. The dictation does not need them. */
  peaks?: boolean;
}

const IDLE: VoiceRecorderState = { status: 'idle', elapsedMs: 0, samples: [], capped: false };

export function useVoiceRecorder(options: VoiceRecorderOptions = {}) {
  const [state, setState] = useState<VoiceRecorderState>(IDLE);
  const core = useRef<VoiceRecorderCore | null>(null);
  const maxMs = options.maxMs ?? 0;
  const peaks = options.peaks ?? true;

  // The recorder is created once: a new one on every render would lose the
  // recording in flight.
  if (core.current == null) {
    core.current = createVoiceRecorder({ maxMs, peaks, onState: setState });
  }
  useEffect(() => {
    const recorder = core.current;
    return () => {
      recorder?.cancel();
    };
  }, []);

  const start = useCallback(async () => {
    await core.current?.start();
  }, []);

  const pause = useCallback(() => {
    core.current?.pause();
  }, []);

  const resume = useCallback(() => {
    core.current?.resume();
  }, []);

  const stop = useCallback(() => core.current?.stop() ?? Promise.resolve(null), []);

  const cancel = useCallback(() => {
    core.current?.cancel();
  }, []);

  return { status: state.status, elapsedMs: state.elapsedMs, samples: state.samples, start, pause, resume, stop, cancel };
}
