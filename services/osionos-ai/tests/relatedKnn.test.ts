import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { startHarness } from './harness.ts';
import { vectorFor } from './mockEmbed.ts';
import { EXACT_SQL, HNSW_SQL } from '../src/retrieval/related.ts';
import { USER_A } from './retrievalSeed.ts';

/**
 * The kNN of the related read (C105).
 *
 * The semantic neighbours stay in the workspace of the source, the answer is
 * exact where the corpus is small, and the HNSW takes over above a measured
 * threshold — with its recall measured, and its plan read.
 */

const harness = await startHarness();
const db: Pool = harness.app.db;

/** The number of pages of the big corpus: above the threshold of the exact scan. */
const BIG = 2100;

/** The number of pages of the small corpus: below it. */
const SMALL = 12;

/** The number of neighbours the answer holds. */
const K = 8;

/** A corpus of pages and their vectors, in a workspace. */
async function corpus(workspaceId: string, count: number, offset = 0): Promise<void> {
	await db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, collaborators, content)
		 select gen_random_uuid(), $1, $2, 'Page ' || g, 'shared', '[]'::jsonb, '[]'::jsonb
		 from generate_series(1, $3) g`,
		[workspaceId, USER_A, count],
	);
	// The vector of a page, built in SQL: the pages form groups of ten, and
	// the distance between two pages depends only on how far apart they are.
	// The nearest neighbours are then well defined — a corpus of equidistant
	// points measures nothing but the index's luck, and a halfvec cannot hold
	// a difference finer than its own precision.
	await db.query(
		`with numbered as (
			select id, workspace_id, row_number() over (order by id) as ord
			from public.osionos_pages where workspace_id = $1
		)
		insert into public.ai_page_vectors (workspace_id, page_id, embedding, embedding_model)
		select n.workspace_id, n.id, v.embedding::halfvec, 'test'
		from numbered n
		cross join lateral (
			select array_agg(
				case
					when g = 0 then 0.0
					when g = 1 then ((n.ord + $2) % 10) * 0.01
					else 0.1 * sin(g::float8 + floor((n.ord + $2) / 10) * 0.7)
				end
				order by g) as embedding
			from generate_series(0, 383) g
		) v`,
		[workspaceId, offset],
	);
	await db.query('analyze public.ai_page_vectors');
	await db.query('analyze public.osionos_pages');
}

/** The partition a workspace's vectors land in. */
async function partitionOf(workspaceId: string): Promise<string> {
	const result = await db.query(
		'select tableoid::regclass::text as partition from public.ai_page_vectors where workspace_id = $1 limit 1',
		[workspaceId],
	);
	return String(result.rows[0]?.partition ?? '');
}

/** A workspace whose vectors land in the same partition as the given one. */
async function samePartition(workspaceId: string): Promise<string> {
	const wanted = await partitionOf(workspaceId);
	for (let attempt = 0; attempt < 64; attempt += 1) {
		const candidate = randomUUID();
		await db.query(
			`insert into public.ai_page_vectors (workspace_id, page_id, embedding, embedding_model)
			 values ($1, $2, $3::halfvec, 'test')`,
			[candidate, randomUUID(), JSON.stringify(vectorFor('probe'))],
		);
		const partition = await partitionOf(candidate);
		await db.query('delete from public.ai_page_vectors where workspace_id = $1', [candidate]);
		if (partition === wanted) return candidate;
	}
	throw new Error('no workspace landed in the same partition');
}

/** The plan of a statement, without the vector literal: it is a screen of noise. */
function readablePlan(plan: string): string {
	return plan.replace(/\[\[-0-9.,Ee+ ]+\]/g, '[the vector]');
}

/** The top pages of a query, and the plan of the statement. */
async function topOf(sql: string, workspaceId: string, limit: number): Promise<{ ids: string[]; distances: number[]; plan: string; ms: number }> {
	const source = await db.query(
		'select page_id, embedding::text as embedding from public.ai_page_vectors where workspace_id = $1 limit 1',
		[workspaceId],
	);
	const vector = String(source.rows[0]?.embedding ?? '');
	// The settings of the route: the iterative scan and the width of the scan.
	const client = await db.connect();
	try {
		await client.query('SET hnsw.iterative_scan = relaxed_order');
		await client.query('SET hnsw.ef_search = 100');
		const started = Date.now();
		const plan = await client.query<{ 'QUERY PLAN': string }>(`explain (analyze, buffers) ${sql}`, [
			vector,
			workspaceId,
			[workspaceId],
			USER_A,
			randomUUID(),
			limit,
		]);
		const ms = Date.now() - started;
		const rows = await client.query<{ page_id: string; distance: number }>(sql, [vector, workspaceId, [workspaceId], USER_A, randomUUID(), limit]);
		return {
			ids: rows.rows.map((row) => String(row.page_id)),
			distances: rows.rows.map((row) => Number(row.distance)),
			plan: readablePlan(plan.rows.map((row) => row['QUERY PLAN']).join('\n')),
			ms,
		};
	} finally {
		client.release();
	}
}

before(async () => {
	await db.query('delete from public.ai_page_vectors');
	await db.query('delete from public.osionos_pages');
});

after(async () => {
	// The corpus of the test is gone: the suites that follow share the
	// database, and a thousand pages would be in their way.
	await db.query('delete from public.ai_page_vectors');
	await db.query('delete from public.osionos_pages');
	await db.query('delete from public.ai_index_queue');
	await harness.app.close();
	await harness.mock.close();
});

describe('the kNN of the related read (C105)', () => {
	it('a small workspace inside a big partition answers the exact top-8, and reads one partition', async () => {
		const big = randomUUID();
		await corpus(big, BIG, 1000);
		const small = await samePartition(big);
		await corpus(small, SMALL, 0);
		assert.equal(await partitionOf(small), await partitionOf(big), 'the two share a partition');

		// The exact scan, and the HNSW scan, over the small workspace. The
		// HNSW fetches more than it needs, the way the route does: the pages
		// the index still holds of a deleted row take a place of their own.
		const exact = await topOf(EXACT_SQL, small, K);
		const hnsw = await topOf(HNSW_SQL, small, K * 4);
		console.log(`[knn] the plan of the exact scan:\n${exact.plan}`);
		console.log(`[knn] the plan of the HNSW scan:\n${hnsw.plan}`);
		console.log(`[knn] exact ${exact.ms} ms, hnsw ${hnsw.ms} ms, ${BIG} vectors in the partition`);

		// One partition only: the one of the workspace of the caller.
		const partitions = [...exact.plan.matchAll(/ai_page_vectors_(p\d\d)/g)].map((match) => match[1]);
		assert.deepEqual([...new Set(partitions)], [(await partitionOf(small)).replace('ai_page_vectors_', '')]);

		// The exact scan does not use the HNSW index.
		assert.ok(!/ai_page_vectors_embedding_hnsw/.test(exact.plan), 'the exact scan is exact');
		// It reads the workspace through the btree of the primary key.
		assert.match(exact.plan, /ai_page_vectors_p\d\d_pkey/, 'the exact scan reads the btree');

		// The top-8 of the small workspace is the exact top-8.
		assert.deepEqual(exact.ids.slice(0, K).sort(), hnsw.ids.slice(0, K).sort());
	});

	it('the HNSW scan of a big corpus finds the exact neighbours, and the recall is measured', async () => {
		const big = randomUUID();
		await corpus(big, BIG, 1000);
		const exact = await topOf(EXACT_SQL, big, K);
		const hnsw = await topOf(HNSW_SQL, big, K * 4);
		console.log(`[knn] the plan of the HNSW scan of a big corpus:\n${hnsw.plan}`);
		console.log(`[knn] exact ${exact.ms} ms, hnsw ${hnsw.ms} ms, ${BIG} pages`);
		console.log(`[knn] the exact distances: ${exact.distances.map((d) => d.toFixed(6)).join(' ')}`);
		console.log(`[knn] the hnsw distances: ${hnsw.distances.map((d) => d.toFixed(6)).join(' ')}`);
		const found = new Set(hnsw.ids);
		const recall = exact.ids.slice(0, K).filter((id) => found.has(id)).length / K;
		console.log(`[knn] recall@${K} of the HNSW scan: ${recall.toFixed(3)}`);
		assert.match(hnsw.plan, /embedding_idx/, 'the HNSW scan uses the index');
		assert.ok(recall >= 0.9, `the recall is ${recall}`);
	});
});
