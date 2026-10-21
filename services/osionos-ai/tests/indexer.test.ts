import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { Pool } from 'pg';
import { Embedder } from '../src/indexer/embedder.ts';
import { IndexerWorker } from '../src/indexer/worker.ts';
import { startMockEmbedder } from './mockEmbed.ts';

/**
 * The indexer, against the real database of the harness and a mock embedding
 * service: the queue is claimed, the page is cut, the chunks are embedded and
 * written back.
 *
 * The mock is deterministic: the same text always gives the same vector, so
 * a test can tell a chunk that was embedded again from a chunk that was kept.
 */

const DATABASE_URL = process.env.OSIONOS_AI_DATABASE_URL ?? '';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const WORKSPACE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

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
	return new IndexerWorker({ pool, embedder, debounceSeconds: 0, log });
}

/** A page: its blocks, and the ACL its chunks must carry. */
interface PageInput {
	title: string;
	content: unknown[];
	visibility?: string;
	collaborators?: unknown[];
	ownerId?: string | null;
}

/** A page, inserted: the trigger queues it. */
async function insertPage(input: PageInput): Promise<string> {
	const id = randomUUID();
	await pool.query(
		`insert into public.osionos_pages
		   (id, workspace_id, owner_id, title, visibility, collaborators, content)
		 values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
		[
			id,
			WORKSPACE,
			input.ownerId === undefined ? USER_A : input.ownerId,
			input.title,
			input.visibility ?? 'private',
			JSON.stringify(input.collaborators ?? []),
			JSON.stringify(input.content),
		],
	);
	return id;
}

/** The chunks of a page, in the order of the page. */
async function chunksOf(pageId: string): Promise<Record<string, unknown>[]> {
	const result = await pool.query(
		`select ord, block_id, title, heading_path, content, encode(content_hash, 'hex') as content_hash,
		        owner_id, visibility, collaborator_ids, embedding::text as embedding, embedding_model
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
		'select page_id, dirty_at, attempts, last_error from public.ai_index_queue where page_id = $1',
		[pageId],
	);
	return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
}

/** The number of the pages that are waiting in the queue. */
async function queueSize(): Promise<number> {
	const result = await pool.query('select count(*)::int as count from public.ai_index_queue');
	return Number(result.rows[0]?.count ?? 0);
}

/** Until the condition is true, or the deadline is reached. */
async function waitFor(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (condition()) return;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error('the condition was not met in time');
}

/** The workers until the queue is empty. */
async function drain(workers: IndexerWorker[]): Promise<void> {
	for (let round = 0; round < 30; round += 1) {
		const counts = await Promise.all(workers.map((worker) => worker.tick()));
		if (counts.every((count) => count === 0)) return;
	}
	throw new Error('the queue did not empty');
}

/**
 * Whether the RAG migration is applied. The indexer works on ai_chunks and
 * ai_index_queue, so its tests need the second migration; a run with the AI
 * migration alone skips them.
 */
const rag = await pool.query(
	"select to_regclass('public.ai_chunks') as chunks, to_regclass('public.ai_index_queue') as queue",
);
const hasRag = Boolean(rag.rows[0]?.chunks) && Boolean(rag.rows[0]?.queue);

before(async () => {
	if (!hasRag) return;
	// The pages of the other test files are not ours: the queue is emptied
	// before the first test, so a page of another file is never indexed here.
	await pool.query('delete from public.osionos_pages');
	await pool.query('delete from public.ai_index_queue');
});

after(async () => {
	if (hasRag) {
		await pool.query('delete from public.osionos_pages');
		await pool.query('delete from public.ai_index_queue');
	}
	await mock.close();
	await pool.end();
});

