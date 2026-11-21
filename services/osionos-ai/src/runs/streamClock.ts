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

/**
 * The window in force: the constant, or the test's shorter one so a stall test
 * does not wait 90 s. Read only under NODE_ENV=test; production has one value.
 */
export function firstPartWindowMs(): number {
	const injected = Number(process.env.OSIONOS_AI_TEST_FIRST_PART_MS);
	return process.env.NODE_ENV === 'test' && injected > 0 ? injected : FIRST_PART_TIMEOUT_MS;
}

/** Which clock ended the call: the wait for a first part, the idle window, or the whole call. */
export type TimeoutPhase = 'first_part' | 'idle' | 'total';

/** The abort of a timeout: the reason of the signal says so, and which clock. */
export class UpstreamTimeout extends Error {
	readonly phase: TimeoutPhase;
	constructor(phase: TimeoutPhase = 'total') {
		super('the upstream did not answer in time');
		this.name = 'timeout';
		this.phase = phase;
	}
}

/** The signal aborted because no first part came in time (FA22). */
export function isFirstPartTimeout(signal: AbortSignal): boolean {
	return signal.aborted && signal.reason instanceof UpstreamTimeout && signal.reason.phase === 'first_part';
}
/** The whole failover chain waits at most this long for first parts (FA17). */
export const CHAIN_FIRST_PART_BUDGET_MS = 150_000;

const CONTENT_PARTS = new Set(['text-delta', 'reasoning-delta', 'tool-input-start', 'tool-call']);

export interface Timers {
	setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
	clearTimeout: (id: ReturnType<typeof setTimeout> | undefined) => void;
	now: () => number;
}

const REAL_TIMERS: Timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id), now: () => Date.now() };

/**
 * What attempt n may wait for its first part: the window, or what the chain has left.
 *
 * Caveat: the window counts from the request, so a provider's queue time before
 * the first part spends it too; a slow-to-admit provider times out as if it
 * stalled, and the chain fails over earlier than its model's speed warrants.
 */
export function firstPartBudgetMs(chainStartedAt: number, now: number): number {
	return Math.max(0, Math.min(firstPartWindowMs(), CHAIN_FIRST_PART_BUDGET_MS - (now - chainStartedAt)));
}

export function createStreamClock(opts: { onTimeout: (phase: TimeoutPhase) => void; firstPartMs: number; idleMs: number; timers?: Timers }) {
	const timers = opts.timers ?? REAL_TIMERS;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let contentSeen = false;
	let awaitingFirst = true;
	const arm = (ms: number) => {
		timers.clearTimeout(timer);
		timer = timers.setTimeout(() => opts.onTimeout(awaitingFirst ? 'first_part' : 'idle'), ms);
	};
	arm(opts.firstPartMs);
	return {
		onPart(type: string): void {
			if (type === 'start-step') {
				// The first step keeps the window it already runs (it carries the
				// chain's remaining budget); later steps get a full one (FA16).
				awaitingFirst = true;
				if (contentSeen) arm(firstPartWindowMs());
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
