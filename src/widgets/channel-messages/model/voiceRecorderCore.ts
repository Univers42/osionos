/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   voiceRecorderCore.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The recorder, without React.
 *
 * The voice note and the dictation share it: the same record → pause/resume →
 * stop sequence, the same live waveform, the same pause-aware clock. The only
 * difference is the cap — the dictation stops itself at 30 s, the voice note
 * passes nothing and is capped by its own UI.
 *
 * The browser APIs are injected, so a test can drive the recorder with fake
 * timers and a fake microphone, and the cap is proved without waiting.
 */

import { computePeaks } from './computePeaks';

export type RecorderStatus = 'idle' | 'recording' | 'paused';

export interface VoiceResult {
  blob: Blob;
  durationMs: number;
  peaks: number[];
}

export interface VoiceRecorderState {
  status: RecorderStatus;
  /** The active time, in milliseconds: the paused time is not counted. */
  elapsedMs: number;
  /** The live amplitude envelope, one value per ~90 ms. */
  samples: number[];
  /** The cap fired: the recording stopped by itself. */
  capped: boolean;
}

/** The browser APIs the recorder uses — a test injects its own. */
export interface VoiceRecorderEnv {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createAudioContext(): AudioContext;
  createMediaRecorder(stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder;
  isTypeSupported(type: string): boolean;
  now(): number;
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface VoiceRecorderOptions {
  /** The cap of the recording, in milliseconds. 0 = no cap. */
  maxMs?: number;
  /** The state changed: the React hook renders it, the store keeps it. */
  onState?: (state: VoiceRecorderState) => void;
  /** The browser APIs, partly overridden. */
  env?: Partial<VoiceRecorderEnv>;
  /** The peaks of the preview are computed. The dictation does not need them. */
  peaks?: boolean;
}

/** The recorder itself: start, pause, resume, stop, cancel. */
export interface VoiceRecorderCore {
  readonly state: VoiceRecorderState;
  /** The last recording: the one the cap stopped is kept, so it is not lost. */
  readonly lastResult: VoiceResult | null;
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): Promise<VoiceResult | null>;
  cancel(): void;
}

const MIME = 'audio/webm;codecs=opus';
const SAMPLE_EVERY_MS = 90;
const MAX_BARS = 56;

/** The browser APIs, as they are. */
const DEFAULT_ENV: VoiceRecorderEnv = {
  getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  createAudioContext: () => new AudioContext(),
  createMediaRecorder: (stream, options) => new MediaRecorder(stream, options),
  isTypeSupported: (type) => MediaRecorder.isTypeSupported(type),
  now: () => Date.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** The recorder: the same sequence as before, without React around it. */
export function createVoiceRecorder(options: VoiceRecorderOptions = {}): VoiceRecorderCore {
  const env: VoiceRecorderEnv = { ...DEFAULT_ENV, ...(options.env ?? {}) };
  const maxMs = options.maxMs ?? 0;
  const wantPeaks = options.peaks ?? true;

  let status: RecorderStatus = 'idle';
  let elapsedMs = 0;
  let samples: number[] = [];
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let stream: MediaStream | null = null;
  let raf = 0;
  let analyser: AnalyserNode | null = null;
  let audioCtx: AudioContext | null = null;
  let baseMs = 0;
  let segStart = 0;
  let lastSample = 0;
  let capTimer: unknown = null;
  let capLeft = maxMs;
  let capped = false;
  let lastResult: VoiceResult | null = null;

  /** The state, and the listener of it. */
  const publish = () => options.onState?.({ status, elapsedMs, samples: [...samples], capped });

  /** The active time of the recording. */
  const activeMs = () => baseMs + (segStart ? env.now() - segStart : 0);

  /** The cap: the timer that stops the recorder. */
  const armCap = () => {
    if (maxMs <= 0) return;
    capTimer = env.setTimer(() => {
      capTimer = null;
      capped = true;
      void stop();
    }, Math.max(0, capLeft));
  };

  /** The cap is released: the recording continues, or it is over. */
  const releaseCap = () => {
    if (capTimer === null) return;
    env.clearTimer(capTimer);
    capTimer = null;
  };

  const teardown = () => {
    env.cancelFrame(raf);
    releaseCap();
    stream?.getTracks().forEach((track) => track.stop());
    void audioCtx?.close().catch(() => undefined);
    stream = null;
    analyser = null;
    audioCtx = null;
    status = 'idle';
    publish();
  };

  /** The loop: the clock of the recording, and the live waveform. */
  const tick = () => {
    elapsedMs = activeMs();
    const node = analyser;
    let peak = 0;
    if (node) {
      const buffer = new Uint8Array(node.fftSize);
      node.getByteTimeDomainData(buffer);
      for (const value of buffer) peak = Math.max(peak, Math.abs(value - 128) / 128);
    }
    const now = env.now();
    if (now - lastSample >= SAMPLE_EVERY_MS) {
      lastSample = now;
      samples = samples.length >= MAX_BARS ? [...samples.slice(1), peak] : [...samples, peak];
    }
    publish();
    raf = env.requestFrame(tick);
  };

  const start = async () => {
    const media = await env.getUserMedia({ audio: true });
    stream = media;
    const ctx = env.createAudioContext();
    audioCtx = ctx;
    // The browser creates the context suspended under the autoplay policy, and
    // the gesture window is gone by then: the meter would read the silent
    // midline. The resume is best-effort — the recording works either way.
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        /* the meter stays flat; the recording still works */
      }
    }
    const node = ctx.createAnalyser();
    node.fftSize = 256;
    ctx.createMediaStreamSource(media).connect(node);
    analyser = node;
    chunks = [];
    const mime = env.isTypeSupported(MIME) ? MIME : '';
    const mediaRecorder = env.createMediaRecorder(media, mime ? { mimeType: mime } : undefined);
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder = mediaRecorder;
    mediaRecorder.start();
    baseMs = 0;
    segStart = env.now();
    lastSample = 0;
    samples = [];
    elapsedMs = 0;
    status = 'recording';
    capLeft = maxMs;
    capped = false;
    publish();
    raf = env.requestFrame(tick);
    armCap();
  };

