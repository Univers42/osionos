/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   measure.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

const PERF_LOCAL_STORAGE_KEY = "osio:perf";
const WARN_THRESHOLD_MS = 4;

type MaybePromise<T> = T | Promise<T>;
type ReactProfilerPhase = "mount" | "update" | "nested-update";

interface PerfMetricsState {
  durations: Record<string, number[]>;
  renders: Record<string, number>;
  reactCommits: Array<{
    id: string;
    phase: ReactProfilerPhase;
    actualDuration: number;
    baseDuration: number;
    startTime: number;
    commitTime: number;
  }>;
  eventTimings: Array<{
    name: string;
    duration: number;
    startTime: number;
    processingStart?: number;
    processingEnd?: number;
  }>;
}

const metrics: PerfMetricsState = {
  durations: {},
  renders: {},
  reactCommits: [],
  eventTimings: [],
};

let eventObserverStarted = false;

function isDevBuild(): boolean {
  return (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true;
}

function isPerfFlagEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(PERF_LOCAL_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function warnIfSlow(name: string, durationMs: number) {
  if (durationMs > WARN_THRESHOLD_MS) {
    console.warn(`[perf] ${name}: ${durationMs.toFixed(1)}ms`);
  }
}

function recordDuration(name: string, durationMs: number) {
  metrics.durations[name] = metrics.durations[name] ?? [];
  metrics.durations[name].push(durationMs);
}

function isPromiseLike<T>(value: MaybePromise<T>): value is Promise<T> {
  return typeof (value as Promise<T>)?.then === "function";
}

export function isPerfEnabled(): boolean {
  return isDevBuild() || isPerfFlagEnabled();
}

export function mark(name: string): void {
  if (!isPerfEnabled()) return;
  try {
    globalThis.performance?.mark?.(name);
  } catch {
    // Ignore malformed marks or unsupported performance implementations.
  }
}

export function measure(name: string, startMark?: string, endMark?: string): number | null {
  if (!isPerfEnabled()) return null;

  try {
    const resolvedEndMark = endMark ?? `${name}:end`;
    if (!endMark) {
      globalThis.performance?.mark?.(resolvedEndMark);
    }
    const entry = globalThis.performance?.measure?.(name, startMark, resolvedEndMark);
    const durationMs = entry?.duration ?? null;
    if (typeof durationMs === "number") {
      recordDuration(name, durationMs);
      warnIfSlow(name, durationMs);
    }
    return durationMs;
  } catch {
    return null;
  }
}

export function timed<T>(name: string, fn: () => T): T;
export function timed<T>(name: string, fn: () => Promise<T>): Promise<T>;
export function timed<T>(name: string, fn: () => MaybePromise<T>): MaybePromise<T> {
  if (!isPerfEnabled()) return fn();

  const startedAt = now();
  const finish = () => {
    const durationMs = now() - startedAt;
    recordDuration(name, durationMs);
    warnIfSlow(name, durationMs);
  };

  try {
    const result = fn();
    if (isPromiseLike(result)) {
      return result.finally(finish);
    }
    finish();
    return result;
  } catch (error) {
    finish();
    throw error;
  }
}

export function recordRender(componentName: string): void {
  if (!isPerfEnabled()) return;
  metrics.renders[componentName] = (metrics.renders[componentName] ?? 0) + 1;
}

export function getRenderCount(componentName: string): number {
  return metrics.renders[componentName] ?? 0;
}

export function recordReactCommit(
  id: string,
  phase: ReactProfilerPhase,
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number,
): void {
  if (!isPerfEnabled()) return;
  metrics.reactCommits.push({ id, phase, actualDuration, baseDuration, startTime, commitTime });
}

export function getPerfDurations(name: string): number[] {
  return [...(metrics.durations[name] ?? [])];
}

export function getReactCommitDurations(): number[] {
  return metrics.reactCommits.map((commit) => commit.actualDuration);
}

export function getEventTimingDurations(): number[] {
  return metrics.eventTimings.map((eventTiming) => eventTiming.duration);
}

export function resetPerfMetrics(): void {
  metrics.durations = {};
  metrics.renders = {};
  metrics.reactCommits = [];
  metrics.eventTimings = [];
}

export function startEventTimingCapture(): void {
  if (!isPerfEnabled() || eventObserverStarted || typeof PerformanceObserver === "undefined") return;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const eventEntry = entry as PerformanceEntry & {
          processingStart?: number;
          processingEnd?: number;
        };
        metrics.eventTimings.push({
          name: eventEntry.name,
          duration: eventEntry.duration,
          startTime: eventEntry.startTime,
          processingStart: eventEntry.processingStart,
          processingEnd: eventEntry.processingEnd,
        });
      }
    });
    observer.observe({
      type: "event",
      buffered: true,
      durationThreshold: 0,
    } as PerformanceObserverInit & { durationThreshold: number });
    eventObserverStarted = true;
  } catch {
    eventObserverStarted = true;
  }
}

export function getEventCountsSnapshot(): Record<string, number> {
  const eventCounts = (globalThis.performance as Performance & {
    eventCounts?: Map<string, number>;
  })?.eventCounts;

  if (!eventCounts) return {};
  return Object.fromEntries(eventCounts.entries());
}

export function diffEventCounts(
  before: Record<string, number>,
  after: Record<string, number>,
): Record<string, number> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diff: Record<string, number> = {};
  for (const key of keys) {
    const delta = (after[key] ?? 0) - (before[key] ?? 0);
    if (delta !== 0) diff[key] = delta;
  }
  return diff;
}

export function usedJSHeapSize(): number | null {
  const memory = (globalThis.performance as Performance & {
    memory?: { usedJSHeapSize?: number };
  })?.memory;
  return typeof memory?.usedJSHeapSize === "number" ? memory.usedJSHeapSize : null;
}