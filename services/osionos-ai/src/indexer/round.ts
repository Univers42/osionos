/**
 * One round of the queue: the pages that were claimed are indexed together.
 *
 * A round does three things, in this order:
 *   - it READS the pages: every page is taken with its advisory lock, its
 *     chunks are cut, and the chunks whose hash changed are collected;
 *   - it EMBEDS the collected chunks together, in calls of the embedder
 *     (batches.ts), with an adaptive concurrency (concurrency.ts);
 *   - it WRITES the pages back: every page in its own transaction, with the
 *     ACL read again just before the write.
 *
 * The embedding is between the two, so the transaction of a page is open while
 * the round embeds. The advisory lock is what pays for it: two replicas never
 * index the same page at the same time.
 *
 * Caveat: the pages of a group hold their connection open until they are
 * written, so a group of eight pages holds eight connections for as long as
 * the embedder takes. The round therefore opens as many pages at a time as
 * the pool can carry, and no more.
 */

import type { Pool } from 'pg';
import { packBatches } from './batches.ts';
import type { EmbedBatch } from './batches.ts';
import { EmbedConcurrency, classify } from './concurrency.ts';
import type { EmbedOutcome } from './concurrency.ts';
import { EmbedError } from './embedder.ts';
import type { EmbedClient } from './embedder.ts';
import { preparePage, writePage } from './page.ts';
import type { PreparedPage } from './page.ts';
import { FAILURE_SQL } from './sql.ts';
import type { QueueRow } from './sql.ts';

/** The configuration of a round. */
export interface RoundOptions {
	/** The pool of the service. */
	pool: Pool;
	/** The embedding client. */
	embedder: EmbedClient;
	/** The controller of the concurrency: it survives the rounds. */
	concurrency: EmbedConcurrency;
	/** The token budget of one embed call. */
	tokenBudget: number;
	/** The most inputs of one embed call. */
	maxInputs: number;
	/** The latency an embed call must answer under to count as fast. */
	targetMs: number;
	/** The number of attempts after which a page is left alone. */
	maxAttempts: number;
	/** The log: one line per page, never the content of a page. */
	log: (entry: Record<string, unknown>) => void;
}

/** The longest error the queue keeps. */
const MAX_ERROR_CHARS = 300;

/** The message of an error: its text, and nothing else. */
function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

/**
 * The outcome of a failed call.
 *
 * A timeout is its own outcome, a 429 or a 503 is the service pushing back,
 * and every other failure is treated as a slow call: the service is not
 * answering, and a smaller concurrency is the safe answer in every case.
 */
function outcomeOf(error: unknown): EmbedOutcome {
	if (!(error instanceof EmbedError)) return 'slow';
	if (error.code === 'tei_timeout') return 'timeout';
	if (error.status === 429 || error.status === 503) return 'throttled';
	return 'slow';
}

/** What the reading of a page did. */
type Prepared =
	| { kind: 'ready'; page: PreparedPage }
	| { kind: 'dropped' }
	| { kind: 'skipped' }
	| { kind: 'failed' };

/**
 * The round: the pages of the queue that were claimed, indexed together.
 */
export class IndexRound {
	private readonly pool: Pool;
	private readonly embedder: EmbedClient;
	private readonly concurrency: EmbedConcurrency;
	private readonly tokenBudget: number;
	private readonly maxInputs: number;
	private readonly targetMs: number;
	private readonly maxAttempts: number;
	private readonly log: (entry: Record<string, unknown>) => void;
	private readonly openPages: number;

	constructor(options: RoundOptions) {
		this.pool = options.pool;
		this.embedder = options.embedder;
		this.concurrency = options.concurrency;
		this.tokenBudget = options.tokenBudget;
		this.maxInputs = options.maxInputs;
		this.targetMs = options.targetMs;
		this.maxAttempts = options.maxAttempts;
		this.log = options.log;
		// A page of a round holds its connection open until it is written:
		// the round never opens more pages at a time than the pool carries,
		// and it keeps two connections for itself.
		const capacity = Math.max(1, (options.pool.options.max ?? 10) - 2);
		this.openPages = capacity;
	}

	/**
	 * The pages of the round: read, embedded together, written back.
	 *
	 * It returns the number of pages that were indexed.
	 */
	async run(candidates: QueueRow[]): Promise<number> {
		let indexed = 0;
		for (const group of this.groups(candidates)) {
			indexed += await this.runGroup(group);
		}
		return indexed;
	}

	/**
	 * The groups of a round: the pages that are open at the same time.
	 *
	 * A group is a handful of pages whose transactions are open together; the
	 * group is the unit of the cross-page batches.
	 */
	private groups(candidates: QueueRow[]): QueueRow[][] {
		const groups: QueueRow[][] = [];
		for (let index = 0; index < candidates.length; index += this.openPages) {
			groups.push(candidates.slice(index, index + this.openPages));
		}
		return groups;
	}

