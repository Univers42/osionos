import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';
import type { Redis } from 'ioredis';
import { startFailingUpstream } from './mockFailing.ts';
import { SseStream, collect } from './sse.ts';
import { refusal, threadKit, until } from './threadKit.ts';

/**
 * Who may run a thread answer, and on what (osio-bot OB8–OB10): one bot run
 * in flight per channel, only no-train platform models with the Auto chain
 * as failover, and "AI busy" instead of a spill when the shared account rests.
 * The best-ranked model is may-train: it must never be called.
 */
process.env.OSIONOS_AI_THREAD_ANSWERS = 'on';
const upstream = await startFailingUpstream();
const { startHarness, FREE, FREE_TIER_FIRST, METERED, USER_A, WORKSPACE_A } = await import('./harness.ts');
const MAY_TRAIN = FREE_TIER_FIRST.id;
const harness = await startHarness({ upstreamBaseUrl: upstream.baseUrl, openRouterModels: [{ id: MAY_TRAIN, rank: 1, dataUse: 'may-train' }] });
const { app, mock, bridge, createConversation } = harness;
const { config } = await import('../src/config.ts');
const { cooldownKey, ACCOUNT_REST_KEY } = await import('../src/runs/cooldown.ts');
const { joinWorkspace, seedTrigger, postThreadRun } = threadKit(harness, USER_A, WORKSPACE_A);

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await upstream.close();
});

beforeEach(async () => {
	upstream.reset();
	await joinWorkspace();
	const rests = await app.redis.keys('ai:cooldown:*');
	if (rests.length > 0) await app.redis.del(...rests);
});

async function body(): Promise<Record<string, unknown>> {
	const trigger = await seedTrigger();
	return { runId: randomUUID(), conversationId: await createConversation('thread'), ...trigger };
}

async function runToEnd(request: Record<string, unknown>): Promise<string | undefined> {
	const response = await postThreadRun(request);
	assert.equal(response.status, 200);
	return (await collect(new SseStream(response))).at(-1)?.event;
}

function rest(model: string): Promise<unknown> {
	return app.redis.set(cooldownKey('platform', 'platform', model), String(Date.now() + 60_000), 'PX', 60_000);
}

describe('one bot run in flight per channel (OB8)', () => {
	it('refuses a second run while the first one runs, and frees the channel when it ends', async () => {
		upstream.script(FREE.id, { behaviour: 'ok', delayMs: 400 });
		const first = await body();
		const running = postThreadRun(first);
		assert.ok(await until(() => upstream.countFor(FREE.id) === 1), 'the first run reached the model');
		// Another conversation: one conversation already holds one run at a time (run_in_progress).
		const second = await refusal(await postThreadRun({ ...first, runId: randomUUID(), conversationId: await createConversation('second') }));
		assert.deepEqual([second.status, second.code], [429, 'channel_busy']);
		assert.equal(upstream.requests.length, 1, 'the refused run called no model');
		assert.equal((await collect(new SseStream(await running))).at(-1)?.event, 'done');
		assert.equal(await runToEnd({ ...first, runId: randomUUID() }), 'done', 'the lock went with the run');
	});

	it('frees the channel when the run fails', async () => {
		for (const entry of config.catalog.entries) upstream.always(entry.menuId, 500);
		const request = await body();
		assert.equal(await runToEnd(request), 'error');
		upstream.reset();
		// The failed attempts rested each model for this user; the test is about the lock, not the rests.
		await app.redis.del(...(await app.redis.keys('ai:cooldown:*')));
		assert.equal(await runToEnd({ ...request, runId: randomUUID() }), 'done');
	});

	it('refuses, fail closed, when Redis cannot take the lock', async () => {
		const { acquireChannelLock } = await import('../src/threads/admission.ts');
		const broken = new Proxy({}, { get: () => () => { throw new Error('redis down'); } }) as unknown as Redis;
		assert.deepEqual(await acquireChannelLock(broken, randomUUID(), randomUUID()), {
			kind: 'refused',
			status: 503,
			code: 'rate_limit_unavailable',
		});
	});
});

describe('no-train targets only, with the Auto chain as failover (OB9)', () => {
	it('falls over along the no-train chain and never to the may-train model', async () => {
		upstream.script(FREE.id, 500);
		assert.equal(await runToEnd(await body()), 'done');
		assert.deepEqual(upstream.requests, [FREE.id, METERED.id]);
		assert.equal(upstream.countFor(MAY_TRAIN), 0);
	});

	it('skips a resting model for the next no-train one', async () => {
		await rest(FREE.id);
		assert.equal(await runToEnd(await body()), 'done');
		assert.equal(upstream.requests[0], METERED.id);
	});

	it('answers "AI busy" when every no-train model rests, and does not degrade to the may-train one', async () => {
		for (const entry of config.catalog.entries.filter((one) => one.dataUse === 'no-train')) await rest(entry.menuId);
		const answer = await refusal(await postThreadRun(await body()));
		assert.deepEqual([answer.status, answer.code], [429, 'ai_busy']);
		assert.equal(upstream.requests.length, 0);
	});
});

describe('the shared quota (OB10)', () => {
	it('answers "AI busy" while the platform account rests, with its wait, and calls no model', async () => {
		await app.redis.set(ACCOUNT_REST_KEY, String(Date.now() + 30_000), 'PX', 30_000);
		try {
			const answer = await refusal(await postThreadRun(await body()));
			assert.deepEqual([answer.status, answer.code], [429, 'ai_busy']);
			assert.ok(Number(answer.retryAfter) > 0);
			assert.equal(upstream.requests.length, 0);
		} finally {
			await app.redis.del(ACCOUNT_REST_KEY);
		}
	});

	it('defaults the platform-wide daily cap to at most half of the 50 free requests', () => {
		const cap = (config as { threadRunsPerDay?: number }).threadRunsPerDay;
		assert.ok(typeof cap === 'number' && cap > 0 && cap <= 25, `cap ${cap}`);
	});

	it('gives a thread run at most 3 steps, and leaves research and chat runs as they are', async () => {
		const limits = (await import('../src/tools/limits.ts')) as Record<string, unknown>;
		const runLimitsFor = limits.runLimitsFor as ((run: { research?: boolean; thread?: unknown }) => { maxSteps: number } | undefined) | undefined;
		assert.equal(typeof runLimitsFor, 'function');
		assert.ok((runLimitsFor?.({ thread: {} })?.maxSteps ?? Infinity) <= 3);
		assert.equal(runLimitsFor?.({ research: true }), limits.RESEARCH_LIMITS);
		assert.equal(runLimitsFor?.({}), undefined);
	});
});