  const pause = () => {
    const media = recorder;
    if (!media || media.state !== 'recording') return;
    media.pause();
    baseMs += env.now() - segStart;
    segStart = 0;
    env.cancelFrame(raf);
    releaseCap();
    capLeft = Math.max(0, maxMs - baseMs);
    status = 'paused';
    publish();
  };

  const resume = () => {
    const media = recorder;
    if (!media || media.state !== 'paused') return;
    media.resume();
    segStart = env.now();
    status = 'recording';
    publish();
    raf = env.requestFrame(tick);
    armCap();
  };

  const stop = (): Promise<VoiceResult | null> => {
    const media = recorder;
    if (!media || media.state === 'inactive') {
      // The recording is already over: the cap stopped it, and its audio is
      // kept, so the caller does not lose it.
      if (lastResult) return Promise.resolve(lastResult);
      teardown();
      return Promise.resolve(null);
    }
    const durationMs = activeMs();
    return new Promise<VoiceResult | null>((resolve) => {
      media.onstop = async () => {
        const blob = new Blob(chunks, { type: media.mimeType || 'audio/webm' });
        const peaks = wantPeaks ? await computePeaks(blob) : [];
        lastResult = { blob, durationMs, peaks };
        teardown();
        resolve(lastResult);
      };
      media.stop();
    });
  };

  const cancel = () => {
    const media = recorder;
    if (media && media.state !== 'inactive') {
      media.onstop = null;
      media.stop();
    }
    teardown();
  };

  return {
    get state() {
      return { status, elapsedMs, samples: [...samples], capped };
    },
    get lastResult() {
      return lastResult;
    },
    start,
    pause,
    resume,
    stop,
    cancel,
  };
}
