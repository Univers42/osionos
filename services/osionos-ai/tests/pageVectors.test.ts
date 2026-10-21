import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { Pool } from 'pg';
import { Embedder } from '../src/indexer/embedder.ts';
import { IndexerWorker } from '../src/indexer/worker.ts';
import { estimateTokens } from '../src/indexer/chunker.ts';
import { pageVector } from '../src/indexer/pageVector.ts';
import { startMockEmbedder, vectorFor } from './mockEmbed.ts';

/**
 * The page vectors (C104): the vector of a page goes with the page, in the
 * page write's own transaction, and two replicas that index the same page
 * write the same vector.
 */

const DATABASE_URL = process.env.OSIONOS_AI_DATABASE_URL ?? '';
const USER_A = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const OTHER_WORKSPACE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
const mock = await startMockEmbedder();
const embedder = new Embedder({ baseUrl: mock.baseUrl, model: 'intfloat/multilingual-e5-small' });

/** The lines the worker wrote. */
const log = (): void => undefined;

/** The worker under test: the debounce is off, so a test does not wait. */
function newWorker(): IndexerWorker {
	return new IndexerWorker({ pool, embedder, debounceSeconds: 0, log });
}

/** A page, inserted: the trigger queues it. */
async function insertPage(content: string[], title = 'A page'): Promise<string> {
	const id = randomUUID();
	await pool.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, collaborators, content)
		 values ($1, $2, $3, $4, 'shared', '[]'::jsonb, $5::jsonb)`,
		[id, WORKSPACE, USER_A, title, JSON.stringify(content)],
	);
	return id;
}

/** The vector of a page, as the indexer wrote it. */
async function vectorOfPage(pageId: string): Promise<number[] | null> {
	const result = await pool.query<{ embedding: string }>(
		'select embedding::text as embedding from public.ai_page_vectors where page_id = $1',
		[pageId],
	);
	const text = result.rows[0]?.embedding;
	if (!text) return null;
	return JSON.parse(text) as number[];
}

/** The number of vector rows of a page. */
async function countOfPage(pageId: string, client: Pick<Pool, "query"> = pool): Promise<number> {
	const result = await client.query<{ count: number }>(
		'select count(*)::int as count from public.ai_page_vectors where page_id = $1',
		[pageId],
	);
	return Number(result.rows[0]?.count ?? 0);
}

/**
 * The vector of a page, recomputed by hand: the token-length-weighted mean of
 * the vectors of its chunks, L2-normalised.
 */
async function bruteForce(pageId: string): Promise<number[] | null> {
	const chunks = await pool.query<{ heading_path: string; content: string; embedding: string }>(
		`select heading_path, content, embedding::text as embedding
		   from public.ai_chunks
		  where source_kind = 'page' and source_id = $1
		  order by ord`,
		[pageId],
	);
	const weighted = chunks.rows.map((chunk) => {
		const input = embedder.passageInput(chunk.heading_path, chunk.content);
		return { vector: vectorFor(input), tokens: estimateTokens(input) };
	});
	return pageVector(weighted);
}

/** The vectors are equal to a precision the halfvec can hold. */
function closeEnough(left: number[] | null, right: number[] | null): boolean {
	if (!left || !right || left.length !== right.length) return false;
	return left.every((value, index) => Math.abs(value - (right[index] ?? 0)) < 1e-3);
}

const applied = await pool.query("select to_regclass('public.ai_page_vectors') as vectors");
const hasVectors = Boolean(applied.rows[0]?.vectors);

before(async () => {
	if (!hasVectors) return;
	await pool.query('delete from public.osionos_pages');
	await pool.query('delete from public.ai_index_queue');
});

after(async () => {
	if (hasVectors) {
		await pool.query('delete from public.osionos_pages');
		await pool.query('delete from public.ai_index_queue');
	}
	await mock.close();
	await pool.end();
});

describe('the page vectors', { skip: hasVectors ? false : 'the graph migration was not applied' }, () => {
	it('the indexer writes the weighted mean of the chunks of the page', async () => {
		const pageId = await insertPage([
			{ id: 'b1', type: 'paragraph', content: 'The first block of the page.' },
			{ id: 'b2', type: 'paragraph', content: 'The second block of the page, a little longer than the first one.' },
		]);
		await newWorker().tick();
		assert.equal(await countOfPage(pageId), 1, 'one vector for the page');
		const written = await vectorOfPage(pageId);
		const expected = await bruteForce(pageId);
		assert.ok(closeEnough(written, expected), 'the vector is the weighted mean of the chunks');
	});

	it('two replicas that index the same page write the same vector', async () => {
		const pageId = await insertPage([
			{ id: 'b1', type: 'paragraph', content: 'The first block of the page.' },
			{ id: 'b2', type: 'paragraph', content: 'The second block of the page, a little longer than the first one.' },
		]);
		const first = newWorker();
		const second = newWorker();
		await Promise.all([first.tick(), second.tick()]);
		assert.equal(await countOfPage(pageId), 1, 'one vector for the page');
		const written = await vectorOfPage(pageId);
		const expected = await bruteForce(pageId);
		assert.ok(closeEnough(written, expected), 'the vector is the weighted mean of the chunks');
	});

	it('an archived page loses its vector, in the transaction of the archive', async () => {
		const pageId = await insertPage([{ id: 'b1', type: 'paragraph', content: 'A block.' }]);
		await newWorker().tick();
		assert.equal(await countOfPage(pageId), 1);
		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			await client.query('update public.osionos_pages set archived_at = now() where id = $1', [pageId]);
			assert.equal(await countOfPage(pageId, client), 0, 'the vector is gone before the commit');
			await client.query('ROLLBACK');
		} finally {
			client.release();
		}
	});

	it('a deleted page loses its vector, in the transaction of the delete', async () => {
		const pageId = await insertPage([{ id: 'b1', type: 'paragraph', content: 'A block.' }]);
		await newWorker().tick();
		assert.equal(await countOfPage(pageId), 1);
		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			await client.query('delete from public.osionos_pages where id = $1', [pageId]);
			assert.equal(await countOfPage(pageId, client), 0, 'the vector is gone before the commit');
			await client.query('ROLLBACK');
		} finally {
			client.release();
		}
	});

	it('a page that moves workspace leaves no vector behind in the old partition', async () => {
		const pageId = await insertPage([{ id: 'b1', type: 'paragraph', content: 'A block.' }]);
		await newWorker().tick();
		assert.equal(await countOfPage(pageId), 1);
		const client = await pool.connect();
		try {
			await client.query('BEGIN');
			await client.query('update public.osionos_pages set workspace_id = $2 where id = $1', [pageId, OTHER_WORKSPACE]);
			assert.equal(await countOfPage(pageId, client), 0, 'the vector is gone before the commit');
			await client.query('ROLLBACK');
		} finally {
			client.release();
		}
	});
});
