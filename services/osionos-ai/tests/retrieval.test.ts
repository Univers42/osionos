import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { retrieve, FUSION_SQL } from '../src/retrieval/search.ts';
import type { AuthUser } from '../src/auth.ts';
import { startMockEmbedder } from './mockEmbed.ts';
import { startHarness } from './harness.ts';
import { SseStream, collect } from './sse.ts';
import {
	USER_A,
	USER_B,
	WORKSPACE_A,
	WORKSPACE_B,
	Seeds,
	turnedVector,
	vectorOf,
} from './retrievalSeed.ts';

/**
 * The retrieval: the permission pre-filter, the hybrid search, and the run
 * that quotes what it found.
 *
 * The chunks are written directly, with the vectors of the mock embedding
 * service, so the test knows exactly what the search must find.
 */

// The embedding service of the retrieval: the mock, at the address the
// service reads when it embeds a question.
const embedder = await startMockEmbedder();
process.env.OSIONOS_AI_EMBED_URL = embedder.baseUrl;
process.env.OSIONOS_AI_EMBED_MODEL = 'intfloat/multilingual-e5-small';

const harness = await startHarness();
const db = harness.app.db;

/** The question of the searches: two rare words. */
const QUERY = 'zorblax quux';

/** The two callers: the owner of the workspace, and a member of it. */
const userA: AuthUser = { userId: USER_A, workspaceId: WORKSPACE_A, memberWorkspaces: [], isAdmin: false };
const userB: AuthUser = { userId: USER_B, workspaceId: WORKSPACE_B, memberWorkspaces: [], isAdmin: false };

/** The seeds of the test that is running: they are gone before the next one. */
const seeds = new Seeds(db);

before(async () => {
	await seeds.clear();
});

beforeEach(async () => {
	await seeds.clear();
});

after(async () => {
	await seeds.clear();
	await embedder.close();
	await harness.app.close();
	await harness.mock.close();
});

