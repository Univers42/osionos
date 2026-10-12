/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   harness.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Zero-dependency micro-benchmark harness (node:test has no bench mode; a library for ~100 lines
 * is a dependency we do not need). Per case: warm up, calibrate a batch so one timed sample lasts
 * ≥ BATCH_FLOOR_NS (the hrtime read then costs < 1 % of it), collect per-op times, gate on p95.
 *
 * Ponytail: numbers come from a shared dev box inside Docker. A neighbour (another gate, an agent)
 * inflates p95 → a false budget failure, never a false pass; re-run before acting on one red case.
 * Budgets are set at ~3× the measured baseline, so only a regression of that order fails.
 * Ponytail: a batch mean hides per-call outliers below the batch size (a 1-in-1000 slow call in
 * a 4096-call batch moves the mean by ~0.1 %) — p99 here is of batch means, not of single calls.
 */

export interface BenchCase {
  name: string;
  /** p95 budget per operation, in nanoseconds. */
  budgetNs: number;
  /** Builds inputs OUTSIDE the timed region and returns the operation to time. */
  setup: () => () => unknown;
}

export interface BenchSuite {
  suite: string;
  cases: readonly BenchCase[];
}

export interface BenchResult {
  name: string;
  medianNs: number;
  p95Ns: number;
  p99Ns: number;
  minNs: number;
  budgetNs: number;
  batch: number;
  samples: number;
  ok: boolean;
}

const WARMUP_NS = 100_000_000;
const BATCH_FLOOR_NS = 200_000;
const SAMPLE_BUDGET_NS = 400_000_000;
const MIN_SAMPLES = 30;
const MAX_SAMPLES = 2_000;
const MAX_BATCH = 1 << 20;

/** Read by nothing; written by every call so the JIT cannot drop the operation. */
export const blackhole: { sink: unknown } = { sink: undefined };

export function defineBench(suite: string, cases: readonly BenchCase[]): BenchSuite {
  return { suite, cases };
}

function timeBatch(op: () => unknown, batch: number): number {
  const start = process.hrtime.bigint();
  for (let i = 0; i < batch; i++) blackhole.sink = op();
  return Number(process.hrtime.bigint() - start);
}

/** Smallest power-of-two batch whose run lasts ≥ BATCH_FLOOR_NS. O(log batch) timed runs. */
function calibrate(op: () => unknown): number {
  let batch = 1;
  while (batch < MAX_BATCH && timeBatch(op, batch) < BATCH_FLOOR_NS) batch *= 2;
  return batch;
}

function warmUp(op: () => unknown): void {
  const end = process.hrtime.bigint() + BigInt(WARMUP_NS);
  let runs = 0;
  while (runs < 10 || process.hrtime.bigint() < end) {
    blackhole.sink = op();
    runs++;
  }
}

function percentile(sorted: readonly number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? Number.NaN;
}

/** Measures one case. Time is bounded by WARMUP + calibration + max(SAMPLE_BUDGET, 30 samples). */
export function measure(entry: BenchCase): BenchResult {
  const op = entry.setup();
  const gc = (globalThis as { gc?: () => void }).gc;
  gc?.();
  warmUp(op);
  const batch = calibrate(op);
  const perOp: number[] = [];
  let spent = 0;
  while (perOp.length < MAX_SAMPLES && (perOp.length < MIN_SAMPLES || spent < SAMPLE_BUDGET_NS)) {
    const elapsed = timeBatch(op, batch);
    spent += elapsed;
    perOp.push(elapsed / batch);
  }
  perOp.sort((a, b) => a - b);
  const p95Ns = percentile(perOp, 0.95);
  return {
    name: entry.name,
    medianNs: percentile(perOp, 0.5),
    p95Ns,
    p99Ns: percentile(perOp, 0.99),
    minNs: perOp[0] ?? Number.NaN,
    budgetNs: entry.budgetNs,
    batch,
    samples: perOp.length,
    ok: p95Ns <= entry.budgetNs,
  };
}

export function formatNs(ns: number): string {
  if (ns < 1_000) return `${ns.toFixed(1)} ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(2)} µs`;
  return `${(ns / 1_000_000).toFixed(2)} ms`;
}
