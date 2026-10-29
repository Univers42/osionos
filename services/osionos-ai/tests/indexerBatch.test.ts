import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Pool } from 'pg';
import { packBatches } from '../src/indexer/batches.ts';
import { Embedder } from '../src/indexer/embedder.ts';
import { IndexerWorker } from '../src/indexer/worker.ts';
import { startMockEmbedder } from './mockEmbed.ts';

/**
 * The lanes of the queue and the cross-page batches.
 *
 * The lane of a row is the priority of the page in the queue: 0 is an edit a
 * person just made, 1 is bulk work. The claim reads the lane first, so an
 * edit never waits behind a backfill — and an edit PROMOTES a row that waits
 * in the bulk lane.
 *
 * The batches are the calls of the embedder: the chunks of every page of a
 * round are packed together, instead of one call per page.
 */

const DATABASE_URL = process.env.OSIONOS_AI_DATABASE_URL ?? '';
const USER_A = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

/** The token budget of the calls of the tests: the fifteen chunks fit in one. */
const BUDGET = 2000;

const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
const mock = await startMockEmbedder();
const embedder = new Embedder({ baseUrl: mock.baseUrl, model: 'intfloat/multilingual-e5-small' });

/** The lines the worker wrote. */
const logs: Record<string, unknown>[] = [];
const log = (entry: Record<string, unknown>): void => {
	logs.push(entry);
};

/** The worker under test: the debounce is off, so a test does not wait. */
function newWorker(): IndexerWorker {
	return new IndexerWorker({ pool, embedder, debounceSeconds: 0, log, embedTokenBudget: BUDGET });
}

/** A page: its blocks, and the ACL its chunks must carry. */
interface PageInput {
	title: string;
	content: unknown[];
	visibility?: string;
}