describe('the retrieval', () => {
	it('a private page of one user is invisible to the other, and a membership that ends ends at once', async () => {
		const priv = await seeds.page({
			workspaceId: WORKSPACE_A,
			ownerId: USER_A,
			title: 'Private notes',
			visibility: 'private',
			content: `the ${QUERY} of the owner`,
			embedding: vectorOf('private notes'),
		});
		const shared = await seeds.page({
			workspaceId: WORKSPACE_A,
			ownerId: USER_A,
			title: 'Shared notes',
			visibility: 'shared',
			content: `the ${QUERY} of the workspace`,
			embedding: vectorOf('shared notes'),
		});
		await db.query(
			`insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions)
			 values ($1, $2, 'member', array['read'])`,
			[WORKSPACE_A, USER_B],
		);

		// The owner reads both pages.
		const mine = await retrieve(db, userA, { query: QUERY });
		assert.deepEqual(mine.map((chunk) => chunk.pageId).sort(), [priv, shared].sort());

		// The other user reads the shared page, and NOTHING of the private one.
		const theirs = await retrieve(db, userB, { query: QUERY });
		assert.deepEqual(theirs.map((chunk) => chunk.pageId), [shared]);
		assert.ok(!theirs.some((chunk) => chunk.pageId === priv), 'the private page never shows up');

		// The membership ends: the shared page is gone too, at once.
		await db.query('delete from public.osionos_workspace_members where workspace_id = $1 and user_id = $2', [
			WORKSPACE_A,
			USER_B,
		]);
		const afterRemoval = await retrieve(db, userB, { query: QUERY });
		assert.deepEqual(afterRemoval, [], 'nothing of the workspace is left for the caller');
	});

	it('the lexical match and the vector match both surface, and the order is the fusion', async () => {
		// The query, as the embedder embeds it.
		const question = vectorOf(`query: ${QUERY}`);
		const both = await seeds.page({
			workspaceId: WORKSPACE_A,
			ownerId: USER_A,
			title: 'Both',
			visibility: 'shared',
			content: `${QUERY}`,
			embedding: turnedVector(question),
		});
		const lexical = await seeds.page({
			workspaceId: WORKSPACE_A,
			ownerId: USER_A,
			title: 'Lexical',
			visibility: 'shared',
			content: `zorblax ${'filler '.repeat(40)}quux`,
			embedding: vectorOf('a passage that is nothing like the question'),
		});
		const vector = await seeds.page({
			workspaceId: WORKSPACE_A,
			ownerId: USER_A,
			title: 'Vector',
			visibility: 'shared',
			content: 'a paragraph that says nothing of the question',
			embedding: question,
		});

		const found = await retrieve(db, userA, { query: QUERY });
		// The order is the RRF one: the chunk of both lists comes first, then
		// the chunk of the two lists, then the chunk of the vector list alone.
		assert.deepEqual(
			found.map((chunk) => chunk.pageId),
			[both, lexical, vector],
		);
		const close = (left: number, right: number): void => {
			assert.ok(Math.abs(left - right) < 1e-12, `${left} is not ${right}`);
		};
		close(found[0].score, 1 / 61 + 1 / 62);
		close(found[1].score, 1 / 62 + 1 / 63);
		close(found[2].score, 1 / 61);
	});

	it('a stale copy of the permissions never leaks a page', async () => {
		const page = await seeds.page({
			workspaceId: WORKSPACE_A,
			ownerId: USER_A,
			title: 'Secret',
			visibility: 'private',
			content: `the ${QUERY} of the owner`,
			embedding: vectorOf(`query: ${QUERY}`),
		});
		// The copy in the index says 'public': the filter lets the chunk
		// through...
		await db.query(`update public.ai_chunks set visibility = 'public' where source_id = $1`, [page]);
		// ...and the page itself is still private.
		await db.query(
			`insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions)
			 values ($1, $2, 'member', array['read'])`,
			[WORKSPACE_A, USER_B],
		);

		const found = await retrieve(db, userB, { query: QUERY });
		assert.deepEqual(found, [], 'the page is not readable, so it is not returned');
	});

	it('the search reads one partition, and reads it with both indexes', async () => {
		// The corpus the plan is read on: the planner needs a corpus big
		// enough to prefer the indexes over a scan and a sort, and a rare
		// word for the full text scan.
		await seeds.bulk(WORKSPACE_A, 4000);
		// The statistics: without them the planner guesses, and guesses the
		// sort is cheaper than the index.
		await db.query('analyze public.ai_chunks');
		const plan = await db.query<{ 'QUERY PLAN': string }>(`explain (analyze, buffers) ${FUSION_SQL}`, [
			[WORKSPACE_A],
			USER_A,
			'zorblaxquux',
			JSON.stringify(vectorOf('query: zorblaxquux')),
		]);
		const text = plan.rows.map((row) => row['QUERY PLAN']).join('\n');
		console.log(`[retrieval] the plan of the statement:\n${text}`);

		// The vector index of the HNSW, and the one of the full text.
		assert.match(text, /_embedding_idx/, 'the HNSW index is used');
		assert.match(text, /_tsv_idx/, 'the GIN index is used');
		// One partition only: the one of the workspace of the caller.
		const where = await db.query<{ partition: string }>(
			'select tableoid::regclass::text as partition from public.ai_chunks where workspace_id = $1 limit 1',
			[WORKSPACE_A],
		);
		const partitions = [...text.matchAll(/ai_chunks_(p\d\d)/g)].map((match) => match[1]);
		assert.deepEqual([...new Set(partitions)], [where.rows[0]?.partition.replace('ai_chunks_', '')]);
	});

	it('a page gives three chunks at most, and the search takes what it is told', async () => {
		const page = await seeds.page({
			workspaceId: WORKSPACE_A,
			ownerId: USER_A,
			title: 'Long page',
			visibility: 'shared',
			content: `the ${QUERY} of the page`,
			embedding: vectorOf(`query: ${QUERY}`),
			chunks: 5,
		});
		const found = await retrieve(db, userA, { query: QUERY });
		assert.equal(found.length, 3, 'three chunks of the page at most');
		assert.ok(found.every((chunk) => chunk.pageId === page));
		const one = await retrieve(db, userA, { query: QUERY, limit: 1 });
		assert.equal(one.length, 1, 'the limit of the caller is the limit of the answer');
	});

	it('a retrieval that fails is not a failure of the run', async () => {
		// The embedding service is down: the run goes on without sources.
		embedder.setOptions({ fail: true });
		const warnings: string[] = [];
		const warn = console.warn;
		console.warn = (...args: unknown[]) => {
			warnings.push(args.map((arg) => String(arg)).join(' '));
		};
		try {
			const conversationId = await harness.createConversation();
			const response = await harness.postRun(
				conversationId,
				randomUUID(),
				'a question nobody answers',
				undefined,
				undefined,
				[],
				{ workspace: true },
			);
			const events = await collect(new SseStream(response));
			assert.equal((events[0]?.data as { retrievedCount: number }).retrievedCount, 0);
			assert.equal(events.filter((event) => event.event === 'citation').length, 0);
			assert.equal(events[events.length - 1]?.event, 'done', 'the run goes on');
		} finally {
			console.warn = warn;
			embedder.setOptions({ fail: false });
		}
		const failures = warnings.filter((line) => line.includes('retrieval_failed'));
		assert.equal(failures.length, 1, 'the failure is logged once');
	});

	it('a run with a workspace search quotes its sources, and keeps them', async () => {
		const question = 'what do the zorblax notes say';
		await seeds.page({
			workspaceId: WORKSPACE_A,
			ownerId: USER_A,
			title: 'Run notes',
			visibility: 'shared',
			content: 'the answer lives here',
			embedding: vectorOf(`query: ${question}`),
		});
		const conversationId = await harness.createConversation();
		const response = await harness.postRun(
			conversationId,
			randomUUID(),
			question,
			undefined,
			undefined,
			[],
			{ workspace: true },
		);
		const events = await collect(new SseStream(response));

		// The sources come first: the run tells how many it found, then it
		// sends them, one frame each, before the first word of the answer.
		const started = events[0];
		assert.equal(started?.event, 'run.started');
		assert.equal((started?.data as { retrievedCount: number }).retrievedCount, 1);
		const citations = events.filter((event) => event.event === 'citation');
		assert.equal(citations.length, 1);
		assert.equal((citations[0].data as { n: number }).n, 1);
		const firstCitation = events.findIndex((event) => event.event === 'citation');
		const firstDelta = events.findIndex((event) => event.event === 'text.delta');
		assert.ok(firstCitation < firstDelta, 'the citations come before the answer');

		// The prompt carries the source, as a block the model reads as data.
		const body = harness.mock.lastBody() as { messages: { content: string }[] };
		const prompt = body.messages[body.messages.length - 1]?.content ?? '';
		assert.ok(prompt.includes('<source n="1"'), 'the prompt carries the source block');
		assert.ok(prompt.includes('the answer lives here'), 'the prompt carries the text of the source');

		// The stored message keeps the sources, in the same order.
		const stored = await db.query(
			`select parts from public.ai_messages where conversation_id = $1 and role = 'assistant'`,
			[conversationId],
		);
		const parts = stored.rows[0]?.parts as { type: string; pageId?: string; snippet?: string }[];
		const citationParts = parts.filter((part) => part.type === 'citation');
		assert.equal(citationParts.length, 1);
		assert.equal(citationParts[0].snippet, 'the answer lives here');
	});
});
