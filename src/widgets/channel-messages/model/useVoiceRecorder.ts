/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useVoiceRecorder.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Voice recorder with a real record → pause/resume → stop sequence. MediaRecorder
 * captures audio/webm;opus; an AudioContext analyser feeds a LIVE waveform — the
 * `samples` array is the real per-~90ms amplitude envelope of the voice (a
 * scrolling window), so the bars track tonality like a hardware recorder, not a
 * decorative animation. The timer is pause-aware (paused time is excluded). stop()
 * resolves the blob + active durationMs + decode-time peaks for the preview/upload.
 */

import { useCallback, useRef, useState } from 'react';

import { computePeaks } from './computePeaks';

export interface VoiceResult {
  blob: Blob;
  durationMs: number;
  peaks: number[];
}

export type RecorderStatus = 'idle' | 'recording' | 'paused';

const MIME = 'audio/webm;codecs=opus';
const SAMPLE_EVERY_MS = 90;
const MAX_BARS = 56;

export function useVoiceRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [samples, setSamples] = useState<number[]>([]);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const analyser = useRef<AnalyserNode | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const baseMs = useRef(0);      // active ms accumulated before the current segment
  const segStart = useRef(0);    // Date.now() of the current active segment (0 = paused)
  const lastSample = useRef(0);

  const teardown = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    void audioCtx.current?.close().catch(() => undefined);
    stream.current = null;
    analyser.current = null;
    audioCtx.current = null;
    setStatus('idle');
  }, []);

  // Self-scheduling RAF loop (declared so it is never referenced before declaration):
  // advances the pause-aware clock and pushes the real mic amplitude into `samples`.
  const tick = useCallback(function tick() {
    setElapsedMs(baseMs.current + (Date.now() - segStart.current));
    const node = analyser.current;
    let peak = 0;
    if (node) {
      const buf = new Uint8Array(node.frequencyBinCount);
      node.getByteTimeDomainData(buf);
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
    }
    const now = Date.now();
    if (now - lastSample.current >= SAMPLE_EVERY_MS) {
      lastSample.current = now;
      setSamples((prev) => (prev.length >= MAX_BARS ? [...prev.slice(1), peak] : [...prev, peak]));
    }
    raf.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async () => {
    const media = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.current = media;
    const ctx = new AudioContext();
    audioCtx.current = ctx;
    const node = ctx.createAnalyser();
    node.fftSize = 256;
    ctx.createMediaStreamSource(media).connect(node);
    analyser.current = node;
    chunks.current = [];
    const mime = MediaRecorder.isTypeSupported(MIME) ? MIME : '';
    const rec = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    recorder.current = rec;
    rec.start();
    baseMs.current = 0;
    segStart.current = Date.now();
    lastSample.current = 0;
    setSamples([]);
    setElapsedMs(0);
    setStatus('recording');
    raf.current = requestAnimationFrame(tick);
  }, [tick]);

  const pause = useCallback(() => {
    const rec = recorder.current;
    if (rec?.state !== 'recording') return;
    rec.pause();
    baseMs.current += Date.now() - segStart.current;
    segStart.current = 0;
    cancelAnimationFrame(raf.current);
    setStatus('paused');
  }, []);

  const resume = useCallback(() => {
    const rec = recorder.current;
    if (rec?.state !== 'paused') return;
    rec.resume();
    segStart.current = Date.now();
    setStatus('recording');
    raf.current = requestAnimationFrame(tick);
  }, [tick]);

  const stop = useCallback(
    () =>
      new Promise<VoiceResult | null>((resolve) => {
        const rec = recorder.current;
        if (!rec || rec.state === 'inactive') { teardown(); resolve(null); return; }
        const durationMs = baseMs.current + (segStart.current ? Date.now() - segStart.current : 0);
        rec.onstop = async () => {
          const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
          teardown();
          const peaks = await computePeaks(blob);
          resolve({ blob, durationMs, peaks });
        };
        rec.stop();
      }),
    [teardown],
  );

  const cancel = useCallback(() => {
    const rec = recorder.current;
    if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); }
    teardown();
  }, [teardown]);

  return { status, elapsedMs, samples, start, pause, resume, stop, cancel };
}