describe('the indexer', { skip: hasRag ? false : 'the RAG migration was not applied' }, () => {
	it('indexes a page: its chunks, their paths, their ACL and their vectors', async () => {
		const worker = newWorker();
		const pageId = await insertPage({
			title: 'Roadmap',
			visibility: 'shared',
			collaborators: [{ userId: USER_B, role: 'editor' }],
			content: [
				{ id: 'b1', type: 'paragraph', content: 'Before the first heading.' },
				{ id: 'b2', type: 'heading_1', content: 'First' },
				{ id: 'b3', type: 'paragraph', content: 'The body of the first section.' },
				{ id: 'b4', type: 'heading_2', content: 'Second' },
				{ id: 'b5', type: 'paragraph', content: 'The body of the second section.' },
			],
		});

		const indexed = await worker.tick();
		assert.equal(indexed, 1);

		const chunks = await chunksOf(pageId);
		assert.equal(chunks.length, 3);
		assert.deepEqual(
			chunks.map((chunk) => chunk.heading_path),
			['Roadmap', 'Roadmap › First', 'Roadmap › First › Second'],
		);
		for (const chunk of chunks) {
			// The ACL of the chunks is the ACL of the page.
			assert.equal(chunk.visibility, 'shared');
			assert.deepEqual(chunk.collaborator_ids, [USER_B]);
			assert.equal(chunk.owner_id, USER_A);
			// The vector is there.
			assert.notEqual(chunk.embedding, null);
			assert.equal(chunk.embedding_model, 'intfloat/multilingual-e5-small');
		}
		// The queue row is gone.
		assert.equal(await queueRow(pageId), null);

		// The passages carry the prefix of the model, and never the query one.
		assert.equal(mock.inputs.length, 3);
		for (const input of mock.inputs) {
			assert.ok(input.startsWith('passage: '), `the input starts with the passage prefix: ${input}`);
			assert.ok(!input.startsWith('query: '));
		}
		assert.ok(mock.inputs.some((input) => input.includes('Roadmap › First › Second')));

		// One line per page, and no content in it.
		const line = logs.find((entry) => entry.event === 'indexed' && entry.pageId === pageId);
		assert.ok(line, 'the page is logged');
		assert.equal(line?.chunks, 3);
		assert.equal(line?.embedded, 3);
		assert.equal(typeof line?.ms, 'number');
		assert.ok(!JSON.stringify(line).includes('the body of the first section'));
	});

	it('normalizes the visibility and the collaborators the way the trigger does', async () => {
		const worker = newWorker();
		const pageId = await insertPage({
			title: 'Odd ACL',
			visibility: 'weird',
			collaborators: [
				{ userId: USER_B, role: 'editor' },
				{ userId: USER_A },
				{ userId: 'not-a-uuid', role: 'editor' },
			],
			content: [{ id: 'b1', type: 'paragraph', content: 'A single block.' }],
		});
		await worker.tick();
		const chunks = await chunksOf(pageId);
		assert.equal(chunks.length, 1);
		// An unknown visibility is private, exactly like ai_page_visibility.
		assert.equal(chunks[0].visibility, 'private');
		// Only the collaborators that carry a role are kept.
		assert.deepEqual(chunks[0].collaborator_ids, [USER_B]);
	});

	it('re-embeds only the section that changed, and keeps the vectors of the others', async () => {
		const worker = newWorker();
		const pageId = await insertPage({
			title: 'Two sections',
			content: [
				{ id: 'b1', type: 'heading_1', content: 'Kept' },
				{ id: 'b2', type: 'paragraph', content: 'The text that does not change.' },
				{ id: 'b3', type: 'heading_1', content: 'Changed' },
				{ id: 'b4', type: 'paragraph', content: 'The text that changes.' },
			],
		});
		await worker.tick();
		const before = await chunksOf(pageId);
		assert.equal(before.length, 2);
		const sent = mock.inputs.length;

		await pool.query('update public.osionos_pages set content = $2::jsonb where id = $1', [
			pageId,
			JSON.stringify([
				{ id: 'b1', type: 'heading_1', content: 'Kept' },
				{ id: 'b2', type: 'paragraph', content: 'The text that does not change.' },
				{ id: 'b3', type: 'heading_1', content: 'Changed' },
				{ id: 'b4', type: 'paragraph', content: 'The text that changed.' },
			]),
		]);
		await worker.tick();

		// Only the section that changed was sent to the service.
		const sentAfter = mock.inputs.slice(sent);
		assert.equal(sentAfter.length, 1);
		assert.ok(sentAfter[0].includes('The text that changed.'));
		assert.ok(!sentAfter[0].includes('The text that does not change.'));

		const after = await chunksOf(pageId);
		assert.equal(after.length, 2);
		// The vector of the section that did not change is the one it had.
		assert.equal(after[0].embedding, before[0].embedding);
		assert.notEqual(after[1].embedding, before[1].embedding);
	});

	it('drops the chunks of a page that was archived', async () => {
		const worker = newWorker();
		const pageId = await insertPage({
			title: 'Archived',
			content: [{ id: 'b1', type: 'paragraph', content: 'The text of the page.' }],
		});
		await worker.tick();
		assert.equal((await chunksOf(pageId)).length, 1);

		await pool.query('update public.osionos_pages set archived_at = now() where id = $1', [pageId]);
		await worker.tick();
		assert.equal((await chunksOf(pageId)).length, 0);
		assert.equal(await queueRow(pageId), null);
	});

	it('indexes every page exactly once when two workers run together', async () => {
		const first = newWorker();
		const second = newWorker();
		const pageIds: string[] = [];
		for (let index = 0; index < 20; index += 1) {
			pageIds.push(
				await insertPage({
					title: `Page ${index}`,
					content: [{ id: `b${index}`, type: 'paragraph', content: `The text of the page ${index}.` }],
				}),
			);
		}
		await drain([first, second]);

		for (const pageId of pageIds) {
			const chunks = await chunksOf(pageId);
			assert.equal(chunks.length, 1, `the page ${pageId} is indexed once`);
		}
		assert.equal(await queueSize(), 0);

		// No passage was sent twice.
		const counts = new Map<string, number>();
		for (const input of mock.inputs) counts.set(input, (counts.get(input) ?? 0) + 1);
		for (const [input, count] of counts) {
			assert.equal(count, 1, `the input was sent ${count} times: ${input}`);
		}
	});

	it('leaves the queue row alone when the page was edited while it was indexed', async () => {
		const worker = newWorker();
		const pageId = await insertPage({
			title: 'Edited while indexing',
			content: [{ id: 'b1', type: 'paragraph', content: 'The text of the page.' }],
		});
		// The service is slow: the page is being indexed while the test edits
		// the queue row. The wait is for a NEW call: the counter of the mock
		// holds the calls of the other tests too.
		mock.setOptions({ delayMs: 400 });
		const callsBefore = mock.calls;
		const tick = worker.tick();
		await waitFor(() => mock.calls > callsBefore);
		await pool.query('update public.ai_index_queue set dirty_at = now() where page_id = $1', [pageId]);
		await tick;

		// The row survived: the page is still to be indexed.
		const row = await queueRow(pageId);
		assert.ok(row, 'the queue row survived the edit');
		assert.equal(row?.attempts, 0);

		// The next round indexes it, and the row is gone.
		mock.setOptions({ delayMs: 0 });
		await worker.tick();
		assert.equal(await queueRow(pageId), null);
		assert.equal((await chunksOf(pageId)).length, 1);
	});

	it('keeps the chunks and the queue when the embedding service fails', async () => {
		const worker = newWorker();
		const pageId = await insertPage({
			title: 'Broken service',
			content: [{ id: 'b1', type: 'paragraph', content: 'The text of the page.' }],
		});
		await worker.tick();
		const before = await chunksOf(pageId);
		assert.equal(before.length, 1);

		// The service is down, and the page is edited.
		mock.setOptions({ fail: true });
		await pool.query('update public.osionos_pages set content = $2::jsonb where id = $1', [
			pageId,
			JSON.stringify([{ id: 'b1', type: 'paragraph', content: 'Another text.' }]),
		]);
		await worker.tick();

		// The failure is recorded, and the page is tried again later.
		const row = await queueRow(pageId);
		assert.ok(row, 'the page is still in the queue');
		assert.equal(row?.attempts, 1);
		assert.equal(typeof row?.last_error, 'string');
		assert.ok(String(row?.last_error).length > 0);
		assert.ok(new Date(String(row?.dirty_at)).getTime() > Date.now(), 'the next try is in the future');

		// The chunks of the page are still there: a failure never empties the
		// index of a page.
		const after = await chunksOf(pageId);
		assert.equal(after.length, 1);
		assert.equal(after[0].embedding, before[0].embedding);
		mock.setOptions({ fail: false });
	});

	it('leaves a page alone after ten attempts, and logs it once', async () => {
		const worker = newWorker();
		const pageId = await insertPage({
			title: 'Never works',
			content: [{ id: 'b1', type: 'paragraph', content: 'The text of the page.' }],
		});
		// The page failed nine times already.
		await pool.query('update public.ai_index_queue set attempts = 9 where page_id = $1', [pageId]);

		mock.setOptions({ fail: true });
		await worker.tick();
		mock.setOptions({ fail: false });

		const row = await queueRow(pageId);
		assert.ok(row, 'the page stays in the queue');
		assert.equal(row?.attempts, 10);
		const gaveUp = logs.filter((entry) => entry.event === 'index_gave_up' && entry.pageId === pageId);
		assert.equal(gaveUp.length, 1, 'the page is logged once');

		// The next round does not take it any more: it failed ten times.
		const callsBefore = mock.calls;
		await worker.tick();
		assert.equal(mock.calls, callsBefore, 'the page is not tried again');
		const still = await queueRow(pageId);
		assert.equal(still?.attempts, 10);
	});
});
