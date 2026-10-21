import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';

import { startHarness, USER_A, WORKSPACE_A } from './harness.ts';
import { SseStream, collect } from './sse.ts';
import { startMockEmbedder } from './mockEmbed.ts';
import { Seeds, vectorOf } from './retrievalSeed.ts';

/**
 * The citations of the searches of one step.
 *
 * A model may ask for two searches at once: they run side by side, and they
 * may find the same passage. A passage is cited once, under the number the
 * model read, and the stored part of [n] is the n-th one — whatever order the
 * two searches answer in.
 */
const embedder = await startMockEmbedder();
process.env.OSIONOS_AI_EMBED_URL = embedder.baseUrl;
process.env.OSIONOS_AI_EMBED_MODEL = 'intfloat/multilingual-e5-small';

const { app, mock, postRun, tokenFor, createConversation, call } = await startHarness();
const { buildRunTools } = await import('../src/runs/toolSet.ts');
const { createToolPool } = await import('../src/tools/index.ts');
const seeds = new Seeds(app.db);

/** A citation, as the run emits it and the conversation stores it. */
interface CitationData {
	n: number;
	pageId: string;
	blockId?: string;
	snippet: string;
	toolCallId?: string;
}

/** What makes two citations the same passage. */
function passage(data: { pageId: string; blockId?: string | null; snippet: string }): string {
	return `${data.pageId}\u0000${data.blockId ?? ''}\u0000${data.snippet}`;
}

after(async () => {
	await seeds.clear();
	await embedder.close();
	await app.close();
	await mock.close();
});

before(async () => {
	await app.db.query('delete from public.ai_conversations');
	await app.db.query('delete from public.ai_usage_daily');
});

beforeEach(async () => {
	await seeds.clear();
});

describe('the citations of two searches of one step', () => {
	it('a passage is cited once, even when two searches find it', async () => {
		await seeds.page({
			workspaceId: WORKSPACE_A,
			ownerId: USER_A,
			title: 'Sales playbook',
			visibility: 'shared',
			content: 'discount approval: an account executive may grant up to 10% alone; above 20% needs director approval',
			embedding: vectorOf('discount approval account executive'),
			chunks: 9,
			headingPath: 'Sales playbook › Discounts',
		});
		mock.setOptions({
			preDelayMs: 0,
			chunkCount: 2,
			chunkGapMs: 0,
			fail: false,
			toolCall: { name: 'search_workspace', arguments: { query: 'discount' } },
			toolCallTrigger: null,
			toolCallEveryStep: false,
			parallelToolCalls: 2,
			usage: null,
		});
		const token = tokenFor(USER_A, WORKSPACE_A);
		const conversationId = await createConversation('thread', token);
		const response = await postRun(conversationId, randomUUID(), 'What discount can an account executive grant alone?', undefined, token);
		const events = await collect(new SseStream(response));
		assert.equal(events[events.length - 1]?.event, 'done');

		const citations = events.filter((event) => event.event === 'citation').map((event) => event.data as CitationData);
		assert.ok(citations.length > 0, 'the searches cite what they found');
		const keys = citations.map(passage);
		assert.equal(new Set(keys).size, keys.length, 'no passage is cited twice');
		assert.deepEqual(
			citations.map(({ n }) => n).sort((left, right) => left - right),
			Array.from({ length: citations.length }, (_, index) => index + 1),
			'the numbers are 1..k, with no gap',
		);

		// Every citation names the call that found it, and comes before the
		// result of that call.
		const callIds = events
			.filter((event) => event.event === 'tool.called')
			.map((event) => (event.data as { toolCallId: string }).toolCallId);
		assert.equal(callIds.length, 2);
		for (const event of events.filter((candidate) => candidate.event === 'citation')) {
			const { toolCallId } = event.data as CitationData;
			assert.ok(toolCallId && callIds.includes(toolCallId), 'a tool citation names its call');
			const result = events.findIndex(
				(candidate) =>
					candidate.event === 'tool.result' && (candidate.data as { toolCallId: string }).toolCallId === toolCallId,
			);
			assert.ok(events.indexOf(event) < result, 'the citation precedes the result of its call');
		}

		// A search reports what it found, the passages cited before included:
		// the second search found the same passages and cites none of them.
		for (const event of events.filter((candidate) => candidate.event === 'tool.result')) {
			const { toolCallId, found } = event.data as { toolCallId: string; found?: number };
			const cited = citations.filter((citation) => citation.toolCallId === toolCallId).length;
			assert.equal(found, keys.length, `the search ${toolCallId} found every passage (it cited ${cited})`);
		}

		// The stored answer holds each passage once, and the part of [n] says n.
		const stored = await call(`/api/ai/conversations/${conversationId}/messages`, { token });
		assert.equal(stored.status, 200);
		const messages = (stored.body as { messages: { role: string; parts: ({ type: string } & CitationData)[] }[] })
			.messages;
		const parts = messages.find((message) => message.role === 'assistant')?.parts.filter((part) => part.type === 'citation');
		assert.ok(parts);
		assert.equal(new Set(parts.map(passage)).size, parts.length, 'no passage is stored twice');
		parts.forEach((part, index) => assert.equal(part.n, index + 1, 'the part of a source says its number'));
	});

	it('two searches that cite side by side keep the part of [n] at n - 1', { timeout: 20_000 }, async () => {
		for (const word of ['alpha', 'beta']) {
			await seeds.page({
				workspaceId: WORKSPACE_A,
				ownerId: USER_A,
				title: `${word} notes`,
				visibility: 'shared',
				content: `${word} renewal: the ${word} team owns it`,
				embedding: vectorOf(`${word} renewal`),
				chunks: 2,
			});
		}
		// The first call's citations wait until the other call cites: the two
		// calls emit side by side, as the searches of one step do upstream.
		const emitted: CitationData[] = [];
		let release = (): void => {};
		const otherCallCited = new Promise<void>((resolve) => {
			release = resolve;
		});
		const emit = async (type: string, data: unknown): Promise<void> => {
			if (type !== 'citation') return;
			const citation = data as CitationData;
			emitted.push(citation);
			if (citation.toolCallId === emitted[0].toolCallId) await otherCallCited;
			else release();
		};
		const pool = createToolPool();
		pool.startStep();
		const run = buildRunTools({
			db: app.db,
			user: { userId: USER_A, workspaceId: WORKSPACE_A, memberWorkspaces: [], isAdmin: false },
			pool,
			runId: randomUUID(),
			conversationId: randomUUID(),
			ownerId: USER_A,
			pages: [],
			sources: [],
			emit,
		});
		type Execute = (input: unknown, options: { toolCallId: string }) => Promise<string>;
		const search = (run.tools?.search_workspace as unknown as { execute: Execute }).execute;
		await Promise.all([
			search({ query: 'alpha renewal', limit: 2 }, { toolCallId: 'call_alpha' }),
			search({ query: 'beta renewal', limit: 2 }, { toolCallId: 'call_beta' }),
		]);

		assert.equal(emitted.length, 4, 'each search cites its own two passages');
		assert.notDeepEqual(
			emitted.map(({ n }) => n),
			[1, 2, 3, 4],
			'the citations arrived out of the order of their numbers',
		);
		assert.equal(run.cited.length, 4);
		for (const citation of emitted) {
			assert.equal(passage(run.cited[citation.n - 1]), passage(citation), `the part of [${citation.n}] is its source`);
		}
	});
});
