import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { startHarness, METERED, USER_A, WORKSPACE_A } from './harness.ts';
import { spentOf } from './ledger.ts';
import { SseStream, collect } from './sse.ts';
import type { SseEvent } from './sse.ts';

/**
 * The share of a step: what the tools of ONE step may add to the context.
 *
 * A step may call ten tools at once, and the answer that follows reads all
 * of them: the share of the step (TOOL_OUTPUT_CHARS) is what keeps the
 * context of a run inside the ceiling its reservation counted. Without it,
 * one step could put 200 000 characters in the prompt of the answer, and the
 * money the run holds was reserved for 20 000 of them.
 */
const { app, mock, postRun, createConversation } = await startHarness();
const { POOL_SPENT, TOOL_OUTPUT_CHARS, createToolPool } = await import('../src/tools/index.ts');

after(async () => {
	await app.close();
	await mock.close();
});

/** A page of the workspace of the caller, with the text it carries. */
async function page(text: string): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, content)
		 values ($1, $2, $3, 'The notes', 'shared', $4::jsonb)`,
		[id, WORKSPACE_A, USER_A, JSON.stringify([{ content: text }])],
	);
	return id;
}

/** The events of a type. */
function eventsOf(events: SseEvent[], type: string): SseEvent[] {
	return events.filter((event) => event.event === type);
}

/** The outputs of the tools, as the next prompt of the model holds them. */
function toolOutputsOf(body: unknown): string[] {
	const messages = (body as { messages?: { role?: string; content?: unknown }[] }).messages ?? [];
	const outputs: string[] = [];
	for (const message of messages) {
		if (message.role !== 'tool') continue;
		outputs.push(typeof message.content === 'string' ? message.content : '');
	}
	return outputs;
}

describe('the share of a step', () => {
	before(async () => {
		await app.db.query('delete from public.ai_conversations');
		await app.db.query('delete from public.ai_usage_daily');
		mock.setOptions({
			preDelayMs: 0,
			chunkCount: 4,
			chunkGapMs: 0,
			fail: false,
			toolCall: null,
			toolCallEveryStep: false,
			parallelToolCalls: 1,
			usage: null,
			usageOnFirstStepOnly: false,
		});
	});

	it('three calls of 20 000 characters add one share to the context', () => {
		// The pool of a run, and the share of the step that is running.
		const pool = createToolPool();
		pool.startStep();
		const outputs = [
			pool.draw('x'.repeat(20_000)),
			pool.draw('x'.repeat(20_000)),
			pool.draw('x'.repeat(20_000)),
		];
		// The first call takes the whole share of the step.
		assert.equal(outputs[0].length, TOOL_OUTPUT_CHARS);
		// The two others get the notice of the pool: the share is used up.
		assert.equal(outputs[1], POOL_SPENT);
		assert.equal(outputs[2], POOL_SPENT);
		// The context of the run grew by the share and by the notices of the
		// pool, and by nothing else.
		const grown = outputs.reduce((sum, text) => sum + text.length, 0);
		assert.ok(
			grown <= TOOL_OUTPUT_CHARS + 2 * POOL_SPENT.length,
			`the step adds one share to the context: ${grown}`,
		);
		// The next step gets a share of its own.
		pool.startStep();
		assert.equal(pool.draw('y'.repeat(20_000)).length, TOOL_OUTPUT_CHARS);
	});

	it('one step adds at most a share to the context of the answer', async () => {
		// A page long enough to fill a good part of the share, read three
		// times at once: the share of the step is what stops the third read.
		const pageId = await page('x'.repeat(12_000));
		mock.setOptions({
			toolCall: { name: 'read_page', arguments: { pageId } },
			toolCallEveryStep: false,
			parallelToolCalls: 3,
		});

		const conversationId = await createConversation();
		const runId = randomUUID();
		const events = await collect(
			new SseStream(await postRun(conversationId, runId, 'read the notes', METERED.id)),
		);
		assert.equal(events[events.length - 1]?.event, 'done');
		// The three calls ran.
		assert.equal(eventsOf(events, 'tool.called').length, 3);
		assert.equal(eventsOf(events, 'tool.result').length, 3);

		// The context of the answer holds the outputs of the tools, and they
		// never pass the share of the step.
		const outputs = toolOutputsOf(mock.lastBody());
		assert.equal(outputs.length, 3);
		const toolOutput = outputs.filter((text) => text !== POOL_SPENT);
		const total = toolOutput.reduce((sum, text) => sum + text.length, 0);
		assert.ok(total <= TOOL_OUTPUT_CHARS, `the outputs stay in the share of the step: ${total}`);
		assert.ok(total > 0, 'the tools did their work');
		// The call that had no room left got the notice of the pool.
		assert.ok(outputs.includes(POOL_SPENT), 'the call past the share says the budget is spent');

		// The spend of the run stays inside the money the run held.
		const row = await app.db.query('select reserved_microusd from public.ai_runs where id = $1', [runId]);
		const reserved = Number(row.rows[0]?.reserved_microusd ?? 0);
		const spent = await spentOf(app.db, USER_A);
		assert.ok(spent > 0, 'the run was paid for');
		assert.ok(spent <= reserved, `the spend stays inside the reservation: ${spent} <= ${reserved}`);
	});
});
