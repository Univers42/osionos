import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { AuthUser } from '../auth.ts';
import type { QueryRunner } from '../db.ts';
import { readLinkEdgesFromDb } from '../../../../scripts/bridge-graph-edges.mjs';
import { liveMemberWorkspaces } from './acl.ts';
import { readablePages } from './search.ts';

/**
 * The related pages of one page, for ONE viewer (C102, C105).
 *
 * The neighbours are not stored: they are computed at read time, over the
 * pages the caller may read, in the source page's workspace. A stored top-8
 * filtered afterwards would tell the reader how many hidden similar pages
 * exist, and a new page would only show up after the source was re-indexed.
 *
 * Three rules hold at once:
 *   - the kNN never leaves the source's workspace (C105): a page of another
 *     workspace is never a neighbour, whatever its content;
 *   - the candidates are the READABLE ones, filtered in the SQL and re-checked
 *     against the live page row (the retrieval's own rule, reused);
 *   - the answer carries no count and no degree: only the pages themselves.
 */

/** The number of related pages when the caller does not say. */
export const DEFAULT_RELATED = 8;

/** The most related pages a caller may ask for. */
export const MAX_RELATED = 32;

/**
 * The number of vectors of a workspace under which the kNN is an EXACT scan.
 *
 * Below it the whole candidate set is sorted by distance (a btree scan of the
 * workspace plus an ORDER BY distance), so the answer is exact by
 * construction. Above it the HNSW index is used, with the iterative scan so
 * the permission filter cannot starve the result.
 *
 * Measured on the P3 harness (see the test's own log): the exact scan wins up
 * to a few thousand pages of one workspace, and the HNSW takes over above it.
 */
export const EXACT_SCAN_MAX_PAGES = 2000;

/** One related page, as the answer carries it. */
export interface RelatedPage {
	/** The id of the page. */
	pageId: string;
	/** Its title. */
	title: string;
	/** The cosine similarity of the two pages, from 0 to 1. */
	score: number;
	/** Whether the source page already links to it. */
	linked: boolean;
}

/** One row of the kNN: the page and its distance. */
interface NeighbourRow extends QueryResultRow {
	page_id: string;
	distance: number;
}

/**
 * The number of vectors of a workspace: the size of the candidate set.
 *
 * The count is BOUNDED: it stops at `EXACT_SCAN_MAX_PAGES + 1`, because the
 * only question the count answers is "is the workspace above the threshold of
 * the exact scan?". Counting every vector of a big workspace on every call is
 * a scan of the partition for nothing.
 */
const COUNT_SQL = `select count(*)::int as count from (
	select 1
	from public.ai_page_vectors
	where workspace_id = $1
	limit ${EXACT_SCAN_MAX_PAGES + 1}
) as bounded`;

/**
 * The exact kNN: the whole candidate set, sorted by distance.
 *
 * The candidates are MATERIALIZED, so the planner reads the workspace's rows
 * through the btree of the primary key and sorts them: the HNSW index cannot
 * answer this, and the answer is the exact top-k of the readable candidates.
 *
 * The page of a vector must be in the workspace of the vector (C105): a page
 * that moved to another workspace keeps its vector in the old partition until
 * the indexer rewrites it, and it is not a neighbour of a page of the old
 * workspace any more.
 */
export const EXACT_SQL = `
with candidates as materialized (
	select v.page_id, v.embedding
	from public.ai_page_vectors v
	join public.osionos_pages p on p.id = v.page_id
	where v.workspace_id = $2::uuid
	  and p.workspace_id = v.workspace_id
	  and p.workspace_id = any($3::uuid[])
	  and p.archived_at is null
	  and (p.visibility in ('shared', 'public')
	       or p.owner_id = $4::uuid
	       or $4::uuid = any(public.ai_collaborator_ids(p.collaborators)))
	  and v.page_id <> $5::uuid
)
select page_id, embedding <=> $1::halfvec as distance
from candidates
order by distance
limit $6`;

/**
 * The HNSW kNN: the index of the partition, with the iterative scan.
 *
 * The filter is the same one the exact scan uses, so the two answer the same
 * question; the iterative scan keeps the order of the distances while it skips
 * the rows the filter refuses, so the result cannot be starved by a workspace
 * that holds few of the neighbours.
 *
 * The rows are re-sorted by their distance, as pgvector documents for the
 * iterative scan: `relaxed_order` returns the rows it found in the order of
 * the index, which is only ALMOST the order of the distances.
 *
 * Caveat: the scan visits `hnsw.max_scan_tuples` candidates at most (a
 * thousand by default). When many near neighbours are HIDDEN (a page the
 * caller may not read), the scan can run out of tuples before it found k
 * readable ones, and the answer is then SHORTER than k. That is the residual
 * count channel of C102 — the length of the answer says that hidden near
 * neighbours exist — and it is the price of the index. The escape hatch: below
 * `EXACT_SCAN_MAX_PAGES` vectors of the workspace the answer is the exact
 * top-k, and above it `SET LOCAL hnsw.max_scan_tuples` (and `hnsw.ef_search`)
 * buys the scan a bigger budget.
 */
export const HNSW_SQL = `
with scanned as materialized (
	select v.page_id, v.embedding <=> $1::halfvec as distance
	from public.ai_page_vectors v
	join public.osionos_pages p on p.id = v.page_id
	where v.workspace_id = $2::uuid
	  and p.workspace_id = v.workspace_id
	  and p.workspace_id = any($3::uuid[])
	  and p.archived_at is null
	  and (p.visibility in ('shared', 'public')
	       or p.owner_id = $4::uuid
	       or $4::uuid = any(public.ai_collaborator_ids(p.collaborators)))
	  and v.page_id <> $5::uuid
	order by v.embedding <=> $1::halfvec
	limit $6
)
select page_id, distance
from scanned
order by distance`;

