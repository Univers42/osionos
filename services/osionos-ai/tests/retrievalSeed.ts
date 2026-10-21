import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { vectorFor } from './mockEmbed.ts';

/**
 * The seeds of the retrieval tests: the pages and their chunks, written
 * directly.
 *
 * The worker is not needed: the chunks are written with the ACL the indexer
 * would write (the visibility normalized by ai_page_visibility, the
 * collaborators reduced by ai_collaborator_ids), and with the vectors of the
 * mock embedding service, so a test knows exactly what the search will find.
 */

/** The users of the tests. */
export const USER_A = '11111111-1111-4111-8111-111111111111';
export const USER_B = '22222222-2222-4222-8222-222222222222';
export const USER_C = '33333333-3333-4333-8333-333333333333';

/** The workspaces of the tests. */
export const WORKSPACE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const WORKSPACE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const WORKSPACE_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/** One page of a seed, and the chunk that carries it. */
export interface PageSeed {
	/** The workspace of the page. */
	workspaceId: string;
	/** The owner of the page. */
	ownerId: string | null;
	/** The title of the page. */
	title: string;
	/** The visibility of the page: the rule reads it raw. */
	visibility: string | null;
	/** The collaborators of the page, as the bridge stores them. */
	collaborators?: unknown[];
	/** The text of the chunk. */
	content: string;
	/** The vector of the chunk. */
	embedding: number[];
	/** The path of the headings of the chunk. */
	headingPath?: string;
	/** The number of chunks of the page: one by default. */
	chunks?: number;
}

/** The page and the chunk of a seed. */
export interface Seeded {
	pageId: string;
	chunkId: string;
}

/**
 * A page and its chunk, with the ACL the indexer writes.
 *
 * The chunk carries the page's permissions as the trigger writes them: the
 * visibility normalized, the collaborators reduced to the ids that carry a
 * role. The page itself is written with the raw values, so the rule reads
 * what the bridge reads.
 */
export async function seedPage(pool: Pool, seed: PageSeed): Promise<Seeded> {
	const pageId = randomUUID();
	await pool.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, collaborators, content)
		 values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
		[
			pageId,
			seed.workspaceId,
			seed.ownerId,
			seed.title,
			seed.visibility,
			JSON.stringify(seed.collaborators ?? []),
			JSON.stringify([{ id: 'b1', type: 'paragraph', content: seed.content }]),
		],
	);
	const chunk = await pool.query<{ id: string }>(
		`insert into public.ai_chunks (
			workspace_id, source_kind, source_id, block_id, ord, title, heading_path, content,
			content_hash, owner_id, visibility, collaborator_ids, embedding, embedding_model
		 ) select $1, 'page', $2, 'b' || n, n - 1, $3, $4, $5, $6::bytea, $7,
			public.ai_page_visibility($8), public.ai_collaborator_ids($9::jsonb), $10::halfvec, 'mock'
		 from generate_series(1, $11) as n
		 returning id`,
		[
			seed.workspaceId,
			pageId,
			seed.title,
			seed.headingPath ?? seed.title,
			seed.content,
			Buffer.from(randomUUID().replaceAll('-', ''), 'hex'),
			seed.ownerId,
			seed.visibility,
			JSON.stringify(seed.collaborators ?? []),
			JSON.stringify(seed.embedding),
			seed.chunks ?? 1,
		],
	);
	return { pageId, chunkId: String(chunk.rows[0].id) };
}

/** The vector of a text, as the mock embedding service gives it. */
export function vectorOf(text: string): number[] {
	return vectorFor(text, 384);
}

/**
 * A vector turned away from another one, by a known angle.
 *
 * The turn is orthogonal to the vector it turns, so the cosine distance of
 * the two is 1 - 1/sqrt(1 + t*t), whatever the vector is: 0.106 for a turn of
 * a half, against 0 for the vector itself.
 *
 * A shorter vector would not do: the cosine distance does not see the length.
 */
