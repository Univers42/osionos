/**
 * The concurrency of the embedding calls: the AIMD controller.
 *
 * Pure: the outcome of a call in, the next limit out. The controller knows
 * nothing about the service, about the engine or about the queue: it is the
 * one place where "the service is answering well" becomes "how many calls may
 * be in flight".
 *
 * The rule is the AIMD of TCP: a call that answers FAST buys one more call in
 * flight, a call that answers slowly (or that the service refuses) halves the
 * number. The bounds are [1, the maximum].
 *
 * Caveat: the target is a wall-clock budget on a call whose SIZE varies — a
 * call of sixty long chunks is slower than a call of four short ones, so the
 * same service looks slow or fast depending on the packing. The controller
 * reads the packing, not the service. And the halving is immediate while the
 * growth is one call at a time: a single slow call (a cold model, a garbage
 * collection) drops the concurrency to one, and it takes as many fast calls to
 * climb back.
 */

/** What a call did: it was fast, it was slow, the service pushed it back. */
export type EmbedOutcome = 'fast' | 'slow' | 'throttled' | 'timeout';

/** The latency a call must answer under to count as fast. */
export const EMBED_TARGET_MS = 1500;

/** The most calls in flight at once. */
export const EMBED_MAX_CONCURRENCY = 8;

/** The calls in flight when a round starts. */
export const EMBED_START_CONCURRENCY = 2;

/** The lane of the bulk work: a backfill, a re-embed after a model swap. */
export const BULK_PRIORITY = 1;

/**
 * The next limit, given the outcome of the last call.
 *
 * A fast call adds one; anything else halves. The bounds are [1, the maximum]:
 * a limit of one is the floor (one call is always allowed), and the maximum
 * is the ceiling.
 */
export function nextLimit(limit: number, outcome: EmbedOutcome, max: number): number {
	const ceiling = Math.max(1, Math.floor(max));
	const current = Math.min(Math.max(1, Math.floor(limit)), ceiling);
	if (outcome === 'fast') return Math.min(current + 1, ceiling);
	return Math.max(1, Math.floor(current / 2));
}

/**
 * The outcome of a call: its latency, or the status it answered with.
 *
 * A 429 or a 503 is the service pushing back — it is not a slow call, it is
 * a refusal, and it halves the concurrency just the same.
 */
export function classify(latencyMs: number, targetMs: number, status?: number): EmbedOutcome {
	if (status === 429 || status === 503) return 'throttled';
	if (latencyMs > targetMs) return 'slow';
	return 'fast';
}

/**
 * The cap of a round: a bulk round leaves room for an interactive query.
 *
 * The bulk work (the initial backfill, a re-embed after a model swap) is
 * capped at half of the maximum: the embedder serves the query embeddings of
 * the assistant too, and a query must always find room in it.
 */
export function roundCap(priority: number, max: number): number {
	const ceiling = Math.max(1, Math.floor(max));
	if (priority < BULK_PRIORITY) return ceiling;
	return Math.max(1, Math.floor(ceiling / 2));
}

/**
 * The controller of the worker: the limit it is at, and what it does with the
 * outcome of a call.
 *
 * The state is the limit; the input is the outcome of a call; the output is
 * the next limit. The limit survives the rounds: the service does not become
 * fast again between two rounds.
 */
export class EmbedConcurrency {
	private limit: number;
	private readonly max: number;

	constructor(options?: { max?: number; start?: number }) {
		this.max = Math.max(1, Math.floor(options?.max ?? EMBED_MAX_CONCURRENCY));
		this.limit = Math.min(
			Math.max(1, Math.floor(options?.start ?? EMBED_START_CONCURRENCY)),
			this.max,
		);
	}

	/** The limit now: the calls that may be in flight. */
	get current(): number {
		return this.limit;
	}

	/** The outcome of a call: the limit moves, and the new limit is returned. */
	observe(outcome: EmbedOutcome): number {
		this.limit = nextLimit(this.limit, outcome, this.max);
		return this.limit;
	}

	/** The limit of a round: the current one, under the cap of the lane. */
	limitFor(priority: number): number {
		return Math.max(1, Math.min(this.limit, roundCap(priority, this.max)));
	}
}
