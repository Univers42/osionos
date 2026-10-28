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
const BIG = 2106;

/** The number of pages of the small corpus: below it. */
const SMALL = 12;

/** The number of neighbours the answer holds. */
const K = 8;

/**
 * The number of pages of a group: the source is not in its own answer, so a
 * group holds K + 1 pages and the exact top-K of a page is the rest of it.
 */
const GROUP = K + 1;

/** The number of source pages the recall of the big corpus is measured over. */
const QUERIES = 24;

/** A corpus of pages and their vectors, in a workspace. */
async function corpus(workspaceId: string, count: number, offset = 0): Promise<void> {
	const client = await db.connect();
	try {
		await client.query('begin');
		// The corpus is itself a build of the HNSW graph, not the read under
		// test: the pool's 5 s statement timeout is the budget of one request,
		// and a shared host can spend it on 2106 vectors of 384 dimensions.
		await client.query("set local statement_timeout = '60s'");
		await client.query(
			`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, collaborators, content)
			 select gen_random_uuid(), $1, $2, 'Page ' || g, 'shared', '[]'::jsonb, '[]'::jsonb
			 from generate_series(1, $3) g`,
			[workspaceId, USER_A, count],
		);
		// The vector of a page, built in SQL in one statement. The pages form
		// groups of K + 1 (the big corpus is a multiple of it, so all of its
		// groups are full): the source is excluded from its own answer, so the
		// exact top-K of a page in a full group is the eight other pages.
		//
		// The centre of a group is spread over all 384 dimensions by a hash of
		// (group, dimension), uniform in [-0.1, 0.1], so the centres are close
		// to orthogonal; each page adds a smaller hash of (group, member,
		// dimension), uniform in [-0.02, 0.02], and a marker on its own
		// dimension. In a full group the eighth neighbour is then the farthest
		// page of the group, far from every page of every other group, and no
		// tie can fall on the eighth place. (The old corpus was a circle times
		// a segment: every vector lay in three dimensions, and the groups nine
		// apart were 9 × 0.7 = 6.3 rad apart — 0.017 rad short of a full turn,
		// so near-duplicate clusters left whole regions of the HNSW graph
		// unreachable.)
		//
		// Measured on the big corpus: the 25 sources of the recall test had all
		// eight of their neighbours in their own group; their eighth distance
		// was 0.038–0.050 and the first page of another group was at least
		// 0.782 away. The 234 groups have exactly nine pages each, and the 2106
		// vectors are distinct.
		//
		// The vectors go in shuffled, as pages do: sorted along the curve is
		// the HNSW's worst insertion order. Measured on this suite's shape
		// (pgvector 0.8.0, m 16, ef_construction 64, ef_search 100): 20 runs
		// of this file after the fixture, 0 failures, min mean recall 1.000,
		// median 1.000. The old fixture passed 20 of 20 on the same host too;
		// the CI run that failed had 3 of 25 sources with 0.00 of their eight
		// neighbours (mean 0.880).
		// Caveat: this corpus is still synthetic — it does not exercise the
		// uneven density, the varying cluster size, or the near-duplicate
		// clusters of real embeddings, only that the graph can reach a whole
		// group.
		await client.query(
			`with numbered as (
				select id, workspace_id, row_number() over (order by id) as ord
				from public.osionos_pages where workspace_id = $1
			), placed as (
				select id, workspace_id,
					$2::bigint + (ord - 1) / $3::int as grp,
					(ord - 1) % $3::int as member
				from numbered
			)
			insert into public.ai_page_vectors (workspace_id, page_id, embedding, embedding_model)
			select p.workspace_id, p.id, v.embedding::halfvec, 'test'
			from placed p
			cross join lateral (
				select array_agg(
					0.1::float8 * (((hashtextextended(p.grp::text || ':' || g::text, 0) % 2001 + 2001) % 2001)::float8 / 1000.0 - 1.0)
					+ 0.02::float8 * (((hashtextextended(p.grp::text || ':' || p.member::text || ':' || g::text, 0) % 2001 + 2001) % 2001)::float8 / 1000.0 - 1.0)
					+ case when g = p.member then 0.04::float8 else 0.0::float8 end
					order by g) as embedding
				from generate_series(0, 383) g
			) v
			order by random()`,
			[workspaceId, offset, GROUP],
		);
		await client.query('commit');
	} catch (error) {
		await client.query('rollback').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
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

/** A workspace whose vectors land in the same partition as the given one.
 *  Postgres picks it from the partition's own bound: 64 random draws over 16
 *  hash partitions missed in 1.6 % of runs and failed the suite. */
async function samePartition(workspaceId: string): Promise<string> {
	const wanted = await partitionOf(workspaceId);
	const bound = await db.query(
		'select pg_get_expr(relpartbound, oid) as bound from pg_class where oid = $1::regclass',
		[wanted],
	);
	const hash = /modulus (\d+), remainder (\d+)/.exec(String(bound.rows[0]?.bound ?? ''));
	if (!hash) throw new Error(`${wanted} is not a hash partition`);
	const result = await db.query(
		`select id::text from (select gen_random_uuid() as id from generate_series(1, 4096)) candidates
		 where satisfies_hash_partition('public.ai_page_vectors'::regclass, $1::int, $2::int, id)
		 limit 1`,
		[Number(hash[1]), Number(hash[2])],
	);
	const candidate = result.rows[0]?.id;
	if (!candidate) throw new Error('no workspace landed in the same partition');
	return String(candidate);
}

/** The plan of a statement, without the vector literal: it is a screen of noise. */
function readablePlan(plan: string): string {
	return plan.replace(/\[\[-0-9.,Ee+ ]+\]/g, '[the vector]');
}

/** The top pages of a query from a source page (any page of the workspace by default), and the plan of the statement. */
async function topOf(sql: string, workspaceId: string, limit: number, sourcePageId: string | null = null): Promise<{ ids: string[]; distances: number[]; plan: string; ms: number }> {
	const source = await db.query(
		'select page_id, embedding::text as embedding from public.ai_page_vectors where workspace_id = $1 and ($2::uuid is null or page_id = $2) limit 1',
		[workspaceId, sourcePageId],
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

/** Whether the graph migration is applied: the kNN needs the page vectors. */
const applied = await db.query("select to_regclass('public.ai_page_vectors') as vectors");
const hasVectors = Boolean(applied.rows[0]?.vectors);

before(async () => {
	if (!hasVectors) return;
	await db.query('delete from public.ai_page_vectors');
	await db.query('delete from public.osionos_pages');
});

after(async () => {
	// The corpus of the test is gone: the suites that follow share the
	// database, and a thousand pages would be in their way.
	if (hasVectors) {
		await db.query('delete from public.ai_page_vectors');
		await db.query('delete from public.osionos_pages');
		await db.query('delete from public.ai_index_queue');
	}
	await harness.app.close();
	await harness.mock.close();
});

describe('the kNN of the related read (C105)', { skip: hasVectors ? false : 'the graph migration was not applied' }, () => {
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
		// The measure is the mean over sources spread through the corpus: an
		// unreachable group costs a source all eight of its neighbours, so the
		// mean is the share of the graph the index can reach.
		// Caveat: 25 sources sample the graph — a region the index left
		// unreachable that holds under ~10% of the pages can still pass.
		const sources = await db.query<{ page_id: string }>(
			`select page_id from (
				select page_id, row_number() over (order by page_id) as n
				from public.ai_page_vectors where workspace_id = $1
			) numbered where n % $2 = 1`,
			[big, Math.floor(BIG / QUERIES)],
		);
		assert.ok(sources.rows.length >= QUERIES, `${sources.rows.length} sources`);
		const recalls: number[] = [];
		let plan = '';
		for (const { page_id: sourcePageId } of sources.rows) {
			const exact = await topOf(EXACT_SQL, big, K, sourcePageId);
			const hnsw = await topOf(HNSW_SQL, big, K * 4, sourcePageId);
			plan ||= hnsw.plan;
			const found = new Set(hnsw.ids);
			recalls.push(exact.ids.slice(0, K).filter((id) => found.has(id)).length / K);
		}
		const mean = recalls.reduce((sum, recall) => sum + recall, 0) / recalls.length;
		console.log(`[knn] the plan of the HNSW scan of a big corpus:\n${plan}`);
		console.log(`[knn] recall@${K} of the HNSW scan over ${recalls.length} sources: mean ${mean.toFixed(3)}, each ${recalls.map((recall) => recall.toFixed(2)).join(' ')}`);
		assert.match(plan, /embedding_idx/, 'the HNSW scan uses the index');
		assert.ok(mean >= 0.9, `the mean recall is ${mean}`);
	});
});
