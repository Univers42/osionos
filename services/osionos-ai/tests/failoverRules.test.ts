import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { USER_A, USER_B, WORKSPACE_A, WORKSPACE_B } from './harness.ts';
import { startKit, typesOf, lastOf } from './failoverKit.ts';
import { SseStream, collect } from './sse.ts';

/**
 * When a run may fall back, and who may be a fallback: the cases where it
 * must NOT move, the limits of a chain, and the refusals.
 */
const kit = await startKit();
const { app, failing, bridge, mock, runToEnd, settledLedger, runRow, clean, post, call, tokenFor, createConversation } = kit;
const { rateLimitKey } = await import('../src/rateLimit.ts');
const { awaitWindowRoom } = await import('./harness.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await failing.close();
});

const tokenA = () => tokenFor(USER_A, WORKSPACE_A);

/** The error code that ends a run. */
const codeOf = (events: { event: string; data: unknown }[]): string =>
	(lastOf(events as never).data as { code: string }).code;

describe('when a run does not fall back', () => {
	before(clean);

	it('C248 a model that failed after its text is not replaced', async () => {
		await clean();
		failing.script('mock-metered', 'text_then_break');
		const { events } = await runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-vision' }] });
		assert.ok(typesOf(events).includes('text.delta'));
		assert.ok(!typesOf(events).includes('route'));
		assert.equal(codeOf(events), 'upstream_error');
		assert.deepEqual(failing.requests, ['mock-metered']);
		const { user, platform } = await settledLedger();
		assert.equal(user.reserved, 0);
		assert.equal(platform.reserved, 0);
	});

	it('C248 a model that failed after a tool call is not replaced', async () => {
		await clean();
		failing.script('mock-metered', 'tool', 503);
		const { events } = await runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-vision' }] });
		assert.ok(typesOf(events).includes('tool.called'));
		assert.ok(!typesOf(events).includes('route'));
		assert.equal(codeOf(events), 'upstream_error');
		assert.deepEqual(failing.requests, ['mock-metered', 'mock-metered']);
		assert.equal((await settledLedger()).user.reserved, 0);
	});

	it('C249 a 400 is our request and never moves the run', async () => {
		await clean();
		failing.script('mock-metered', 400);
		const { events } = await runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-vision' }] });
		assert.ok(!typesOf(events).includes('route'));
		assert.deepEqual(failing.requests, ['mock-metered']);
	});

	it('C250 with a model waiting, the one that is down is called once', async () => {
		await clean();
		failing.script('mock-metered', 503);
		await runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-vision' }] });
		assert.equal(failing.countFor('mock-metered'), 1);
	});

	it('C251 three models are at most three requests and one rate-limit token', async () => {
		await clean();
		await awaitWindowRoom(5);
		failing.always('mock-metered', 503);
		failing.always('mock-vision', 503);
		failing.always('mock-platform', 503);
		const key = rateLimitKey(USER_A, new Date());
		const before = Number((await app.redis.get(key)) ?? 0);
		const { events } = await runToEnd({
			model: 'mock-metered',
			fallbacks: [{ model: 'mock-vision' }, { model: 'mock-platform' }],
		});
		assert.equal(typesOf(events).filter((type) => type === 'route').length, 2);
		assert.equal(codeOf(events), 'upstream_error');
		assert.deepEqual(failing.requests, ['mock-metered', 'mock-vision', 'mock-platform']);
		assert.equal(Number((await app.redis.get(key)) ?? 0) - before, 1);
		const { user, platform } = await settledLedger();
		assert.deepEqual([user, platform], [{ spent: 0, reserved: 0 }, { spent: 0, reserved: 0 }]);
		// A chain longer than two fallbacks, and a stray key, are refused.
		const conversationId = await createConversation();
		const three = [{ model: 'mock-model' }, { model: 'mock-vision' }, { model: 'mock-platform' }];
		const tooMany = await post({ runId: randomUUID(), conversationId, text: 'x', fallbacks: three });
		assert.equal(tooMany.status, 400);
		const stray = await post({ runId: randomUUID(), conversationId, text: 'x', fallbacks: [{ model: 'a', extra: 1 }] });
		assert.equal(stray.status, 400);
	});

	it('C252 a cancel between two attempts stops the run before the next model', async () => {
		await clean();
		failing.script('mock-metered', { behaviour: 503, delayMs: 600 });
		const runId = randomUUID();
		const conversationId = await createConversation();
		const response = await post({
			runId,
			conversationId,
			text: 'stop',
			model: 'mock-metered',
			fallbacks: [{ model: 'mock-vision' }],
		});
		const stream = new SseStream(response);
		assert.equal((await stream.next())?.event, 'run.started');
		const cancel = await call(`/api/ai/runs/${runId}/cancel`, { method: 'POST', token: tokenA() });
		assert.equal(cancel.status, 202);
		const events = await collect(stream);
		assert.equal(codeOf(events), 'cancelled');
		assert.equal(failing.countFor('mock-vision'), 0);
		assert.equal((await runRow(runId)).status, 'cancelled');
		assert.equal((await settledLedger()).user.reserved, 0);
	});

	it('C253 the fallback does not inherit the effort of the primary', async () => {
		await clean();
		failing.script('mock-reasoner', 503);
		await runToEnd({ model: 'mock-reasoner', effort: 'high', fallbacks: [{ model: 'mock-model' }] });
		const [primary, fallback] = failing.bodies.map((body) => JSON.stringify(body));
		assert.match(primary, /effort/i);
		assert.doesNotMatch(fallback, /effort/i);
	});
});