	/** One group of pages: they are read, embedded together, written back. */
	private async runGroup(candidates: QueueRow[]): Promise<number> {
		const prepared: PreparedPage[] = [];
		let indexed = 0;
		for (const candidate of candidates) {
			const outcome = await this.prepare(candidate);
			if (outcome.kind === 'dropped') indexed += 1;
			if (outcome.kind === 'ready') prepared.push(outcome.page);
		}
		if (prepared.length === 0) return indexed;
		const vectors = await this.embed(prepared);
		for (const page of prepared) {
			if (await this.writeBack(page, vectors)) indexed += 1;
		}
		return indexed;
	}

	/**
	 * One page, read: its chunks, the vectors it has, and the chunks that
	 * must be embedded.
	 *
	 * The transaction of the page stays open: the page is written back in it,
	 * after the round embedded the chunks.
	 */
	private async prepare(candidate: QueueRow): Promise<Prepared> {
		const client = await this.pool.connect();
		// The page that is ready keeps its connection: its transaction stays
		// open until the page is written back.
		let open = false;
		try {
			await client.query('BEGIN');
			const result = await preparePage(client, candidate, this.embedder);
			if (result.kind === 'skipped') {
				await client.query('ROLLBACK');
				return { kind: 'skipped' };
			}
			if (result.kind === 'dropped') {
				await client.query('COMMIT');
				this.log({ event: 'indexed', pageId: candidate.page_id, chunks: 0, embedded: 0, ms: 0 });
				return { kind: 'dropped' };
			}
			open = true;
			return { kind: 'ready', page: result.page };
		} catch (error) {
			await client.query('ROLLBACK').catch(() => undefined);
			await this.recordFailure(candidate, error);
			return { kind: 'failed' };
		} finally {
			if (!open) client.release();
		}
	}

	/**
	 * The chunks of the group, embedded together.
	 *
	 * The calls are packed over every page of the group: the embedder gets
	 * big calls instead of one call per page. A page whose embedding failed is
	 * retried ALONE, and one bad page never fails the round.
	 */
	private async embed(pages: PreparedPage[]): Promise<Map<string, string>> {
		const vectors = new Map<string, string>();
		const items = pages.flatMap((page) => page.wanted);
		if (items.length === 0) return vectors;
		const priority = Math.min(...pages.map((page) => page.candidate.priority));
		await this.runCalls(packBatches(items, this.tokenBudget, this.maxInputs), vectors, priority);
		for (const page of pages) {
			const missing = page.wanted.filter((item) => !vectors.has(item.hash));
			if (missing.length === 0) continue;
			await this.runCalls(packBatches(missing, this.tokenBudget, this.maxInputs), vectors, priority);
		}
		return vectors;
	}

	/**
	 * The calls of a group, with the adaptive concurrency.
	 *
	 * The limit moves while the calls answer: a fast call buys one more call
	 * in flight, a slow one halves the number.
	 */
	private async runCalls(
		batches: EmbedBatch[],
		vectors: Map<string, string>,
		priority: number,
	): Promise<void> {
		const running = new Set<Promise<void>>();
		for (const batch of batches) {
			while (running.size >= this.concurrency.limitFor(priority)) {
				await Promise.race(running);
			}
			const call = this.runCall(batch, vectors).finally(() => {
				running.delete(call);
			});
			running.add(call);
		}
		await Promise.all(running);
	}

	/** One call of the embedder: the vectors of its items, or nothing. */
	private async runCall(batch: EmbedBatch, vectors: Map<string, string>): Promise<void> {
		try {
			const answer = await this.embedder.embedCall(batch.items.map((item) => item.input));
			this.concurrency.observe(classify(answer.ms, this.targetMs, answer.status));
			batch.items.forEach((item, index) => {
				const vector = answer.vectors[index];
				if (vector) vectors.set(item.hash, JSON.stringify(vector));
			});
		} catch (error) {
			// The call failed: the items keep no vector, and the page they
			// belong to is retried alone.
			this.concurrency.observe(outcomeOf(error));
		}
	}

	/**
	 * One page, written back: the ACL is read again, the chunks are replaced,
	 * and the queue row goes away — or it does not.
	 */
	private async writeBack(page: PreparedPage, vectors: Map<string, string>): Promise<boolean> {
		const { client, candidate } = page;
		try {
			await writePage({ page, vectors, model: this.embedder.model, log: this.log });
			await client.query('COMMIT');
			return true;
		} catch (error) {
			await client.query('ROLLBACK').catch(() => undefined);
			await this.recordFailure(candidate, error);
			return false;
		} finally {
			client.release();
		}
	}

	/**
	 * The failure of a page: one more attempt, the reason, and the next try.
	 *
	 * A page that failed ten times is left alone: it is logged once, and the
	 * claim does not take it any more.
	 */
	private async recordFailure(candidate: QueueRow, error: unknown): Promise<void> {
		const message = errorMessage(error).slice(0, MAX_ERROR_CHARS);
		try {
			const result = await this.pool.query<{ attempts: number }>(FAILURE_SQL, [
				candidate.page_id,
				message,
			]);
			const attempts = Number(result.rows[0]?.attempts ?? 0);
			this.log({
				event: attempts >= this.maxAttempts ? 'index_gave_up' : 'index_failed',
				pageId: candidate.page_id,
				attempts,
			});
		} catch {
			this.log({ event: 'index_failure_not_recorded', pageId: candidate.page_id });
		}
	}
}
