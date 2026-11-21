/**
 * The phase marks of a run (AB1): how long the pre-flight took, when the first
 * content part came, how long the stream ran, what the failovers and the
 * stream appends cost.
 *
 * Every mark is an integer of milliseconds on the monotonic clock, so a wall
 * clock step never shows as a latency. The marks are stored under `timing` in
 * `ai_runs.usage` by the markRun call that ends the run (AB2), and logged as a
 * `run_timing` event that names no user, run or text (AB3).
 *
 * Caveat: rounding is applied once, to each total, so two marks of one run may
 * differ by 1 ms from the sum of their parts. `provider_ttft_ms` counts from the
 * start of the attempt that answered, so a provider's queue time before the
 * first part is in it, as in the first-part clock (streamClock.ts).
 */

export interface RunTiming {
	preflight_ms: number;
	/** Absent when no content part arrived (a run that failed before any). */
	provider_ttft_ms?: number;
	stream_ms: number;
	attempts: number;
	failover_ms: number;
	append_ms_total: number;
	retrieval_failed: boolean;
}

export interface RunTimer {
	endPreflight: () => void;
	beginAttempt: () => void;
	firstContent: () => void;
	/** The provider stream is over: later work (persistence) is not stream time. Set once. */
	endStream: () => void;
	/** The attempt that just ended moved the run on: its time is failover time. */
	failedOver: () => void;
	timeAppend: <T>(append: () => Promise<T>) => Promise<T>;
	retrievalFailed: () => void;
	snapshot: () => RunTiming;
}

export function createRunTimer(now: () => number = () => performance.now()): RunTimer {
	const startedAt = now();
	let preflightMs: number | undefined;
	let attempts = 0;
	let attemptStart: number | undefined;
	let ttft: number | undefined;
	let movedOn = false;
	let streamEnd: number | undefined;
	let failoverMs = 0;
	let appendMs = 0;
	let retrievalFailed = false;
	return {
		endPreflight: () => {
			preflightMs ??= now() - startedAt;
		},
		beginAttempt: () => {
			const at = now();
			if (movedOn && attemptStart !== undefined) failoverMs += at - attemptStart;
			movedOn = false;
			attempts += 1;
			attemptStart = at;
			ttft = undefined;
			streamEnd = undefined;
		},
		firstContent: () => {
			if (attemptStart !== undefined) ttft ??= now() - attemptStart;
		},
		endStream: () => {
			streamEnd ??= now();
		},
		failedOver: () => {
			movedOn = true;
		},
		timeAppend: async (append) => {
			const at = now();
			try {
				return await append();
			} finally {
				appendMs += now() - at;
			}
		},
		retrievalFailed: () => {
			retrievalFailed = true;
		},
		snapshot: () => {
			const at = now();
			// An attempt that moved on with nobody after it (refused) is failover time.
			const pending = movedOn && attemptStart !== undefined ? at - attemptStart : 0;
			const streamMs = attemptStart === undefined || movedOn ? 0 : (streamEnd ?? at) - attemptStart;
			return {
				preflight_ms: Math.round(preflightMs ?? 0),
				...(ttft === undefined ? {} : { provider_ttft_ms: Math.round(ttft) }),
				stream_ms: Math.round(streamMs),
				attempts,
				failover_ms: Math.round(failoverMs + pending),
				append_ms_total: Math.round(appendMs),
				retrieval_failed: retrievalFailed,
			};
		},
	};
}

/**
 * The `run_timing` log event (AB3). The fields are named here and nowhere
 * else: the model menu id, the scope, the outcome code and the integers.
 */
export function logRunTiming(timing: RunTiming, run: { model: string; kind: 'platform' | 'user'; outcome: string }): void {
	// A user connection has no menu id, only the string the user typed (an org or
	// fine-tune name): the kind says it, the model is not logged.
	const model = run.kind === 'platform' ? run.model : 'user';
	console.info(JSON.stringify({ event: 'run_timing', model, kind: run.kind, outcome: run.outcome, ...timing }));
}
