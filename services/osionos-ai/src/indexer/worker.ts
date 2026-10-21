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
 */

import { Client } from 'pg';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { chunkPage } from './chunker.ts';
import type { PageChunk } from './chunker.ts';
import type { Embedder } from './embedder.ts';

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

/** A row of the queue: the page to index, and when it was dirtied. */
interface QueueRow extends QueryResultRow {
	page_id: string;
	workspace_id: string;
	/**
	 * The moment the page was dirtied, in seconds since the epoch.
	 *
	 * It is NOT a date: Postgres keeps the microseconds of a timestamp, and
	 * the driver reads a date with the milliseconds only. The epoch is a
	 * number, so it is exact — and the last delete compares what it was
	 * claimed with.
	 */
	dirty_epoch: string;
}

/** The page to index: its text, and the ACL that is copied on its chunks. */
interface PageRow extends QueryResultRow {
	id: string;
	title: string | null;
	content: unknown;
	workspace_id: string;
	owner_id: string | null;
	visibility: string | null;
	collaborators: unknown;
	archived_at: Date | null;
}

/** The chunk that is already in the index: its hash and its vector. */
interface ExistingChunk extends QueryResultRow {
	ord: number;
	content_hash: string;
	embedding: string;
}

/**
 * The claim: the pages that need indexing, the oldest first.
 *
 * The ten seconds of the debounce are a parameter, so the tests do not have to
 * wait for them; the default is the ten seconds of the migration.
 *
 * FOR UPDATE SKIP LOCKED keeps two replicas from waiting for each other: the
 * second one takes the next rows. The lock is released as soon as the claim
 * is over — the page is taken by its own advisory lock instead.
 */
const CLAIM_SQL = `
select page_id, workspace_id, extract(epoch from dirty_at) as dirty_epoch
  from public.ai_index_queue
 where dirty_at < now() - make_interval(secs => $1)
   and attempts < $2
 order by dirty_at
 limit $3
 for update skip locked`;

/**
 * The page: its title, its blocks, and the ACL its chunks carry.
 */
const PAGE_SQL = `
select id, title, content, workspace_id, owner_id, visibility, collaborators, archived_at
  from public.osionos_pages
 where id = $1`;

/**
 * The chunks of the page that are already in the index: their hash and their
 * vector. The hash is the hex of the bytea, the vector the text of the
 * halfvec: both are read as text, so the worker needs no pgvector type.
 */
const EXISTING_SQL = `
select ord, encode(content_hash, 'hex') as content_hash, embedding::text as embedding
  from public.ai_chunks
 where source_kind = 'page' and source_id = $1`;

/**
 * The chunks of the page, under ANY workspace: a page that moved workspace
 * must not keep its chunks in the one it left.
 */
const DELETE_CHUNKS_SQL = `
delete from public.ai_chunks
 where source_kind = 'page' and source_id = $1`;

/**
 * One chunk. The ACL columns are NOT copied by hand: the visibility and the
 * collaborators go through the very functions the ACL trigger uses
 * (ai_page_visibility and ai_collaborator_ids), so the copy is exactly what
 * the trigger writes.
 */
const INSERT_SQL = `
insert into public.ai_chunks (
	workspace_id, source_kind, source_id, block_id, ord, title, heading_path,
	content, content_hash, owner_id, visibility, collaborator_ids, embedding, embedding_model
) values (
	$1, 'page', $2, $3, $4, $5, $6, $7, $8, $9,
	public.ai_page_visibility($10), public.ai_collaborator_ids($11), $12::halfvec, $13
)`;

/**
 * The queue row, gone — but only if it is still the row that was claimed.
 *
 * The dirty_at condition is the whole point: when the page was edited while
 * it was being indexed, the row carries another dirty_at, the delete touches
 * nothing, and the page is indexed again.
 *
 * The moment is compared as an epoch, not as a date: a date would come back
 * from the driver with the milliseconds only, and the microseconds of the
 * row would never match.
 */
const DELETE_QUEUE_SQL = `
delete from public.ai_index_queue
 where page_id = $1 and extract(epoch from dirty_at) = $2::numeric`;

/**
 * The failure: one more attempt, the reason, and the next try.
 *
 * The delay doubles with the attempts, up to ten minutes: 2, 4, 8… seconds.
 * The reason is the message of the error and nothing else, and it is cut at
 * 300 characters.
 */
const FAILURE_SQL = `
update public.ai_index_queue
   set attempts = attempts + 1,
       last_error = $2,
       dirty_at = now() + make_interval(secs => least(2 ^ (attempts + 1), 600))
 where page_id = $1
 returning attempts`;

