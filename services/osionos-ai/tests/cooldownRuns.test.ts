import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';
import { APICallError } from 'ai';
import { USER_A, USER_B, WORKSPACE_A, WORKSPACE_B } from './harness.ts';
import { startKit, lastOf } from './failoverKit.ts';

/**
 * A resting model in a run, and in the list of models (devil C256, C259).
 */
const kit = await startKit();
const { app, failing, bridge, mock, runToEnd, settledLedger, runRow, clean, call, tokenFor } = kit;
const { recordFailure, cooldownKey } = await import('../src/runs/cooldown.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await failing.close();
});
beforeEach(clean);

const tokenA = () => tokenFor(USER_A, WORKSPACE_A);
const tokenB = () => tokenFor(USER_B, WORKSPACE_B);
const busy = () => new APICallError({ message: 'busy', url: 'http://x', requestBodyValues: {}, statusCode: 503 });

const rest = (userId: string, modelId: string) =>
	recordFailure(app.redis, {
		target: { connectionId: 'platform', modelId, platformBudget: true }, userId, error: busy(), attemptAborted: false,
	});

const platformList = async (token: string) => {
	const answer = await call('/api/ai/models', { token });
	assert.equal(answer.status, 200);
	return (answer.body?.models ?? []) as { id: string; cooldownUntil?: string }[];
};

describe('the order of a run', () => {
	it('a cooled primary is skipped when a fallback exists: the upstream never gets the primary call', async () => {
		await rest(USER_A, 'mock-metered');
		const { runId, events } = await runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-platform' }] });
		assert.equal(lastOf(events).event, 'done');
		assert.deepEqual(failing.requests, ['mock-platform']);
		assert.equal((await runRow(runId)).model, 'mock-platform');
		// The reader is told who answered, as after a failed attempt.
		assert.deepEqual(events.filter((event) => event.event === 'route').map((event) => event.data), [
			{ from: 'mock-metered', to: 'mock-platform', reason: 'unavailable' },
		]);
		const { user, platform } = await settledLedger();
		assert.equal(user.reserved, 0);
		assert.equal(platform.reserved, 0);
		assert.ok(user.spent > 0);
	});

	it('all targets cooled: the primary is still tried first', async () => {
		await rest(USER_A, 'mock-metered');
		await rest(USER_A, 'mock-platform');
		failing.script('mock-metered', 503);
		const { events } = await runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-platform' }] });
		assert.equal(lastOf(events).event, 'done');
		assert.deepEqual(failing.requests, ['mock-metered', 'mock-platform']);
		// Nothing was skipped: the one route frame is the failover's own.
		assert.deepEqual(events.filter((event) => event.event === 'route').map((event) => (event.data as { reason: string }).reason), ['upstream_error']);
	});

	it('a failed primary rests for its user, and for nobody else', async () => {
		failing.script('mock-metered', 503);
		await runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-platform' }] });
		const own = await platformList(tokenA());
		assert.ok(own.find((model) => model.id === 'mock-metered')?.cooldownUntil, 'the caller sees its own rest');
		const other = await platformList(tokenB());
		assert.equal(other.filter((model) => model.cooldownUntil).length, 0);
	});
});

describe('GET /api/ai/models', () => {
	it('C259 a user never sees the cooldown of the connection of another user', async () => {
		await app.db.query('delete from public.ai_connections');
		const created = await call('/api/ai/connections', {
			method: 'POST', token: tokenA(),
			body: { kind: 'api_key', provider: 'openrouter', apiKey: 'sk-test-0123456789abcdef' },
		});
		assert.equal(created.status, 201);
		const id = String(created.body?.id);
		const listed = await call(`/api/ai/models?connectionId=${id}`, { token: tokenA() });
		const models = (listed.body?.models ?? []) as { id: string; cooldownUntil?: string }[];
		assert.ok(models.length > 0, 'the connection lists a model');
		assert.equal(models.filter((model) => model.cooldownUntil).length, 0);

		await recordFailure(app.redis, {
			target: { connectionId: id, modelId: models[0].id, platformBudget: false }, userId: USER_A, error: busy(), attemptAborted: false,
		});
		const after = await call(`/api/ai/models?connectionId=${id}`, { token: tokenA() });
		const resting = ((after.body?.models ?? []) as { id: string; cooldownUntil?: string }[]).find((model) => model.id === models[0].id);
		assert.ok(resting?.cooldownUntil && Date.parse(resting.cooldownUntil) > Date.now());

		// B asks for the connection of A: the same 404 as for a connection that does not exist.
		const foreign = await call(`/api/ai/models?connectionId=${id}`, { token: tokenB() });
		const missing = await call(`/api/ai/models?connectionId=${randomUUID()}`, { token: tokenB() });
		assert.equal(foreign.status, 404);
		assert.deepEqual(foreign, missing);
		assert.ok(!JSON.stringify(foreign).includes('cooldownUntil'));
	});

	it('C259 the platform list carries the rest of the caller, and of everyone once the platform rests', async () => {
		await rest(USER_A, 'mock-metered');
		assert.ok((await platformList(tokenA())).find((model) => model.id === 'mock-metered')?.cooldownUntil);
		assert.equal((await platformList(tokenB())).filter((model) => model.cooldownUntil).length, 0);
		await app.redis.set(cooldownKey('platform', 'platform', 'mock-metered'), String(Date.now() + 30_000), 'EX', 30);
		assert.ok((await platformList(tokenB())).find((model) => model.id === 'mock-metered')?.cooldownUntil);
	});
});
