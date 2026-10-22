/**
 * One page: it is read, and then it is written back.
 *
 * The two halves are apart because the EMBEDDING is not in the page any more:
 * a round collects the chunks of every page it claimed, embeds them together
 * (cross-page batches), and then writes every page back — each in its own
 * transaction, under its own advisory lock.
 *
 * The transaction of a page is therefore open while the round embeds. That is
 * the price of the batches, and the advisory lock pays for it: two replicas
 * never index the same page at the same time, and the page that is not locked
 * is left alone.
 *
 * The invariants of the page are unchanged:
 *   - only the chunks whose hash changed are embedded (the others keep the
 *     vector they have in the index);
 *   - the ACL is read AGAIN, under a row lock, just before the write, so a
 *     page made private while it was embedded never keeps a stale chunk;
 *   - the queue row is deleted only if dirty_at did not move.
 */

import type { PoolClient } from 'pg';
import { chunkPage } from './chunker.ts';
import { estimateTokens } from './chunker.ts';
import type { PageChunk } from './chunker.ts';
import type { EmbedItem } from './batches.ts';
import type { EmbedClient } from './embedder.ts';
import { pageVector, parseVector } from './pageVector.ts';
import {
	ADVISORY_LOCK_SQL,
	DELETE_CHUNKS_SQL,
	DELETE_PAGE_VECTOR_SQL,
	DELETE_QUEUE_SQL,
	EXISTING_SQL,
	INSERT_PAGE_VECTOR_SQL,
	INSERT_SQL,
	PAGE_ACL_SQL,
	PAGE_SQL,
} from './sql.ts';
import type { ExistingChunk, PageRow, QueueRow } from './sql.ts';

/** A page that is ready to be written back. */
export interface PreparedPage {
	/** The row of the queue that was claimed. */
	candidate: QueueRow;
	/** The connection of the transaction: it is opened by the worker. */
	client: PoolClient;
	/** The page, as it was read. */
	row: PageRow;
	/** The chunks of the page. */
	chunks: PageChunk[];
	/** The vectors that are already in the index, by the hash of the chunk. */
	stored: Map<string, string>;
	/** The chunks that must be embedded: the ones whose hash changed. */
	wanted: EmbedItem[];
	/**
	 * The number of tokens of every chunk, by the hash of the chunk.
	 *
	 * The page vector is the token-length-weighted mean of the chunk vectors
	 * (C104), and the weight of a chunk that was NOT embedded again is still
	 * needed: the vector is written on every index, not only on the first one.
	 */
	tokens: Map<string, number>;
}

/** What the reading of a page did. */
export type PrepareResult =
	| { kind: 'ready'; page: PreparedPage }
	| { kind: 'dropped' }
	| { kind: 'skipped' };

/** What one page did: what the worker has to log. */
export interface IndexPageResult {
	/** The page was indexed, or its chunks were dropped. */
	indexed: boolean;
	/** The number of chunks the page has now. */
	chunks: number;
	/** The number of chunks that were embedded. */
	embedded: number;
	/** The time the write took, in milliseconds. */
	ms: number;
}

/**
 * The chunks of a page that must not answer a search any more: the page is
 * gone, or it was archived. The queue row goes with them.
 */
export async function dropChunks(client: PoolClient, candidate: QueueRow): Promise<void> {
	await client.query(DELETE_CHUNKS_SQL, [candidate.page_id]);
	await client.query(DELETE_PAGE_VECTOR_SQL, [candidate.page_id]);
	await client.query(DELETE_QUEUE_SQL, [candidate.page_id, candidate.dirty_epoch]);
}

/**
 * The page, read: its chunks, the vectors it already has, and the chunks
 * that must be embedded.
 *
 * The transaction is already open and the advisory lock is already taken: the
 * caller opens it, because the lock has to survive until the page is written.
 */