/** A page, inserted: the trigger queues it in the lane of an edit. */
async function insertPage(input: PageInput): Promise<string> {
	const id = randomUUID();
	await pool.query(
		`insert into public.osionos_pages
		   (id, workspace_id, owner_id, title, visibility, collaborators, content)
		 values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
		[
			id,
			WORKSPACE,
			USER_A,
			input.title,
			input.visibility ?? 'private',
			JSON.stringify([]),
			JSON.stringify(input.content),
		],
	);
	return id;
}

/**
 * The blocks of a page of five sections: five chunks of about 120 tokens.
 *
 * The last section is changed when `changed` is true: one chunk changes, and
 * the four others keep their hash.
 */
function fiveSections(marker: string, changed = false): unknown[] {
	const blocks: unknown[] = [];
	for (let index = 0; index < 5; index += 1) {
		blocks.push({ id: `h${index}`, type: 'heading_1', content: `Section ${index}` });
		const text = `${marker} ${'word '.repeat(95)}${changed && index === 4 ? ' changed' : ''}`;
		blocks.push({ id: `b${index}`, type: 'paragraph', content: text });
	}
	return blocks;
}

/** The chunks of a page, in the order of the page. */
async function chunksOf(pageId: string): Promise<Record<string, unknown>[]> {
	const result = await pool.query(
		`select ord, content, encode(content_hash, 'hex') as content_hash
		   from public.ai_chunks
		  where source_kind = 'page' and source_id = $1
		  order by ord`,
		[pageId],
	);
	return result.rows as Record<string, unknown>[];
}

/** The queue row of a page, or nothing when it is gone. */
async function queueRow(pageId: string): Promise<Record<string, unknown> | null> {
	const result = await pool.query(
		'select page_id, priority, dirty_at, attempts from public.ai_index_queue where page_id = $1',
		[pageId],
	);
	return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
}

/** Whether the RAG migration is applied: the lanes live in its queue. */
const rag = await pool.query(
	"select to_regclass('public.ai_chunks') as chunks, to_regclass('public.ai_index_queue') as queue",
);
const hasRag = Boolean(rag.rows[0]?.chunks) && Boolean(rag.rows[0]?.queue);

before(async () => {
	if (!hasRag) return;
	await pool.query('delete from public.osionos_pages');
	await pool.query('delete from public.ai_index_queue');
});

beforeEach(async () => {
	if (!hasRag) return;
	// Every test starts with an empty queue: the pages of a test are the
	// pages of that test.
	await pool.query('delete from public.osionos_pages');
	await pool.query('delete from public.ai_index_queue');
	logs.length = 0;
});

after(async () => {
	if (hasRag) {
		await pool.query('delete from public.osionos_pages');
		await pool.query('delete from public.ai_index_queue');
	}
	await mock.close();
	await pool.end();
});

describe('the lanes of the queue and the batches', { skip: hasRag ? false : 'the RAG migration was not applied' }, () => {
	it('claims the lane of an edit before the lane of a bulk page, whatever the age', async () => {
		const edit = await insertPage({ title: 'Edit', content: fiveSections('edit') });
		const bulk = await insertPage({ title: 'Bulk', content: fiveSections('bulk') });
		// The bulk row is OLD and waits in the bulk lane; the edit row is
		// NEWER and waits in the lane of an edit.
		await pool.query(
			`update public.ai_index_queue set priority = 1, dirty_at = now() - interval '10 minutes'
			  where page_id = $1`,
			[bulk],
		);
		await pool.query(
			`update public.ai_index_queue set dirty_at = now() - interval '1 minute' where page_id = $1`,
			[edit],
		);

		await newWorker().tick();

		const order = logs
			.filter((entry) => entry.event === 'indexed')
			.map((entry) => entry.pageId);
		assert.deepEqual(order, [edit, bulk], 'the edit is claimed first');
	});

	it('promotes a queued bulk row to the lane of an edit when the page is edited', async () => {
		const pageId = await insertPage({ title: 'Promoted', content: fiveSections('before') });
		await pool.query('update public.ai_index_queue set priority = 1 where page_id = $1', [pageId]);
		assert.equal((await queueRow(pageId))?.priority, 1);

		// The page is edited: the trigger enqueues it in the lane of an edit,
		// and it PROMOTES the row that waits in the bulk lane.
		await pool.query('update public.osionos_pages set content = $2::jsonb where id = $1', [
			pageId,
			JSON.stringify(fiveSections('after')),
		]);

		const row = await queueRow(pageId);
		assert.ok(row, 'the row is still queued');
		assert.equal(row?.priority, 0);
	});

	it('packs the chunks of the pages of a round into calls of the budget', () => {
		const items = Array.from({ length: 15 }, (_, index) => ({
			pageId: `page-${index % 3}`,
			hash: `hash-${index}`,
			input: 'x'.repeat(400),
			tokens: 100,
		}));
		const batches = packBatches(items, 500, 64);
		const total = items.reduce((sum, item) => sum + item.tokens, 0);
		assert.ok(batches.length <= Math.ceil(total / 500), 'the calls follow the budget');
		assert.equal(
			batches.reduce((sum, batch) => sum + batch.items.length, 0),
			15,
			'every chunk is in a call',
		);
		for (const batch of batches) {
			assert.ok(batch.tokens <= 500, 'a call is under the budget');
			assert.ok(batch.items.length <= 64, 'a call is under the number of inputs');
		}
	});

	it('embeds the chunks of three pages in as few calls as the budget allows, and writes every page once', async () => {
		const pages: string[] = [];
		for (let index = 0; index < 3; index += 1) {
			pages.push(await insertPage({ title: `Batch ${index}`, content: fiveSections(`page ${index}`) }));
		}

		const callsBefore = mock.calls;
		const inputsBefore = mock.inputs.length;
		const indexed = await newWorker().tick();
		assert.equal(indexed, 3, 'the three pages are indexed');

		const calls = mock.calls - callsBefore;
		const inputs = mock.inputs.slice(inputsBefore);
		assert.equal(inputs.length, 15, 'the fifteen chunks are embedded');
		const total = inputs.reduce((sum, input) => sum + Math.ceil(input.length / 4), 0);
		assert.ok(
			calls <= Math.ceil(total / BUDGET),
			`the calls (${calls}) follow the budget (${total} tokens)`,
		);
		assert.ok(calls < 3, `the calls are fewer than one per page (${calls})`);

		// Every page is written once: its five chunks are there.
		for (const pageId of pages) {
			assert.equal((await chunksOf(pageId)).length, 5);
			assert.equal(await queueRow(pageId), null);
		}

		// A chunk that did not change is not embedded again.
		const callsBeforeEdit = mock.calls;
		const inputsBeforeEdit = mock.inputs.length;
		await pool.query('update public.osionos_pages set content = $2::jsonb where id = $1', [
			pages[0],
			JSON.stringify(fiveSections('page 0', true)),
		]);
		await newWorker().tick();
		const sent = mock.inputs.slice(inputsBeforeEdit);
		assert.equal(mock.calls - callsBeforeEdit, 1, 'one call for the one chunk that changed');
		assert.equal(sent.length, 1);
		assert.ok(sent[0].includes('changed'));
	});
});
