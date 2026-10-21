import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { AuthUser } from '../auth.ts';
import { Embedder } from '../indexer/embedder.ts';
import { canReadPageRowAsMember } from '../../../../scripts/bridge-page-read.mjs';
import { ROW_ALLOWED_SQL, WORKSPACE_ALLOWED_SQL, liveMemberWorkspaces } from './acl.ts';

/**
 * The retrieval: the chunks that answer a question, in one statement.
 *
 * One statement does the whole search: the lexical half (the tsvector of the
 * chunk) and the vector half (its embedding) are read side by side, and the
 * two lists are fused with RRF (reciprocal rank fusion). The permission
 * predicate of acl.ts filters BOTH halves, so a page the caller may not read
 * never reaches the fusion.
 *
 * Caveat: RRF ignores the magnitude of the scores. A chunk that is rank 1 in
 * one list and rank 50 in the other scores like a chunk that is rank 1 in
 * both, and a chunk that is in neither list is not in the answer at all.
 *
 * Caveat: the text search uses the 'simple' dictionary, so it has no stemming:
 * it is multilingual by design, and a question in one language does not find a
 * page written in another.
 *
 * Caveat: pgvector keeps the deleted entries of the HNSW graph until the
 * vacuum, so a row written into an index that was just emptied can be out of
 * the reach of the scan. The autovacuum of the deployment takes the dead
 * entries out; the lexical half of the search finds the page meanwhile.
 */

/** The number of chunks a run quotes when it says nothing else. */
export const DEFAULT_LIMIT = 8;

/** The number of chunks of ONE page a run quotes: a page is not a whole run. */
export const MAX_CHUNKS_PER_PAGE = 3;

/** The length of the snippet of a source. */
export const SNIPPET_CHARS = 400;

/** The rows of one half of the search: the fifty best of a list. */
const LIST_LIMIT = 50;

/** The chunks that go to the model: the twenty best of the fusion. */
const FUSED_LIMIT = 20;

/** One chunk the search found, before the pages are checked. */
interface CandidateRow extends QueryResultRow {
	source_id: string;
	block_id: string | null;
	title: string;
	heading_path: string;
	content: string;
	score: number;
}

/** One page, as the read rule reads it. */
interface PageRow extends QueryResultRow {
	id: string;
	workspace_id: string;
	owner_id: string | null;
	visibility: string | null;
	collaborators: unknown;
	title: string | null;
}

/** One source of an answer: a chunk of a page the caller may read. */
export interface RetrievedChunk {
	/** The page the chunk is in. */
	pageId: string;
	/** The block inside the page, when the chunk is one block. */
	blockId: string | null;
	/** The title of the page. */
	title: string;
	/** Where the chunk is in the page: the path of its headings. */
	headingPath: string;
	/** The text of the chunk, cut to SNIPPET_CHARS. */
	snippet: string;
	/** The fused rank of the chunk. */
	score: number;
}

/**
 * The one statement of the search: the lexical list, the vector list, and
 * their fusion.
 *
 * The parameter order is the one of acl.ts: the workspaces, the user, the
 * question, the vector.
 */
export const FUSION_SQL = `
with lexical as (
	select c.workspace_id, c.id, c.source_id, c.block_id, c.title, c.heading_path, c.content,
	       ts_rank_cd(c.tsv, websearch_to_tsquery('simple', $3)) as rank
	from public.ai_chunks c
	where c.source_kind = 'page'
	  and ${WORKSPACE_ALLOWED_SQL}
	  and ${ROW_ALLOWED_SQL}
	  and c.tsv @@ websearch_to_tsquery('simple', $3)
	order by rank desc, c.id
	limit ${LIST_LIMIT}
),
vectors as (
	select c.workspace_id, c.id, c.source_id, c.block_id, c.title, c.heading_path, c.content,
	       c.embedding <=> $4::halfvec as distance
	from public.ai_chunks c
	where c.source_kind = 'page'
	  and ${WORKSPACE_ALLOWED_SQL}
	  and ${ROW_ALLOWED_SQL}
	order by c.embedding <=> $4::halfvec
	limit ${LIST_LIMIT}
),
fused as (
	select coalesce(l.workspace_id, v.workspace_id) as workspace_id,
	       coalesce(l.id, v.id) as id,
	       coalesce(l.source_id, v.source_id) as source_id,
	       coalesce(l.block_id, v.block_id) as block_id,
	       coalesce(l.title, v.title) as title,
	       coalesce(l.heading_path, v.heading_path) as heading_path,
	       coalesce(l.content, v.content) as content,
	       coalesce(1.0 / (60 + l.rn), 0) + coalesce(1.0 / (60 + v.rn), 0) as score
	from (select lexical.*, row_number() over (order by rank desc, id) as rn from lexical) l
	full join (select vectors.*, row_number() over (order by distance, id) as rn from vectors) v
	  on v.workspace_id = l.workspace_id and v.id = l.id
)
select source_id, block_id, title, heading_path, content, score
from fused
order by score desc, id
limit ${FUSED_LIMIT}`;