/**
 * The lock of a page, between the replicas.
 *
 * It is an advisory lock and not the row of the queue: a row lock would block
 * the edit that lands while the page is being indexed, and that edit is
 * exactly what the dirty_at condition of the last delete is there for.
 */
const ADVISORY_LOCK_SQL = `select pg_try_advisory_xact_lock(hashtextextended($1::text, 0)) as locked`;

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
	 * Everything happens in ONE transaction: the chunks of the page are
	 * replaced, and the queue row is deleted, or it is not.
	 */
	private async indexPage(candidate: QueueRow): Promise<boolean> {
		const started = Date.now();
		const client = await this.pool.connect();
		try {
			await client.query('BEGIN');
			const locked = await client.query<{ locked: boolean }>(ADVISORY_LOCK_SQL, [candidate.page_id]);
			if (locked.rows[0]?.locked !== true) {
				// Another replica is indexing this page right now.
				await client.query('ROLLBACK');
				return false;
			}
			const page = await client.query<PageRow>(PAGE_SQL, [candidate.page_id]);
			const row = page.rows[0];
			if (!row || row.archived_at) {
				// The page is gone, or it was archived: its chunks must not
				// answer a search any more.
				await client.query(DELETE_CHUNKS_SQL, [candidate.page_id]);
				await client.query(DELETE_QUEUE_SQL, [candidate.page_id, candidate.dirty_epoch]);
				await client.query('COMMIT');
				this.write({
					event: 'indexed',
					pageId: candidate.page_id,
					chunks: 0,
					embedded: 0,
					ms: Date.now() - started,
				});
				return true;
			}
			const chunks = chunkPage({ title: row.title ?? '', content: row.content });
			// The embedding happens INSIDE the transaction, and inside the lock
			// of the page: the batches are small, and a lock that is held for
			// the latency of the service for ONE page is simpler than a lock
			// that is taken and given back.
			const { vectors, embedded } = await this.vectorsOf(client, candidate.page_id, chunks);
			await client.query(DELETE_CHUNKS_SQL, [candidate.page_id]);
			for (const chunk of chunks) {
				const vector = vectors.get(chunk.contentHash);
				if (vector === undefined) throw new Error('chunk_without_vector');
				await client.query(INSERT_SQL, [
					row.workspace_id,
					candidate.page_id,
					chunk.blockId,
					chunk.ord,
					row.title ?? '',
					chunk.headingPath,
					chunk.content,
					Buffer.from(chunk.contentHash, 'hex'),
					row.owner_id,
					row.visibility,
					JSON.stringify(row.collaborators ?? []),
					vector,
					this.embedder.model,
				]);
			}
			await client.query(DELETE_QUEUE_SQL, [candidate.page_id, candidate.dirty_epoch]);
			await client.query('COMMIT');
			this.write({
				event: 'indexed',
				pageId: candidate.page_id,
				chunks: chunks.length,
				embedded,
				ms: Date.now() - started,
			});
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
	 * The vectors of the chunks: the ones that are already in the index are
	 * taken from it, the others are embedded.
	 *
	 * A chunk whose hash did not change keeps its vector, even when its place
	 * in the page moved: the vector is the meaning of the text, not of the
	 * place.
	 */
	private async vectorsOf(
		client: PoolClient,
		pageId: string,
		chunks: readonly PageChunk[],
	): Promise<{ vectors: Map<string, string>; embedded: number }> {
		const vectors = new Map<string, string>();
		const existing = await client.query<ExistingChunk>(EXISTING_SQL, [pageId]);
		const stored = new Map<string, string>();
		for (const row of existing.rows) stored.set(row.content_hash, row.embedding);
		const wanted = new Map<string, PageChunk>();
		for (const chunk of chunks) {
			const known = stored.get(chunk.contentHash);
			if (known !== undefined) {
				vectors.set(chunk.contentHash, known);
				continue;
			}
			wanted.set(chunk.contentHash, chunk);
		}
		if (wanted.size === 0) return { vectors, embedded: 0 };
		const inputs = [...wanted.values()].map((chunk) =>
			this.embedder.passageInput(chunk.headingPath, chunk.content),
		);
		const embedded = await this.embedder.embed(inputs);
		const hashes = [...wanted.keys()];
		hashes.forEach((hash, index) => {
			vectors.set(hash, JSON.stringify(embedded[index]));
		});
		return { vectors, embedded: embedded.length };
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
	private write(entry: Record<string, unknown>): void {
		this.log(entry);
	}
}