export function turnedVector(vector: number[], t = 0.5): number[] {
	const norm = vector.reduce((sum, value) => sum + value * value, 0);
	const dot = vector[0];
	// The first axis, with the part of the vector taken out of it.
	const turned = vector.map((value, index) => (index === 0 ? 1 : 0) - (dot / norm) * value);
	const mixed = vector.map((value, index) => value + t * turned[index]);
	const length = Math.sqrt(mixed.reduce((sum, value) => sum + value * value, 0));
	return mixed.map((value) => value / length);
}

/** The pages of a test, and their chunks, gone. */
export async function clearPages(pool: Pool, pageIds: readonly string[]): Promise<void> {
	if (pageIds.length === 0) return;
	// The trigger of the RAG migration takes the chunks of the page with it.
	await pool.query('delete from public.osionos_pages where id = any($1::uuid[])', [pageIds]);
}

/**
 * The bulk of a corpus: the rows the planner needs to choose the indexes.
 *
 * One of them carries the rare word of the search, so the full text scan has
 * something to find; the rest are the corpus around it.
 */
export async function seedBulk(pool: Pool, workspaceId: string, count: number): Promise<string[]> {
	const result = await pool.query<{ id: string }>(
		`insert into public.ai_chunks (
			workspace_id, source_kind, source_id, block_id, ord, title, heading_path, content,
			content_hash, owner_id, visibility, collaborator_ids, embedding, embedding_model
		 ) select $1, 'page', gen_random_uuid(), 'b1', 0, 'Bulk ' || n, 'Bulk ' || n,
			case when n = 1 then 'the rare word zorblaxquux lives here' else 'the bulk of the corpus ' || n end,
			md5(n::text)::bytea, $2, 'shared', '{}'::uuid[],
			(array(select (abs(('x' || substr(md5(n::text || g::text), 1, 8))::bit(32)::int)::real / 2147483647.0)
			         from generate_series(1, 384) as g))::halfvec, 'mock'
		 from generate_series(1, $3) as n
		 returning id`,
		[workspaceId, USER_A, count],
	);
	return result.rows.map((row) => String(row.id));
}

/** The chunks of a test, gone. */
export async function clearChunks(pool: Pool, chunkIds: readonly string[]): Promise<void> {
	if (chunkIds.length === 0) return;
	await pool.query('delete from public.ai_chunks where id = any($1::bigint[])', [chunkIds]);
}

/**
 * The seeds of a test file: the pages it writes, and the bulk of the corpus.
 *
 * The seeds are gone on demand: a test that writes rows must not leave them
 * for the next one, in the same file or in another.
 */
export class Seeds {
	private readonly pool: Pool;
	private readonly pages: string[] = [];
	private readonly chunks: string[] = [];

	constructor(pool: Pool) {
		this.pool = pool;
	}

	/** A page and its chunk, written in the index. */
	async page(input: PageSeed): Promise<string> {
		const { pageId } = await seedPage(this.pool, input);
		this.pages.push(pageId);
		return pageId;
	}

	/** The bulk of a corpus: the rows the planner needs to choose the indexes. */
	async bulk(workspaceId: string, count: number): Promise<void> {
		const ids = await seedBulk(this.pool, workspaceId, count);
		this.chunks.push(...ids);
	}

	/** The seeds are gone, and so are the member rows of the test. */
	async clear(): Promise<void> {
		await clearPages(this.pool, this.pages);
		await clearChunks(this.pool, this.chunks);
		this.pages.length = 0;
		this.chunks.length = 0;
		await this.pool.query('delete from public.osionos_workspace_members');
		// The vacuum takes the dead entries of the HNSW graph out of the index:
		// pgvector keeps them until then, and a row written after a deletion
		// can be out of the reach of the search while they are there. The
		// autovacuum of the deployment does the same.
		await this.pool.query('vacuum public.ai_chunks');
	}
}