/** The pages of the candidates, in one query: the ones that are not archived. */
const PAGES_SQL = `
	select id, workspace_id, owner_id, visibility, collaborators, title
	from public.osionos_pages
	where id = any($1::uuid[]) and archived_at is null`;

/**
 * The embedder of the retrieval: the local embedding service of the
 * deployment, the one the indexer writes its vectors with.
 *
 * It is read the first time it is needed and not when the module is imported:
 * a service that never searches a workspace does not need a URL, and the tests
 * point it at their mock after the process has started.
 */
let embedder: Embedder | null | undefined;

/** The embedder of the retrieval, or nothing when none is configured. */
export function retrievalEmbedder(): Embedder | null {
	if (embedder !== undefined) return embedder;
	const baseUrl = (process.env.OSIONOS_AI_EMBED_URL ?? '').trim();
	embedder =
		baseUrl.length === 0
			? null
			: new Embedder({
					baseUrl,
					model: process.env.OSIONOS_AI_EMBED_MODEL ?? 'intfloat/multilingual-e5-small',
				});
	return embedder;
}

/** The query of the embedder: the model needs its prefix. */
async function queryVector(embedder: Embedder, query: string): Promise<string> {
	const vectors = await embedder.embed([embedder.queryInput(query)]);
	const vector = vectors[0];
	if (!vector) throw new Error('tei_no_vector');
	return JSON.stringify(vector);
}

/**
 * The one statement of the search, in a transaction.
 *
 * The two settings are the ones the HNSW scan needs: the iterative scan keeps
 * the order of the distances while it skips the rows the permission predicate
 * refuses, and ef_search 100 is wide enough for the fifty rows of the list.
 */
async function fuse(
	db: Pool,
	{
		workspaces,
		userId,
		query,
		vector,
	}: { workspaces: readonly string[]; userId: string; query: string; vector: string },
): Promise<CandidateRow[]> {
	const client: PoolClient = await db.connect();
	try {
		await client.query('BEGIN');
		await client.query('SET LOCAL hnsw.iterative_scan = relaxed_order');
		await client.query('SET LOCAL hnsw.ef_search = 100');
		const result = await client.query<CandidateRow>(FUSION_SQL, [workspaces, userId, query, vector]);
		await client.query('COMMIT');
		return result.rows;
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

/** The snippet of a chunk: its text, cut to SNIPPET_CHARS. */
function snippet(content: string): string {
	if (content.length <= SNIPPET_CHARS) return content;
	return `${content.slice(0, SNIPPET_CHARS - 1)}…`;
}

/**
 * The candidates that survive the bridge's own rule.
 *
 * The pages are read in one query, and every one of them is checked with
 * canReadPageRowAsMember: a stale copy of the permissions in the index can
 * never leak a page. A page of the candidate that is gone, or archived, is
 * skipped too.
 */
async function readable(
	db: Pool,
	candidates: readonly CandidateRow[],
	user: AuthUser,
	workspaces: readonly string[],
	limit: number,
): Promise<RetrievedChunk[]> {
	if (candidates.length === 0) return [];
	const ids = [...new Set(candidates.map((candidate) => candidate.source_id))];
	const result = await db.query<PageRow>(PAGES_SQL, [ids]);
	const pages = new Map(result.rows.map((row) => [String(row.id).toLowerCase(), row]));
	const perPage = new Map<string, number>();
	const kept: RetrievedChunk[] = [];
	for (const candidate of candidates) {
		if (kept.length >= limit) break;
		const page = pages.get(String(candidate.source_id).toLowerCase());
		if (!page) continue;
		if (!canReadPageRowAsMember(page, user.userId, workspaces)) continue;
		const count = perPage.get(page.id) ?? 0;
		if (count >= MAX_CHUNKS_PER_PAGE) continue;
		perPage.set(page.id, count + 1);
		kept.push({
			pageId: String(page.id),
			blockId: candidate.block_id,
			title: String(page.title ?? '') || candidate.title,
			headingPath: candidate.heading_path,
			snippet: snippet(candidate.content),
			score: Number(candidate.score),
		});
	}
	return kept;
}

/**
 * The chunks that answer a question, in the caller's workspaces.
 *
 * It is the retrieval of a run: the question is embedded with the model's own
 * query prefix, the two lists are fused, and every page that comes out is
 * checked again with the bridge's rule.
 */
export async function retrieve(
	db: Pool,
	user: AuthUser,
	{ query, limit = DEFAULT_LIMIT }: { query: string; limit?: number },
): Promise<RetrievedChunk[]> {
	const question = query.trim();
	if (question.length === 0) return [];
	const embedder = retrievalEmbedder();
	if (!embedder) return [];
	// The workspaces are read live: a membership that ends ends at once.
	const workspaces = await liveMemberWorkspaces(db, user);
	if (workspaces.length === 0) return [];
	const vector = await queryVector(embedder, question);
	const candidates = await fuse(db, { workspaces, userId: user.userId, query: question, vector });
	return readable(db, candidates, user, workspaces, Math.max(0, limit));
}