describe('who may be a fallback', () => {
	before(clean);

	it('C254 C255 a foreign, a missing and an off-list fallback get the same answer', async () => {
		await clean();
		await app.db.query('delete from public.ai_connections');
		const foreign = await call('/api/ai/connections', {
			method: 'POST',
			token: tokenFor(USER_B, WORKSPACE_B),
			body: { kind: 'api_key', provider: 'openrouter', apiKey: 'sk-test-0123456789abcdef' },
		});
		assert.equal(foreign.status, 201);
		const entries = [
			{ connectionId: String(foreign.body?.id), model: 'user-model' },
			{ connectionId: randomUUID(), model: 'user-model' },
			{ model: 'not-on-the-list' },
			{ model: '   ' },
		];
		const answers: string[] = [];
		for (const entry of entries) {
			const conversationId = await createConversation();
			const response = await post({ runId: randomUUID(), conversationId, text: 'x', fallbacks: [entry] });
			assert.equal(response.status, 400);
			answers.push(await response.text());
		}
		assert.equal(new Set(answers).size, 1);
		assert.match(answers[0], /invalid_fallback/);
		assert.equal(failing.requests.length, 0);
		const runs = await app.db.query('select count(*)::int as n from public.ai_runs');
		assert.equal(runs.rows[0].n, 0);
		assert.deepEqual((await settledLedger()).user, { spent: 0, reserved: 0 });
	});

	it('C254 a connection of the user is a fallback paid by the user', async () => {
		await clean();
		const own = await call('/api/ai/connections', {
			method: 'POST',
			token: tokenA(),
			body: { kind: 'api_key', provider: 'openrouter', apiKey: 'sk-test-0123456789abcdef' },
		});
		failing.script('mock-metered', 503);
		const { runId, events } = await runToEnd({
			model: 'mock-metered',
			fallbacks: [{ connectionId: String(own.body?.id), model: 'user-model' }],
		});
		assert.equal(lastOf(events).event, 'done');
		const attempts = (await runRow(runId)).usage?.attempts ?? [];
		assert.deepEqual(attempts.map((attempt) => attempt.kind), ['platform', 'user']);
		const { user, platform } = await settledLedger();
		assert.deepEqual([user, platform], [{ spent: 0, reserved: 0 }, { spent: 0, reserved: 0 }]);
	});
});
