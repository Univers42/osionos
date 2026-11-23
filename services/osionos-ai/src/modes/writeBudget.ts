import { BRIDGE_TIMEOUT_MS } from '../approvals/bridge.ts';

/**
 * The write budget of one run (AM9): an auto-claimed write that already went to
 * the bridge must finish and record its outcome even when the run is aborted or
 * times out, so no approval row stays 'executing'.
 *
 * A run claims only while a whole write fits before its deadline, and it waits
 * for every tracked write before its final event.
 *
 * Caveat: the margin covers one append plus one retry plus the record. A bridge
 * slower than BRIDGE_TIMEOUT_MS per call hits its own timeout and the row
 * becomes 'unknown', so it is never left 'executing'. The clock is the caller's
 * `nowMs`: a skewed clock moves the claim cut-off, never the settlement.
 */
export const CLAIM_MARGIN_MS = 2 * BRIDGE_TIMEOUT_MS + 5_000;

export interface RunWriteBudget {
	deadlineAtMs: number;
	aborted(): boolean;
	canClaim(nowMs: number): boolean;
	/** Not tied to the run's AbortSignal: the write settles after an abort. */
	track<T>(write: Promise<T>): Promise<T>;
	settle(): Promise<void>;
}

export function makeWriteBudget(run: { startedAtMs: number; totalMs: number; signal: AbortSignal }): RunWriteBudget {
	const deadlineAtMs = run.startedAtMs + run.totalMs;
	const tracked = new Set<Promise<unknown>>();
	return {
		deadlineAtMs,
		aborted: () => run.signal.aborted,
		canClaim: (nowMs) => !run.signal.aborted && deadlineAtMs - nowMs >= CLAIM_MARGIN_MS,
		track(write) {
			tracked.add(write);
			const forget = (): void => void tracked.delete(write);
			write.then(forget, forget);
			return write;
		},
		async settle() {
			while (tracked.size > 0) await Promise.allSettled([...tracked]);
		},
	};
}