/** The embedding of the source page, as the indexer wrote it. */
const VECTOR_SQL = `select embedding::text as embedding from public.ai_page_vectors where workspace_id = $1 and page_id = $2`;

/** The number of pages the caller asks for, inside the bounds. */
export function relatedLimit(raw: string | null): number {
	const asked = Number(raw ?? DEFAULT_RELATED);
	if (!Number.isFinite(asked) || asked <= 0) return DEFAULT_RELATED;
	return Math.min(Math.floor(asked), MAX_RELATED);
}

/**
 * The number of candidates the scan fetches for `limit` answers.
 *
 * The HNSW scan applies the permission filter AFTER the index scan, so a few
 * of the nearest neighbours can be refused and the answer would be short. The
 * scan therefore asks for more than it needs, and the readable ones are taken
 * in the order of their distance.
 */
const FETCH_FACTOR = 4;
const FETCH_EXTRA = 16;

/** The number of candidates the scan fetches. */
export function relatedFetch(limit: number): number {
	return limit * FETCH_FACTOR + FETCH_EXTRA;
}

/** The neighbours of a source page, in one transaction (the settings of the scan). */
async function neighbours(
	client: PoolClient,
	sql: string,
	vector: string,
	workspaceId: string,
	workspaces: readonly string[],
	userId: string,
	sourceId: string,
	limit: number,
): Promise<NeighbourRow[]> {
	const result = await client.query<NeighbourRow>(sql, [vector, workspaceId, workspaces, userId, sourceId, limit]);
	return result.rows;
}

/**
 * The related pages of a page, for the caller.
 *
 * `null` when the caller may not read the source page: the caller answers the
 * same 404 as for a page that does not exist (C101), byte for byte.
 *
 * The whole answer rides ONE connection of the pool. The kNN and the links it
 * answers with are two sets of reads, and asking the pool for a second
 * connection while the first one is held DEADLOCKS the route: the pool hands
 * out ten connections, ten requests take them, and every one of them waits for
 * the eleventh for ever.
 */
export async function relatedPages(
	db: Pool,
	user: AuthUser,
	pageId: string,
	limit: number,
): Promise<RelatedPage[] | null> {
	// The workspaces the caller may read, live (C98).
	const workspaces = await liveMemberWorkspaces(db, user);
	if (workspaces.length === 0) return null;
	// The source page, live: the same rule the retrieval applies, on the live
	// row. A page the caller may not read is a page that does not exist (C101).
	const readable = await readablePages(db, [pageId], user, workspaces);
	const row = readable.get(pageId.toLowerCase());
	if (!row) return null;

	const client: PoolClient = await db.connect();
	try {
		await client.query('BEGIN');
		const vector = await client.query<{ embedding: string }>(VECTOR_SQL, [row.workspace_id, pageId]);
		const embedding = vector.rows[0]?.embedding;
		if (!embedding) {
			// The page has no vector yet: it is not indexed, so it has no
			// neighbours. That is an answer, not a failure.
			await client.query('COMMIT');
			return [];
		}
		const counted = await client.query<{ count: number }>(COUNT_SQL, [row.workspace_id]);
		const candidates = Number(counted.rows[0]?.count ?? 0);
		const exact = candidates <= EXACT_SCAN_MAX_PAGES;
		if (!exact) {
			// The HNSW scan: the iterative scan keeps the order of the distances
			// while it skips the rows the filter refuses.
			await client.query('SET LOCAL hnsw.iterative_scan = relaxed_order');
			await client.query('SET LOCAL hnsw.ef_search = 100');
		}
		const rows = await neighbours(
			client,
			exact ? EXACT_SQL : HNSW_SQL,
			embedding,
			row.workspace_id,
			workspaces,
			user.userId,
			pageId,
			relatedFetch(limit),
		);
		await client.query('COMMIT');
		// The links ride the SAME connection: the pool is never asked for a
		// second one while this one is held.
		return await withLinks(client, user, pageId, workspaces, rows, limit);
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

/**
 * The neighbours with their title, their score, and whether the source already
 * links to them.
 *
 * The links are read through the ONE edge-read module (C99): both ends are
 * checked against their live page row, so a link to a page the caller may not
 * read is not a link at all.
 */
async function withLinks(
	db: QueryRunner,
	user: AuthUser,
	pageId: string,
	workspaces: readonly string[],
	rows: readonly NeighbourRow[],
	limit: number,
): Promise<RelatedPage[]> {
	if (rows.length === 0) return [];
	const ids = rows.map((row) => String(row.page_id));
	const pages = await readablePages(db, ids, user, workspaces);
	const { links } = await readLinkEdgesFromDb(db, {
		sourceIds: [pageId],
		userId: user.userId,
		workspaces,
		allowed: new Set([pageId.toLowerCase(), ...ids.map((id) => id.toLowerCase())]),
	});
	const linked = new Set(links.map((link) => link.target.toLowerCase()));
	const out: RelatedPage[] = [];
	for (const row of rows) {
		if (out.length >= limit) break;
		const id = String(row.page_id);
		const page = pages.get(id.toLowerCase());
		if (!page) continue;
		out.push({
			pageId: id,
			title: String(page.title ?? '') || 'Untitled',
			score: Math.round((1 - Number(row.distance)) * 1e6) / 1e6,
			linked: linked.has(id.toLowerCase()),
		});
	}
	return out;
}
