/**
 * The SQL of the indexer: the statements it runs and the rows they read.
 *
 * The statements live here, apart from the worker and the page, so the shape
 * of the queue and of the chunks is written down in one place.
 */

import type { QueryResultRow } from 'pg';

/** A row of the queue: the page to index, and when it was dirtied. */
export interface QueueRow extends QueryResultRow {
	page_id: string;
	workspace_id: string;
	/**
	 * The lane of the row: 0 is an edit a person just made, 1 is bulk work.
	 *
	 * The lane is the priority of the page in the queue: the edits are
	 * claimed first, so a person never waits behind a backfill.
	 */
	priority: number;
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
export interface PageRow extends QueryResultRow {
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
export interface ExistingChunk extends QueryResultRow {
	ord: number;
	content_hash: string;
	embedding: string;
}

/**
 * The claim: the pages that need indexing, the lane first, then the oldest.
 *
 * The ten seconds of the debounce are a parameter, so the tests do not have to
 * wait for them; the default is the ten seconds of the migration.
 *
 * The lane comes first: priority 0 is an edit a person just made, priority 1
 * is bulk work (the initial backfill, a re-embed after a model swap). An edit
 * is never stuck behind a whole workspace.
 *
 * FOR UPDATE SKIP LOCKED keeps two replicas from waiting for each other: the
 * second one takes the next rows. The lock is released as soon as the claim
 * is over — the page is taken by its own advisory lock instead.
 */
export const CLAIM_SQL = `
select page_id, workspace_id, priority, extract(epoch from dirty_at) as dirty_epoch
  from public.ai_index_queue
 where dirty_at < now() - make_interval(secs => $1)
   and attempts < $2
 order by priority, dirty_at
 limit $3
 for update skip locked`;

/**
 * The page: its title, its blocks, and the ACL its chunks carry.
 *
 * It is a plain read: it takes no lock, so an edit that lands while the page
 * is being embedded is never blocked by the worker.
 */
export const PAGE_SQL = `
select id, title, content, workspace_id, owner_id, visibility, collaborators, archived_at
  from public.osionos_pages
 where id = $1`;

/**
 * The page again, under a row lock: the ACL the chunks are written with.
 *
 * FOR SHARE is taken for the short write only, never for the embedding: an
 * UPDATE of the row waits for the share lock, and the row is free again as
 * soon as the worker commits.
 */
export const PAGE_ACL_SQL = `
select id, title, content, workspace_id, owner_id, visibility, collaborators, archived_at
  from public.osionos_pages
 where id = $1
   for share`;

/**
 * The chunks of the page that are already in the index: their hash and their
 * vector. The hash is the hex of the bytea, the vector the text of the
 * halfvec: both are read as text, so the worker needs no pgvector type.
 */
export const EXISTING_SQL = `
select ord, encode(content_hash, 'hex') as content_hash, embedding::text as embedding
  from public.ai_chunks
 where source_kind = 'page' and source_id = $1`;

/**
 * The chunks of the page, under ANY workspace: a page that moved workspace
 * must not keep its chunks in the one it left.
 */
export const DELETE_CHUNKS_SQL = `
delete from public.ai_chunks
 where source_kind = 'page' and source_id = $1`;

/**
 * One chunk. The ACL columns are NOT copied by hand: the visibility and the
 * collaborators go through the very functions the ACL trigger uses
 * (ai_page_visibility and ai_collaborator_ids), so the copy is exactly what
 * the trigger writes.
 */
export const INSERT_SQL = `
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
export const DELETE_QUEUE_SQL = `
delete from public.ai_index_queue
 where page_id = $1 and extract(epoch from dirty_at) = $2::numeric`;

/**
 * The failure: one more attempt, the reason, and the next try.
 *
 * The delay doubles with the attempts, up to ten minutes: 2, 4, 8… seconds.
 * The reason is the message of the error and nothing else, and it is cut at
 * 300 characters.
 */
export const FAILURE_SQL = `
update public.ai_index_queue
   set attempts = attempts + 1,
       last_error = $2,
       dirty_at = now() + make_interval(secs => least(2 ^ (attempts + 1), 600))
 where page_id = $1
 returning attempts`;

/**
 * The page's graph vector, written next to its chunks.
 *
 * The function (models/osionos-ai-rag-migration.sql) is the guard: a database
 * without the graph migration has no ai_page_vectors, and the write is then a
 * no-op instead of a failure.
 */
export const INSERT_PAGE_VECTOR_SQL = `
select public.ai_write_page_vector($1::uuid, $2::uuid, $3::halfvec, $4)`;

/**
 * The page's graph vector, gone with the page.
 *
 * Same guard: the vector of an archived or deleted page must not answer a
 * related read.
 */
export const DELETE_PAGE_VECTOR_SQL = `select public.ai_drop_page_vector($1::uuid)`;

/**
 * The lock of a page, between the replicas.
 *
 * It is an advisory lock and not the row of the queue: a row lock would block
 * the edit that lands while the page is being indexed, and that edit is
 * exactly what the dirty_at condition of the last delete is there for.
 */
export const ADVISORY_LOCK_SQL = `select pg_try_advisory_xact_lock(hashtextextended($1::text, 0)) as locked`;
