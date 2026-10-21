/**
 * One page: its chunks are cut, embedded and written back.
 *
 * Everything happens in ONE transaction: the chunks of the page are replaced,
 * and the queue row is deleted, or it is not.
 *
 * The page is taken with an advisory lock, so two replicas never index the
 * same page at the same time. The queue ROW is deliberately NOT held: an edit
 * that lands while the page is being indexed must be able to bump dirty_at, so
 * the last delete leaves the row alone and the page is indexed again.
 */

import type { PoolClient } from 'pg';
import { chunkPage } from './chunker.ts';
import type { PageChunk } from './chunker.ts';
import type { Embedder } from './embedder.ts';
import {
	ADVISORY_LOCK_SQL,
	DELETE_CHUNKS_SQL,
	DELETE_QUEUE_SQL,
	EXISTING_SQL,
	INSERT_SQL,
	PAGE_ACL_SQL,
	PAGE_SQL,
} from './sql.ts';
import type { ExistingChunk, PageRow, QueueRow } from './sql.ts';

/** What one page needs to be indexed. */
export interface IndexPageOptions {
	/** The connection of the transaction: it is opened by the worker. */
	client: PoolClient;
	/** The embedding client. */
	embedder: Embedder;
	/** The row of the queue that was claimed. */
	candidate: QueueRow;
	/** The log: one line per page, never the content of a page. */
	log: (entry: Record<string, unknown>) => void;
}

/** What one page did: what the worker has to log. */
export interface IndexPageResult {
	/** The page was indexed, or its chunks were dropped. */
	indexed: boolean;
	/** The number of chunks the page has now. */
	chunks: number;
	/** The number of chunks that were embedded. */
	embedded: number;
	/** The time the page took, in milliseconds. */
	ms: number;
}

/**
 * The chunks of a page that must not answer a search any more: the page is
 * gone, or it was archived. The queue row goes with them.
 */
async function dropChunks(client: PoolClient, candidate: QueueRow): Promise<void> {
	await client.query(DELETE_CHUNKS_SQL, [candidate.page_id]);
	await client.query(DELETE_QUEUE_SQL, [candidate.page_id, candidate.dirty_epoch]);
}

/**
 * A page that has no chunks any more: it is gone, or it was archived.
 *
 * The transaction is closed here: there is nothing left to write.
 */
async function dropPage(
	client: PoolClient,
	candidate: QueueRow,
	log: (entry: Record<string, unknown>) => void,
	started: number,
): Promise<IndexPageResult> {
	await dropChunks(client, candidate);
	await client.query('COMMIT');
	const result: IndexPageResult = {
		indexed: true,
		chunks: 0,
		embedded: 0,
		ms: Date.now() - started,
	};
	log({ event: 'indexed', pageId: candidate.page_id, chunks: 0, embedded: 0, ms: result.ms });
	return result;
}

/**
 * The vectors of the chunks: the ones that are already in the index are
 * taken from it, the others are embedded.
 *
 * A chunk whose hash did not change keeps its vector, even when its place
 * in the page moved: the vector is the meaning of the text, not of the
 * place.
 */
async function vectorsOf(
	client: PoolClient,
	embedder: Embedder,
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
		embedder.passageInput(chunk.headingPath, chunk.content),
	);
	const embedded = await embedder.embed(inputs);
	const hashes = [...wanted.keys()];
	hashes.forEach((hash, index) => {
		vectors.set(hash, JSON.stringify(embedded[index]));
	});
	return { vectors, embedded: embedded.length };
}

/**
 * One page: the chunks are cut, embedded, and written back.
 *
 * It returns what the page did. A failure is thrown, and the worker records
 * it: the transaction is rolled back before, so the chunks of the page stay
 * as they were.
 */
export async function indexPage(options: IndexPageOptions): Promise<IndexPageResult> {
	const { client, embedder, candidate, log } = options;
	const started = Date.now();
	await client.query('BEGIN');
	try {
		const locked = await client.query<{ locked: boolean }>(ADVISORY_LOCK_SQL, [candidate.page_id]);
		if (locked.rows[0]?.locked !== true) {
			// Another replica is indexing this page right now.
			await client.query('ROLLBACK');
			return { indexed: false, chunks: 0, embedded: 0, ms: Date.now() - started };
		}

		const page = await client.query<PageRow>(PAGE_SQL, [candidate.page_id]);
		const row = page.rows[0];
		if (!row || row.archived_at) {
			// The page is gone, or it was archived: its chunks must not
			// answer a search any more.
			return await dropPage(client, candidate, log, started);
		}

		const chunks = chunkPage({ title: row.title ?? '', content: row.content });
		// The embedding happens INSIDE the transaction, and inside the lock
		// of the page: the batches are small, and a lock that is held for
		// the latency of the service for ONE page is simpler than a lock
		// that is taken and given back.
		const { vectors, embedded } = await vectorsOf(client, embedder, candidate.page_id, chunks);

		// The ACL is read AGAIN, under a row lock, just before the write: a
		// page made private while it was embedded must not be written back
		// with the old visibility — the queue does not re-index such a page.
		const acl = await client.query<PageRow>(PAGE_ACL_SQL, [candidate.page_id]);
		const fresh = acl.rows[0];
		if (!fresh || fresh.archived_at) {
			// The page was deleted, or archived, while it was being embedded.
			return await dropPage(client, candidate, log, started);
		}

		await client.query(DELETE_CHUNKS_SQL, [candidate.page_id]);
		for (const chunk of chunks) {
			const vector = vectors.get(chunk.contentHash);
			if (vector === undefined) throw new Error('chunk_without_vector');
			await client.query(INSERT_SQL, [
				fresh.workspace_id,
				candidate.page_id,
				chunk.blockId,
				chunk.ord,
				row.title ?? '',
				chunk.headingPath,
				chunk.content,
				Buffer.from(chunk.contentHash, 'hex'),
				fresh.owner_id,
				fresh.visibility,
				JSON.stringify(fresh.collaborators ?? []),
				vector,
				embedder.model,
			]);
		}
		await client.query(DELETE_QUEUE_SQL, [candidate.page_id, candidate.dirty_epoch]);
		await client.query('COMMIT');
		const result: IndexPageResult = {
			indexed: true,
			chunks: chunks.length,
			embedded,
			ms: Date.now() - started,
		};
		log({
			event: 'indexed',
			pageId: candidate.page_id,
			chunks: result.chunks,
			embedded,
			ms: result.ms,
		});
		return result;
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined);
		throw error;
	}
}
