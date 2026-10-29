import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { SseStream, collect } from './sse.ts';

/** C163: with the flag off, a model that calls build_plan reaches no approval. */
delete process.env.OSIONOS_AI_BUILDERS;
const { startHarness, WORKSPACE_A } = await import('./harness.ts');
const { app, bridge, mock, postRun, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

describe('the builder tool when the flag is off', () => {
	it('C163 build_plan is absent when the flag is off and present when it is on (off half)', async () => {
		// The database is shared with the other files of the suite.
		await app.db.query('delete from public.ai_approvals');
		mock.setOptions({
			preDelayMs: 0,
			chunkCount: 2,
			chunkGapMs: 0,
			fail: false,
			toolCall: {
				name: 'build_plan',
				arguments: { workspaceId: WORKSPACE_A, title: 'T', items: [{ kind: 'page', key: 'a', title: 'A' }] },
			},
			toolCallTrigger: 'do it',
			toolCallEveryStep: false,
			parallelToolCalls: 1,
			usage: null,
		});
		const conversationId = await createConversation();
		const events = await collect(new SseStream(await postRun(conversationId, randomUUID(), 'do it')));
		assert.equal(events.filter((event) => event.event === 'permission.asked').length, 0);
		const rows = await app.db.query(`select count(*)::int as n from public.ai_approvals where tool = 'build_plan'`);
		assert.equal(Number(rows.rows[0].n), 0);
	});
});
