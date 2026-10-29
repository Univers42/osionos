import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { startHarness } from './harness.ts';
import { textOf } from './ledger.ts';
import { SseStream, collect } from './sse.ts';

/**
 * The break between two steps of a run.
 *
 * The first step of the run says what it is about to do and calls the tool,
 * the second one answers: the two texts are two paragraphs, and not one
 * sentence glued together. The stream says so, and so does the message the
 * run keeps.
 */
const { app, mock, postRun, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
});

describe('the break between two steps of a run', () => {
	before(async () => {
		await app.db.query('delete from public.ai_conversations');
		await app.db.query('delete from public.ai_usage_daily');
		mock.setOptions({
			preDelayMs: 0,
			chunkCount: 4,
			chunkGapMs: 0,
			fail: false,
			// The first step writes its words and then calls the tool: the
			// answer comes after the tool has run.
			toolCall: { name: 'search_workspace', arguments: { query: 'discount authority' } },
			toolCallText: 'Looking it up.',
			answerText: '**Answer**',
		});
	});

	it('puts a blank line between the text of a step and the text of the next one', async () => {
		const conversationId = await createConversation();
		const events = await collect(
			new SseStream(await postRun(conversationId, randomUUID(), 'what is the discount authority?')),
		);

		// The first step called the tool, and the second one answered.
		const called = events.filter((event) => event.event === 'tool.called');
		assert.equal(called.length, 1);
		assert.equal((called[0].data as { toolName: string }).toolName, 'search_workspace');
		const results = events.filter((event) => event.event === 'tool.result');
		assert.equal(results.length, 1);

		// The two texts are two paragraphs: the stream says so.
		assert.equal(textOf(events), 'Looking it up.\n\n**Answer**');

		// And the message the run keeps says the same.
		const stored = await app.db.query(
			'select parts from public.ai_messages where conversation_id = $1 and role = $2',
			[conversationId, 'assistant'],
		);
		assert.equal(stored.rowCount, 1);
		const parts = stored.rows[0].parts as { type: string; text: string }[];
		assert.equal(parts[0]?.text, 'Looking it up.\n\n**Answer**');
	});
});
