import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { AuthUser } from '../auth.ts';
import type { QueryRunner } from '../db.ts';
import { Embedder } from '../indexer/embedder.ts';
import { canReadPageRowAsMember } from '../../../../scripts/bridge-page-read.mjs';
import { ROW_ALLOWED_SQL, WORKSPACE_ALLOWED_SQL, liveMemberWorkspaces } from './acl.ts';
import { RERANK_TIMEOUT_MS, RerankError, rerank } from './rerank.ts';

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

/** The rows of one half of a pack search: the twenty best of a list. */
const PACK_LIST_LIMIT = 20;

/** The pack chunks that go to the model: the ten best of the pack fusion. */
const PACK_FUSED_LIMIT = 10;

/** One chunk the search found, before the pages are checked. */
interface CandidateRow extends QueryResultRow {
	source_id: string;
	block_id: string | null;
	title: string;
	heading_path: string;
	content: string;
	score: number;
}

/** One document of a published pack: the scope of the pack search. */
interface PackDocRow extends QueryResultRow {
	id: string;
	slug: string;
	path: string;
}

/** One page, as the read rule reads it. */
export interface PageRow extends QueryResultRow {
	id: string;
	workspace_id: string;
	owner_id: string | null;
	visibility: string | null;
	collaborators: unknown;
	title: string | null;
}

