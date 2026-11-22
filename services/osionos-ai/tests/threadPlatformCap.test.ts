import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { SseStream, collect } from './sse.ts';
import { refusal, threadKit } from './threadKit.ts';

/**
 * OB10: one daily count of thread runs for the whole platform, summed over
 * every workspace, set below the shared free allowance. Two askers in two
 * workspaces spend the same count; past it, the run is "AI busy" before any
 * model is called. The cap is set to 2 here, before the service reads it.
 */
process.env.OSIONOS_AI_THREAD_ANSWERS = 'on';
process.env.OSIONOS_AI_THREAD_RUNS_PER_DAY = '2';
const { startHarness, USER_A, USER_B, WORKSPACE_A, WORKSPACE_B } = await import('./harness.ts');
const harness = await startHarness();
const { app, mock, bridge, createConversation, tokenFor } = harness;
const inA = threadKit(harness, USER_A, WORKSPACE_A);
const inB = threadKit(harness, USER_B, WORKSPACE_B);

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

async function post(kit: typeof inA, owner: string): Promise<Response> {
	await kit.joinWorkspace();
	const trigger = await kit.seedTrigger();
	// The conversation is the asker's own; the run reads the channel's workspace, not the conversation's.
	const conversationId = await createConversation('cap', tokenFor(owner, WORKSPACE_A));
	return kit.postThreadRun({ runId: randomUUID(), conversationId, ...trigger });
}

describe('the platform daily thread-run cap (OB10)', () => {
	it('counts every workspace in one bucket and answers "AI busy" past it, calling no model', async () => {
		for (const [kit, owner] of [[inA, USER_A], [inB, USER_B]] as const) {
			const response = await post(kit, owner);
			assert.equal(response.status, 200);
			assert.equal((await collect(new SseStream(response))).at(-1)?.event, 'done');
		}
		const calls = mock.calls;
		const answer = await refusal(await post(inA, USER_A));
		assert.deepEqual([answer.status, answer.code], [429, 'ai_busy']);
		assert.ok(Number(answer.retryAfter) > 0);
		assert.equal(mock.calls, calls);
	});
});
