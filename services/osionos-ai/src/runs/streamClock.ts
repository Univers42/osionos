/**
 * The stall clock of a stream: what counts as "the model is alive".
 *
 * Only content parts end the wait for a step's first part. `start`,
 * `start-step`, `raw` and metadata frames arrive before the model has said
 * anything, so a slow-to-start model is not mistaken for a live one, nor
 * killed by the idle window meant for a model that is mid-answer (FA15).
 *
 * Caveat: any content part resets the idle window, so a model that streams one
 * byte every 29 s survives until the total clock of the pump ends the run.
 */

/** The window for the first content part of a step. */
export const FIRST_PART_TIMEOUT_MS = 90_000;
/** The whole failover chain waits at most this long for first parts (FA17). */
export const CHAIN_FIRST_PART_BUDGET_MS = 150_000;

const CONTENT_PARTS = new Set(['text-delta', 'reasoning-delta', 'tool-input-start', 'tool-call']);

export interface Timers {
	setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
	clearTimeout: (id: ReturnType<typeof setTimeout> | undefined) => void;
	now: () => number;
}

const REAL_TIMERS: Timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id), now: () => Date.now() };

/** What attempt n may wait for its first part: the window, or what the chain has left. */
export function firstPartBudgetMs(chainStartedAt: number, now: number): number {
	return Math.max(0, Math.min(FIRST_PART_TIMEOUT_MS, CHAIN_FIRST_PART_BUDGET_MS - (now - chainStartedAt)));
}

export function createStreamClock(opts: { onTimeout: () => void; firstPartMs: number; idleMs: number; timers?: Timers }) {
	const timers = opts.timers ?? REAL_TIMERS;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let contentSeen = false;
	let awaitingFirst = true;
	const arm = (ms: number) => {
		timers.clearTimeout(timer);
		timer = timers.setTimeout(opts.onTimeout, ms);
	};
	arm(opts.firstPartMs);
	return {
		onPart(type: string): void {
			if (type === 'start-step') {
				// The first step keeps the window it already runs (it carries the
				// chain's remaining budget); later steps get a full one (FA16).
				if (contentSeen) arm(FIRST_PART_TIMEOUT_MS);
				awaitingFirst = true;
			} else if (CONTENT_PARTS.has(type)) {
				contentSeen = true;
				awaitingFirst = false;
				arm(opts.idleMs);
			} else if (!awaitingFirst) {
				arm(opts.idleMs);
			}
		},
		stop(): void {
			timers.clearTimeout(timer);
		},
	};
}
