/**
 * The indexer: the rows of the queue in, the chunks of the pages out.
 *
 * The queue is the migration's (models/osionos-ai-rag-migration.sql): one row
 * per dirty page, coalesced by a trigger. The worker claims the dirty rows,
 * cuts the page into chunks, embeds the chunks that are not in the index yet,
 * and writes them back.
 *
 * Several replicas may run this at the same time. Two rules keep them from
 * fighting:
 *   - the claim takes the rows with FOR UPDATE SKIP LOCKED, so two replicas
 *     never wait for each other;
 *   - the page itself is taken with an ADVISORY lock, held for the whole page.
 *     The queue ROW is deliberately NOT held: an edit that lands while the
 *     page is being indexed must be able to bump dirty_at, so the last delete
 *     leaves the row alone and the page is indexed again.
 *
 * Caveat: the advisory lock is held for as long as the page takes, and the
 * page takes the latency of the embedding service for one page (a batch of
 * thirty-two texts, under a second on a local model). A slow service slows the
 * indexing of every page behind it.
 *
 * The page itself is indexed by indexPage.ts, and the statements are in
 * sql.ts: this file is the loop that claims the queue and the failures.
 */

import { Client } from 'pg';
import type { Pool } from 'pg';
import { indexPage } from './indexPage.ts';
import type { Embedder } from './embedder.ts';
import { CLAIM_SQL, FAILURE_SQL } from './sql.ts';
import type { QueueRow } from './sql.ts';

/** The configuration of the worker. */
export interface IndexerWorkerOptions {
	/** The pool of the service. */
	pool: Pool;
	/** The embedding client. */
	embedder: Embedder;
	/**
	 * The debounce, in seconds: a page is indexed ten seconds after its last
	 * edit. The ten seconds are what makes typing cheap — a page that is being
	 * typed is re-queued on every keystroke, and the debounce lets the edits
	 * pile up into ONE indexing instead of one per keystroke.
	 */
	debounceSeconds?: number;
	/** The number of attempts after which a page is left alone. */
	maxAttempts?: number;
	/** The number of pages one tick claims. */
	batchSize?: number;
	/**
	 * The URL of the database, for the listener. It is the one of the pool
	 * when it is not given.
	 */
	databaseUrl?: string;
	/** The log: one line per page, never the content of a page. */
	log?: (entry: Record<string, unknown>) => void;
}

/** The default debounce: the ten seconds the migration talks about. */
export const DEBOUNCE_SECONDS = 10;

/** The default number of attempts before a page is left alone. */
export const MAX_ATTEMPTS = 10;

/** The default number of pages one tick claims. */
export const BATCH_SIZE = 8;

/** The poll of the queue: five seconds between two rounds. */
export const POLL_INTERVAL_MS = 5_000;

/** The longest error the queue keeps. */
const MAX_ERROR_CHARS = 300;

/** The message of an error: its text, and nothing else. */
function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

/**
 * The indexer.
 *
 * One instance per process. `tick` does one round of the queue; `start` adds
 * the listener and the poll that call it.
 */
export class IndexerWorker {
	private readonly pool: Pool;
	private readonly embedder: Embedder;
	private readonly debounceSeconds: number;
	private readonly maxAttempts: number;
	private readonly batchSize: number;
	private readonly log: (entry: Record<string, unknown>) => void;

	private stopping = false;
	private running: Promise<void> | null = null;
	private again = false;
	private listener: Client | null = null;
	private timer: NodeJS.Timeout | null = null;
	private readonly databaseUrl: string;

	constructor(options: IndexerWorkerOptions) {
		this.pool = options.pool;
		this.embedder = options.embedder;
		this.debounceSeconds = options.debounceSeconds ?? DEBOUNCE_SECONDS;
		this.maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
		this.batchSize = options.batchSize ?? BATCH_SIZE;
		this.databaseUrl = options.databaseUrl ?? options.pool.options.connectionString ?? '';
		this.log = options.log ?? ((entry) => console.log(JSON.stringify(entry)));
	}