/** One source of an answer: a chunk of a page the caller may read, or of a pack. */
export interface RetrievedChunk {
	/**
	 * Which index the chunk comes from: a page, or a curated pack document.
	 * Omitted means a page, so chunks built before packs existed stay valid.
	 * `web` is a search result or a fetched page of the web tools: it is
	 * never retrieved from the index, only found by a tool of the run.
	 */
	collection?: 'page' | 'pack' | 'web';
	/**
	 * The page the chunk is in.
	 *
	 * Empty for a pack chunk: a pack document is not a page, and has no id a
	 * `read_page` call could take (C44).
	 */
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
	/** The slug of the pack, for a pack chunk. */
	packSlug?: string;
	/** The repo-relative path of the document, for a pack chunk. */
	docPath?: string;
	/** The canonical URL, for a web source (it has no page and no pack). */
	url?: string;
	/** The host of the URL, for a web source: what the client shows. */
	domain?: string;
	/**
	 * The cross-encoder score, in (0, 1). Present only when the reranker ran
	 * (OSIONOS_AI_RERANK_URL) and answered for this question.
	 */
	rerankScore?: number;
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

/**
 * The statement of the pack search: the same shape as FUSION_SQL, and a
 * different scope.
 *
 * FUSION_SQL stays byte-identical: its ACL columns are the page's, and they
 * mean nothing for a pack chunk. A pack is tenant-free (C45), so its only
 * filter is the workspace, the kind, and the documents of the packs the agent
 * carries. `source_id = any($2)` is what keeps a pack the agent did NOT ask
 * for out of the answer; the vector list would otherwise hold every pack chunk
 * of the system workspace.
 */
export const PACK_FUSION_SQL = `
with lexical as (
	select c.workspace_id, c.id, c.source_id, c.title, c.heading_path, c.content,
	       ts_rank_cd(c.tsv, websearch_to_tsquery('simple', $3)) as rank
	from public.ai_chunks c
	where c.workspace_id = $1
	  and c.source_kind = 'pack'
	  and c.source_id = any($2::uuid[])
	  and c.tsv @@ websearch_to_tsquery('simple', $3)
	order by rank desc, c.id
	limit ${PACK_LIST_LIMIT}
),
vectors as (
	select c.workspace_id, c.id, c.source_id, c.title, c.heading_path, c.content,
	       c.embedding <=> $4::halfvec as distance
	from public.ai_chunks c
	where c.workspace_id = $1
	  and c.source_kind = 'pack'
	  and c.source_id = any($2::uuid[])
	order by c.embedding <=> $4::halfvec
	limit ${PACK_LIST_LIMIT}
),
fused as (
	select coalesce(l.workspace_id, v.workspace_id) as workspace_id,
	       coalesce(l.id, v.id) as id,
	       coalesce(l.source_id, v.source_id) as source_id,
	       coalesce(l.title, v.title) as title,
	       coalesce(l.heading_path, v.heading_path) as heading_path,
	       coalesce(l.content, v.content) as content,
	       coalesce(1.0 / (60 + l.rn), 0) + coalesce(1.0 / (60 + v.rn), 0) as score
	from (select lexical.*, row_number() over (order by rank desc, id) as rn from lexical) l
	full join (select vectors.*, row_number() over (order by distance, id) as rn from vectors) v
	  on v.workspace_id = l.workspace_id and v.id = l.id
)
select source_id, null::text as block_id, title, heading_path, content, score
from fused
order by score desc, id
limit ${PACK_FUSED_LIMIT}`;

/**
 * The documents of the packs an agent carries, published only.
 *
 * One query, before the fusion: the ids are the scope of PACK_FUSION_SQL, and
 * the slug and path are what the citation carries (a pack chunk has no page).
 * `status = 'retired'` is how an operator takes a pack out of every answer.
 */
const PACK_DOCS_SQL = `
	select d.id, p.slug, d.path
	from public.ai_pack_docs d
	join public.ai_packs p on p.id = d.pack_id
	where p.slug = any($1::text[]) and p.status = 'published'`;

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

/**
 * The pack fusion, in a transaction, with the settings of the HNSW scan.
 *
 * The pack chunks all live in ONE workspace (the system one), so the statement
 * reads one partition, and the scope is the document ids.
 */
async function fusePacks(
	db: Pool,
	{
		workspaceId,
		docIds,
		query,
		vector,
	}: { workspaceId: string; docIds: readonly string[]; query: string; vector: string },
): Promise<CandidateRow[]> {
	const client: PoolClient = await db.connect();
	try {
		await client.query('BEGIN');
		await client.query('SET LOCAL hnsw.iterative_scan = relaxed_order');
		await client.query('SET LOCAL hnsw.ef_search = 100');
		const result = await client.query<CandidateRow>(PACK_FUSION_SQL, [workspaceId, docIds, query, vector]);
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
 * The pages of a set of ids the caller may read.
 *
 * The re-check of the retrieval: the chunks carry a COPY of the permissions of
 * their page, and this reads the LIVE row and applies the bridge's own rule. A
 * stale copy can never leak a page, and a page that is gone or archived is
 * simply not there.
 *
 * The related-pages read (retrieval/related.ts) re-checks its candidates the
 * same way: one rule, one place. It runs the read on the connection it holds,
 * so the parameter is a RUNNER and not a pool.
 */
export async function readablePages(
	db: QueryRunner,
	ids: readonly string[],
	user: AuthUser,
	workspaces: readonly string[],
): Promise<Map<string, PageRow>> {
	const pages = new Map<string, PageRow>();
	if (ids.length === 0) return pages;
	const result = await db.query<PageRow>(PAGES_SQL, [ids]);
	for (const row of result.rows) {
		if (!canReadPageRowAsMember(row, user.userId, workspaces)) continue;
		pages.set(String(row.id).toLowerCase(), row);
	}
	return pages;
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
): Promise<ReadableChunk[]> {
	if (candidates.length === 0) return [];
	const ids = [...new Set(candidates.map((candidate) => candidate.source_id))];
	const pages = await readablePages(db, ids, user, workspaces);
	const perPage = new Map<string, number>();
	const kept: ReadableChunk[] = [];
	for (const candidate of candidates) {
		if (kept.length >= limit) break;
		const page = pages.get(String(candidate.source_id).toLowerCase());
		if (!page) continue;
		const count = perPage.get(page.id) ?? 0;
		if (count >= MAX_CHUNKS_PER_PAGE) continue;
		perPage.set(page.id, count + 1);
		kept.push({
			chunk: {
				collection: 'page',
				pageId: String(page.id),
				blockId: candidate.block_id,
				title: String(page.title ?? '') || candidate.title,
				headingPath: candidate.heading_path,
				snippet: snippet(candidate.content),
				score: Number(candidate.score),
			},
			content: candidate.content,
		});
	}
	return kept;
}

/** A chunk that passed the re-check, with its whole text (the snippet is cut). */
interface ReadableChunk {
	chunk: RetrievedChunk;
	content: string;
}

/** The text the cross-encoder reads: where the chunk is, then the whole chunk. */
function rerankText({ chunk, content }: ReadableChunk): string {
	return chunk.headingPath.length > 0 ? `${chunk.headingPath}\n${content}` : content;
}

/** The wait for the reranker: OSIONOS_AI_RERANK_TIMEOUT_MS, else the default. */
function rerankTimeoutMs(): number {
	const raw = Number(process.env.OSIONOS_AI_RERANK_TIMEOUT_MS);
	return Number.isFinite(raw) && raw > 0 ? raw : RERANK_TIMEOUT_MS;
}

/**
 * The best `limit` chunks by cross-encoder score.
 *
 * The reranker is an improvement and never a dependency: when it times out,
 * errors or answers nonsense, the fused order stands and the failure kind is
 * logged (never the texts).
 */
async function rerankChunks(
	baseUrl: string,
	query: string,
	candidates: readonly ReadableChunk[],
	limit: number,
): Promise<RetrievedChunk[]> {
	try {
		const scores = await rerank(baseUrl, query, candidates.map(rerankText), { timeoutMs: rerankTimeoutMs() });
		return candidates
			.map(({ chunk }, index) => ({ ...chunk, rerankScore: scores[index] }))
			.sort((left, right) => (right.rerankScore ?? 0) - (left.rerankScore ?? 0))
			.slice(0, limit);
	} catch (error) {
		const kind = error instanceof RerankError ? error.kind : 'unexpected';
		console.warn(JSON.stringify({ event: 'rerank_fallback', kind }));
		return candidates.slice(0, limit).map(({ chunk }) => chunk);
	}
}

/**
 * True when the reranker ran and even its best chunk scores under the
 * threshold: nothing in the workspace answers the question.
 *
 * Caveat: a null threshold never abstains, and chunks without a rerank score
 * (reranker off, or it failed and the fused order stands) never abstain
 * either: without the cross-encoder there is no score to trust.
 */
export function shouldAbstain(chunks: readonly RetrievedChunk[], threshold: number | null): boolean {
	if (threshold === null) return false;
	const scores = chunks.flatMap((chunk) => (chunk.rerankScore === undefined ? [] : [chunk.rerankScore]));
	return scores.length > 0 && Math.max(...scores) < threshold;
}

/** The threshold of OSIONOS_AI_ABSTAIN_THRESHOLD, or null when unset or not a number. */
export function abstainThreshold(): number | null {
	const raw = (process.env.OSIONOS_AI_ABSTAIN_THRESHOLD ?? '').trim();
	if (raw.length === 0) return null;
	const value = Number(raw);
	return Number.isFinite(value) ? value : null;
}

/**
 * The page candidates of a question, after the live re-check.
 *
 * It is the page half of today's retrieval: the caller's workspaces, read
 * live, the fused statement, and `canReadPageRowAsMember` on every page that
 * comes out.
 */
async function pageCandidates(
	db: Pool,
	user: AuthUser,
	question: string,
	vector: string,
	limit: number,
): Promise<ReadableChunk[]> {
	const workspaces = await liveMemberWorkspaces(db, user);
	if (workspaces.length === 0) return [];
	const candidates = await fuse(db, { workspaces, userId: user.userId, query: question, vector });
	return readable(db, candidates, user, workspaces, limit);
}

/**
 * The pack candidates of a question: the documents of the packs the agent
 * carries, published only, and no membership.
 *
 * A pack is tenant-free: it belongs to no workspace of the caller, and the
 * only scope is the agent's knowledge list. The chunk has no page, so it skips
 * the page re-check of `readable`; the slug and the document path are what the
 * citation carries instead.
 */
async function packCandidates(
	db: Pool,
	workspaceId: string,
	slugs: readonly string[],
	question: string,
	vector: string,
	limit: number,
): Promise<ReadableChunk[]> {
	const docs = await db.query<PackDocRow>(PACK_DOCS_SQL, [slugs]);
	if (docs.rows.length === 0) return [];
	const byId = new Map(docs.rows.map((row) => [String(row.id).toLowerCase(), row]));
	const candidates = await fusePacks(db, {
		workspaceId,
		docIds: docs.rows.map((row) => String(row.id)),
		query: question,
		vector,
	});
	const kept: ReadableChunk[] = [];
	for (const candidate of candidates) {
		if (kept.length >= limit) break;
		const doc = byId.get(String(candidate.source_id).toLowerCase());
		if (!doc) continue;
		kept.push({
			chunk: {
				collection: 'pack',
				pageId: '',
				blockId: null,
				packSlug: String(doc.slug),
				docPath: String(doc.path),
				title: String(candidate.title),
				headingPath: candidate.heading_path,
				snippet: snippet(candidate.content),
				score: Number(candidate.score),
			},
			content: candidate.content,
		});
	}
	return kept;
}

/**
 * The chunks that answer a question: the pages of the caller's workspaces,
 * and the knowledge packs of the run's agent.
 *
 * `pages` is the workspace search: on for a run that asked for it, and on for
 * the tools and the sources route (their default). `packs` is the agent's
 * knowledge list: the pack path needs no membership (a pack is tenant-free),
 * and runs on its own, even when the workspace search is off (C34).
 *
 * With no pack, the page path is today's, byte for byte. With both, the two
 * fusions are run separately and merged.
 */
export async function retrieve(
	db: Pool,
	user: AuthUser,
	{
		query,
		limit = DEFAULT_LIMIT,
		packs = [],
		pages = true,
	}: { query: string; limit?: number; packs?: readonly string[]; pages?: boolean },
): Promise<RetrievedChunk[]> {
	const question = query.trim();
	if (question.length === 0) return [];
	const packSlugs = [...new Set(packs.filter((slug) => slug.length > 0))];
	// C45: the system workspace is operator configuration. Unset, packs are
	// off everywhere, and the page path is the one of today. The config loads
	// only for a pack request: the eval runners call retrieve() without the
	// server's environment, and loading it there exits the process.
	const systemWorkspace = packSlugs.length > 0 ? (await import('../config.ts')).config.systemWorkspaceId : null;
	const packsOn = packSlugs.length > 0 && systemWorkspace !== null;
	if (!pages && !packsOn) return [];

	const max = Math.max(0, limit);
	const rerankUrl = (process.env.OSIONOS_AI_RERANK_URL ?? '').trim();

	// No pack: today's retrieval, with its own order of the checks (the
	// workspaces first, so a caller with none never embeds a question).
	if (!packsOn) {
		const workspaces = await liveMemberWorkspaces(db, user);
		if (workspaces.length === 0) return [];
		const embedder = retrievalEmbedder();
		if (!embedder) return [];
		const vector = await queryVector(embedder, question);
		const candidates = await fuse(db, { workspaces, userId: user.userId, query: question, vector });
		if (rerankUrl.length === 0) {
			const kept = await readable(db, candidates, user, workspaces, max);
			return kept.map(({ chunk }) => chunk);
		}
		// The cross-encoder reads every fused candidate that survives the re-check.
		const pool = await readable(db, candidates, user, workspaces, FUSED_LIMIT);
		if (pool.length === 0) return [];
		return rerankChunks(rerankUrl, question, pool, max);
	}

	const embedder = retrievalEmbedder();
	if (!embedder) return [];
	const vector = await queryVector(embedder, question);

	const pagePool = pages ? await pageCandidates(db, user, question, vector, FUSED_LIMIT) : [];
	const packPool = await packCandidates(
		db,
		systemWorkspace as string,
		packSlugs,
		question,
		vector,
		PACK_FUSED_LIMIT,
	);
	// Caveat: the two RRF lists are fused separately, so their scores are
	// comparable only in rank, not in relevance: 1/61 of a page is not the
	// same evidence as 1/61 of a pack. The merge is the best of each list, and
	// the reranker, when on, reorders the union.
	const union = [...pagePool, ...packPool].sort((left, right) => right.chunk.score - left.chunk.score);
	if (rerankUrl.length === 0) {
		return union.slice(0, max).map(({ chunk }) => chunk);
	}
	if (union.length === 0) return [];
	return rerankChunks(rerankUrl, question, union, max);
}
