import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { startFailingUpstream } from './mockFailing.ts';
import { SseStream, collect } from './sse.ts';
import { refusal, threadKit, until } from './threadKit.ts';

/**
 * OB10, one member's share of the platform's daily thread runs: without it
 * one account spends the whole platform count and every other channel is
 * "AI busy" for the day. A member past their share spends no platform run,
 * and a run that startRun refuses (run_in_progress) gives both seats back.
 * Platform cap 3, member share 2 here, set before the service reads them.
 */
process.env.OSIONOS_AI_THREAD_ANSWERS = 'on';
process.env.OSIONOS_AI_THREAD_RUNS_PER_DAY = '3';
process.env.OSIONOS_AI_THREAD_RUNS_PER_USER_PER_DAY = '2';
const upstream = await startFailingUpstream();
const { startHarness, FREE, FREE_TIER_FIRST, USER_A, USER_B, WORKSPACE_A, WORKSPACE_B } = await import('./harness.ts');
const harness = await startHarness({ upstreamBaseUrl: upstream.baseUrl, openRouterModels: [{ id: FREE_TIER_FIRST.id, rank: 1, dataUse: 'may-train' }] });
const { app, mock, bridge, createConversation, tokenFor } = harness;
const { config } = await import('../src/config.ts');
const inA = threadKit(harness, USER_A, WORKSPACE_A);
const inB = threadKit(harness, USER_B, WORKSPACE_B);

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await upstream.close();
});

async function request(kit: typeof inA, owner: string, conversationId?: string): Promise<Record<string, unknown>> {
	await kit.joinWorkspace();
	const trigger = await kit.seedTrigger();
	const conversation = conversationId ?? (await createConversation('share', tokenFor(owner, WORKSPACE_A)));
	return { runId: randomUUID(), conversationId: conversation, ...trigger };
}

async function runToEnd(kit: typeof inA, body: Record<string, unknown>): Promise<string | undefined> {
	const response = await kit.postThreadRun(body);
	assert.equal(response.status, 200);
	return (await collect(new SseStream(response))).at(-1)?.event;
}

describe("one member's share of the platform's daily thread runs (OB10)", () => {
	it('reads the share from its own setting', () => {
		assert.equal((config as { threadRunsPerUserPerDay?: number }).threadRunsPerUserPerDay, 2);
	});

	it('gives the seats back when startRun refuses the run (run_in_progress)', async () => {
		upstream.script(FREE.id, { behaviour: 'ok', delayMs: 400 });
		const first = await request(inA, USER_A);
		const running = inA.postThreadRun(first);
		assert.ok(await until(() => upstream.countFor(FREE.id) === 1), 'the first run reached the model');
		// Another channel, so no channel lock; the same conversation, so startRun refuses.
		const second = await refusal(await inA.postThreadRun(await request(inA, USER_A, first.conversationId as string)));
		assert.deepEqual([second.status, second.code], [409, 'run_in_progress']);
		assert.equal((await collect(new SseStream(await running))).at(-1)?.event, 'done');
		assert.equal(await runToEnd(inA, await request(inA, USER_A)), 'done', 'the refused run spent no share');
	});

	it('refuses a member past their share with "AI busy", calling no model and spending no platform run', async () => {
		const calls = upstream.requests.length;
		const past = await refusal(await inA.postThreadRun(await request(inA, USER_A)));
		assert.deepEqual([past.status, past.code], [429, 'ai_busy']);
		assert.ok(Number(past.retryAfter) > 0);
		assert.equal(upstream.requests.length, calls);
		assert.equal(await runToEnd(inB, await request(inB, USER_B)), 'done', 'the third platform run is still there');
		const platform = await refusal(await inB.postThreadRun(await request(inB, USER_B)));
		assert.deepEqual([platform.status, platform.code], [429, 'ai_busy'], 'the platform cap still binds');
	});
});