export async function preparePage(
	client: PoolClient,
	candidate: QueueRow,
	embedder: EmbedClient,
): Promise<PrepareResult> {
	const locked = await client.query<{ locked: boolean }>(ADVISORY_LOCK_SQL, [candidate.page_id]);
	if (locked.rows[0]?.locked !== true) {
		// Another replica is indexing this page right now.
		return { kind: 'skipped' };
	}

	const page = await client.query<PageRow>(PAGE_SQL, [candidate.page_id]);
	const row = page.rows[0];
	if (!row || row.archived_at) {
		// The page is gone, or it was archived: its chunks must not answer a
		// search any more.
		await dropChunks(client, candidate);
		return { kind: 'dropped' };
	}

	const chunks = chunkPage({ title: row.title ?? '', content: row.content });
	const existing = await client.query<ExistingChunk>(EXISTING_SQL, [candidate.page_id]);
	const stored = new Map<string, string>();
	for (const entry of existing.rows) stored.set(entry.content_hash, entry.embedding);

	const wanted: EmbedItem[] = [];
	const tokens = new Map<string, number>();
	for (const chunk of chunks) {
		const input = embedder.passageInput(chunk.headingPath, chunk.content);
		const weight = estimateTokens(input);
		tokens.set(chunk.contentHash, weight);
		if (stored.has(chunk.contentHash)) continue;
		wanted.push({
			pageId: candidate.page_id,
			hash: chunk.contentHash,
			input,
			tokens: weight,
		});
	}
	return { kind: 'ready', page: { candidate, client, row, chunks, stored, wanted, tokens } };
}

/** What the write of a page needs. */
export interface WritePageOptions {
	/** The page, as it was read. */
	page: PreparedPage;
	/** The vectors of the round, by the hash of the chunk. */
	vectors: Map<string, string>;
	/** The model the vectors come from: it is written on every chunk. */
	model: string;
	/** The log: one line per page, never the content of a page. */
	log: (entry: Record<string, unknown>) => void;
}

/**
 * The page, written back: its chunks are replaced, and the queue row goes
 * away — or it does not.
 *
 * A failure is thrown: the caller rolls the transaction back, so the chunks
 * of the page stay as they were, and records the failure.
 */
export async function writePage(options: WritePageOptions): Promise<IndexPageResult> {
	const { page, vectors, model, log } = options;
	const { client, candidate, chunks, stored, tokens } = page;
	const started = Date.now();

	// The ACL is read AGAIN, under a row lock, just before the write: a page
	// made private while it was embedded must not be written back with the
	// old visibility — the queue does not re-index such a page.
	const acl = await client.query<PageRow>(PAGE_ACL_SQL, [candidate.page_id]);
	const fresh = acl.rows[0];
	if (!fresh || fresh.archived_at) {
		// The page was deleted, or archived, while it was being embedded.
		await dropChunks(client, candidate);
		const ms = Date.now() - started;
		log({ event: 'indexed', pageId: candidate.page_id, chunks: 0, embedded: 0, ms });
		return { indexed: true, chunks: 0, embedded: 0, ms };
	}

	await client.query(DELETE_CHUNKS_SQL, [candidate.page_id]);
	let embedded = 0;
	const chunkVectors: { vector: number[] | null; tokens: number }[] = [];
	for (const chunk of chunks) {
		const vector = vectors.get(chunk.contentHash) ?? stored.get(chunk.contentHash);
		if (vector === undefined) throw new Error('chunk_without_vector');
		if (!stored.has(chunk.contentHash)) embedded += 1;
		chunkVectors.push({ vector: parseVector(vector), tokens: tokens.get(chunk.contentHash) ?? 1 });
		await client.query(INSERT_SQL, [
			fresh.workspace_id,
			candidate.page_id,
			chunk.blockId,
			chunk.ord,
			page.row.title ?? '',
			chunk.headingPath,
			chunk.content,
			Buffer.from(chunk.contentHash, 'hex'),
			fresh.owner_id,
			fresh.visibility,
			JSON.stringify(fresh.collaborators ?? []),
			vector,
			model,
		]);
	}
	// The page's own vector: the token-length-weighted mean of its chunks, in
	// the SAME transaction as the chunks (C104). A page with no usable vector
	// simply has none: the related read then says it has no neighbours.
	const mean = pageVector(
		chunkVectors.map((entry) => ({ vector: entry.vector ?? [], tokens: entry.tokens })),
	);
	if (mean) {
		await client.query(INSERT_PAGE_VECTOR_SQL, [fresh.workspace_id, candidate.page_id, JSON.stringify(mean), model]);
	}
	await client.query(DELETE_QUEUE_SQL, [candidate.page_id, candidate.dirty_epoch]);
	const ms = Date.now() - started;
	log({
		event: 'indexed',
		pageId: candidate.page_id,
		chunks: chunks.length,
		embedded,
		ms,
	});
	return { indexed: true, chunks: chunks.length, embedded, ms };
}
