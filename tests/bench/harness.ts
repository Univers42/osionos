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

/** One burst on a fresh world: how its events arrive, and when their work is done. */
export interface BurstRun {
  /** Starts the burst; one promise per event, settling in event order. */
  deliver(): readonly Promise<unknown>[];
  /** Resolves once the work the events left queued (a deferred flush) is done too. */
  settled(): Promise<unknown>;
}

/**
 * Async events timed by when each one completes — the gap since the previous one — on a fresh
 * world per run: what a queue drains when a burst lands. The work left after the last event
 * (settled) is charged to the last event. Gated on the p95 per event AND on the whole burst.
 * Ponytail: BURST_RUNS fresh worlds, one untimed warm-up first; the total is the slowest run,
 * GC pauses included (they are real), so a neighbour on the box fails it, never passes it.
 */
export interface BurstCase {
  name: string;
  /** p95 budget per event, in nanoseconds. */
  budgetNs: number;
  /** Budget for one whole burst (the slowest run), in nanoseconds. */
  totalBudgetNs: number;
  /** Builds a fresh world OUTSIDE the timed region. */
  setup: () => Promise<BurstRun>;
}

export interface BenchSuite {
  suite: string;
  cases: readonly (BenchCase | BurstCase)[];
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
  /** Burst cases only: the slowest run's sum of event times, and its budget. */
  totalNs?: number;
  totalBudgetNs?: number;
  ok: boolean;
}

const WARMUP_NS = 100_000_000;
const BATCH_FLOOR_NS = 200_000;
const SAMPLE_BUDGET_NS = 400_000_000;
const MIN_SAMPLES = 30;
const MAX_SAMPLES = 2_000;
const MAX_BATCH = 1 << 20;
const BURST_RUNS = 5;

/** Read by nothing; written by every call so the JIT cannot drop the operation. */
export const blackhole: { sink: unknown } = { sink: undefined };

export function defineBench(suite: string, cases: readonly (BenchCase | BurstCase)[]): BenchSuite {
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

export function isBurst(entry: BenchCase | BurstCase): entry is BurstCase {
  return "totalBudgetNs" in entry;
}

async function timeEvents(run: BurstRun): Promise<number[]> {
  const times: number[] = [];
  let mark = process.hrtime.bigint();
  for (const done of run.deliver()) {
    blackhole.sink = await done;
    const now = process.hrtime.bigint();
    times.push(Number(now - mark));
    mark = now;
  }
  await run.settled();
  if (times.length > 0) times[times.length - 1] += Number(process.hrtime.bigint() - mark);
  return times;
}

/** One untimed warm-up burst, then BURST_RUNS timed ones. O(BURST_RUNS × events). */
export async function measureBurst(entry: BurstCase): Promise<BenchResult> {
  await timeEvents(await entry.setup());
  const perEvent: number[] = [];
  let totalNs = 0;
  for (let run = 0; run < BURST_RUNS; run++) {
    const burst = await entry.setup();
    (globalThis as { gc?: () => void }).gc?.();
    const times = await timeEvents(burst);
    perEvent.push(...times);
    totalNs = Math.max(totalNs, times.reduce((sum, ns) => sum + ns, 0));
  }
  perEvent.sort((a, b) => a - b);
  const p95Ns = percentile(perEvent, 0.95);
  return {
    name: entry.name, medianNs: percentile(perEvent, 0.5), p95Ns, p99Ns: percentile(perEvent, 0.99),
    minNs: perEvent[0] ?? Number.NaN, budgetNs: entry.budgetNs, batch: 1, samples: perEvent.length,
    totalNs, totalBudgetNs: entry.totalBudgetNs, ok: p95Ns <= entry.budgetNs && totalNs <= entry.totalBudgetNs,
  };
}