	/**
	 * The listener and the poll.
	 *
	 * The listener is a client of its own: it holds nothing but the LISTEN,
	 * so a page that takes a long time never keeps the queue waiting. The poll
	 * is the safety net: a notification that is lost, or that arrives while
	 * the worker is busy, must not leave a page in the queue for ever.
	 */
	async start(): Promise<void> {
		if (this.databaseUrl.length > 0) {
			const listener = new Client({ connectionString: this.databaseUrl, application_name: 'osionos-ai-indexer' });
			listener.on('notification', () => {
				this.trigger();
			});
			listener.on('error', () => {
				this.write({ event: 'listener_error' });
			});
			await listener.connect();
			await listener.query('LISTEN ai_index');
			this.listener = listener;
		}
		this.timer = setInterval(() => {
			this.trigger();
		}, POLL_INTERVAL_MS);
		this.timer.unref?.();
	}

	/**
	 * The stop: the page that is being indexed is finished, and nothing else
	 * is started.
	 */
	async stop(): Promise<void> {
		this.stopping = true;
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		if (this.running) await this.running;
		if (this.listener) {
			const listener = this.listener;
			this.listener = null;
			await listener.end().catch(() => undefined);
		}
	}

	/**
	 * A tick, now. The ticks do not pile up: one runs at a time, and the
	 * calls that arrive while it runs ask for one more.
	 */
	private trigger(): void {
		if (this.stopping) return;
		if (this.running) {
			this.again = true;
			return;
		}
		this.running = this.run().finally(() => {
			this.running = null;
			if (this.again && !this.stopping) {
				this.again = false;
				this.trigger();
			}
		});
	}

	/** The ticks: the queue is emptied, then the worker waits. */
	private async run(): Promise<void> {
		while (!this.stopping) {
			const indexed = await this.tick();
			if (indexed === 0) return;
		}
	}

	/**
	 * One round of the queue: the pages that are dirty are indexed.
	 *
	 * It returns the number of pages that were indexed.
	 */
	async tick(): Promise<number> {
		const candidates = await this.claim();
		let indexed = 0;
		for (const candidate of candidates) {
			if (await this.indexPage(candidate)) indexed += 1;
		}
		return indexed;
	}

	/**
	 * The dirty pages, the oldest first.
	 *
	 * The claim is its own short transaction: the row locks it takes are
	 * released before the pages are indexed, so a replica that is busy with a
	 * page never holds the queue of the others.
	 */
	private async claim(): Promise<QueueRow[]> {
		const client = await this.pool.connect();
		try {
			await client.query('BEGIN');
			const result = await client.query<QueueRow>(CLAIM_SQL, [
				this.debounceSeconds,
				this.maxAttempts,
				this.batchSize,
			]);
			await client.query('COMMIT');
			return result.rows;
		} catch (error) {
			await client.query('ROLLBACK').catch(() => undefined);
			throw error;
		} finally {
			client.release();
		}
	}

	/**
	 * One page: its chunks are cut, embedded and written back.
	 *
	 * The page does the work in its own transaction; a failure is recorded
	 * and the page is left alone until the next try.
	 */
	private async indexPage(candidate: QueueRow): Promise<boolean> {
		const client = await this.pool.connect();
		try {
			const result = await indexPage({
				client,
				embedder: this.embedder,
				candidate,
				log: this.write,
			});
			return result.indexed;
		} catch (error) {
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
			this.write({
				event: attempts >= this.maxAttempts ? 'index_gave_up' : 'index_failed',
				pageId: candidate.page_id,
				attempts,
			});
		} catch {
			this.write({ event: 'index_failure_not_recorded', pageId: candidate.page_id });
		}
	}

	/** One line of the log. */
	private readonly write = (entry: Record<string, unknown>): void => {
		this.log(entry);
	};
}
