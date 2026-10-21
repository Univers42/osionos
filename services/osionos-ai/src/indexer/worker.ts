/**
 * The indexer: the rows of the queue in, the chunks of the pages out.
 *
 * The queue is the migration's (models/osionos-ai-rag-migration.sql): one row
 * per dirty page, coalesced by a trigger. The worker claims the dirty rows,
 * cuts the pages into chunks, embeds the chunks that are not in the index yet,
 * and writes them back.
 *
 * This file is the LOOP: it claims the queue, it listens for the pages that
 * are dirtied, and it stops. The round itself is in round.ts, and the page is
 * in page.ts.
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
 * The lane of the queue is read by the claim: the edits of a person (lane 0)
 * are claimed before the bulk work (lane 1), so a person never waits behind a
 * backfill.
 *
 * Caveat: the advisory lock is held for as long as the page takes, and the
 * page takes the latency of the embedding service for the calls of its round
 * (a batch of thirty-two texts, under a second on a local model). A slow
 * service slows the indexing of every page behind it.
 */

import { Client } from 'pg';
import type { Pool } from 'pg';
import { EMBED_MAX_INPUTS, EMBED_TOKEN_BUDGET } from './batches.ts';
import { EmbedConcurrency, EMBED_MAX_CONCURRENCY, EMBED_TARGET_MS } from './concurrency.ts';
import type { EmbedClient } from './embedder.ts';
import { IndexRound } from './round.ts';
import { CLAIM_SQL } from './sql.ts';
import type { QueueRow } from './sql.ts';

/** The configuration of the worker. */
export interface IndexerWorkerOptions {
	/** The pool of the service. */
	pool: Pool;
	/** The embedding client. */
	embedder: EmbedClient;
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
	/** The token budget of one embed call. */
	embedTokenBudget?: number;
	/** The most inputs of one embed call. */
	embedMaxInputs?: number;
	/** The latency an embed call must answer under to count as fast. */
	embedTargetMs?: number;
	/** The most embed calls in flight at once. */
	embedMaxConcurrency?: number;
}

/** The default debounce: the ten seconds the migration talks about. */
export const DEBOUNCE_SECONDS = 10;

/** The default number of attempts before a page is left alone. */
export const MAX_ATTEMPTS = 10;

/** The default number of pages one tick claims. */
export const BATCH_SIZE = 8;

/** The poll of the queue: five seconds between two rounds. */
export const POLL_INTERVAL_MS = 5_000;

/**
 * The indexer.
 *
 * One instance per process. `tick` does one round of the queue; `start` adds
 * the listener and the poll that call it.
 */
export class IndexerWorker {
	private readonly pool: Pool;
	private readonly embedder: EmbedClient;
	private readonly debounceSeconds: number;
	private readonly maxAttempts: number;
	private readonly batchSize: number;
	private readonly log: (entry: Record<string, unknown>) => void;
	private readonly round: IndexRound;

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
		// The engine takes so many inputs per request: a call is never bigger
		// than the service accepts, and it is one request.
		const maxInputs = Math.max(
			1,
			Math.min(
				options.embedMaxInputs ?? EMBED_MAX_INPUTS,
				this.embedder.maxInputsPerRequest ?? EMBED_MAX_INPUTS,
			),
		);
		this.round = new IndexRound({
			pool: this.pool,
			embedder: this.embedder,
			// The controller survives the rounds: the service does not become
			// fast again between two rounds.
			concurrency: new EmbedConcurrency({ max: options.embedMaxConcurrency ?? EMBED_MAX_CONCURRENCY }),
			tokenBudget: options.embedTokenBudget ?? EMBED_TOKEN_BUDGET,
			maxInputs,
			targetMs: options.embedTargetMs ?? EMBED_TARGET_MS,
			maxAttempts: this.maxAttempts,
			log: this.write,
		});
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
		if (candidates.length === 0) return 0;
		return await this.round.run(candidates);
	}

	/**
	 * The dirty pages, the lane first and then the oldest.
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

	/** One line of the log. */
	private readonly write = (entry: Record<string, unknown>): void => {
		this.log(entry);
	};
}
