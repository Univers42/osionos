import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { USER_A, USER_B, WORKSPACE_A, WORKSPACE_B } from './harness.ts';

/**
 * FA20 / FA22: a model that stalls with nothing emitted hands the run to the
 * next one, and rests for that user alone. The first-part window is shortened
 * through the test-only env knob; the stall is longer than it by a wide margin.
 */
process.env.NODE_ENV = 'test';
process.env.OSIONOS_AI_TEST_FIRST_PART_MS = '300';
const { startKit, typesOf, lastOf } = await import('./failoverKit.ts');
const kit = await startKit();
const { app, failing, bridge, mock, runToEnd, runRow, clean, call, tokenFor } = kit;

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await failing.close();
});
beforeEach(clean);

const STALL = { behaviour: 'ok' as const, delayMs: 2500 };
const listOf = async (token: string) => {
	const answer = await call('/api/ai/models', { token });
	return (answer.body?.models ?? []) as { id: string; cooldownUntil?: string }[];
};
const stalledRun = () => {
	failing.script('mock-model', STALL);
	return runToEnd({ model: 'mock-model', fallbacks: [{ model: 'mock-metered' }] });
};

describe('a stalled first part', () => {
	it('stall moves the run to the next model, booked at nothing for a free one', async () => {
		const { runId, events } = await stalledRun();
		assert.deepEqual(events.filter((e) => e.event === 'route').map((e) => e.data), [
			{ from: 'mock-model', to: 'mock-metered', reason: 'unavailable' },
		]);
		assert.equal(lastOf(events).event, 'done');
		assert.ok(typesOf(events).includes('route'));
		const row = await runRow(runId);
		assert.equal(row.model, 'mock-metered');
		assert.equal(row.usage?.attempts?.[0].model, 'mock-model');
		assert.equal(row.usage?.attempts?.[0].billed, 0);
	});

	it('second run within 60 s skips the stalled model for that user', async () => {
		await stalledRun();
		assert.deepEqual(failing.requests, ['mock-model', 'mock-metered']);
		const { events } = await runToEnd({ model: 'mock-model', fallbacks: [{ model: 'mock-metered' }] });
		assert.equal(lastOf(events).event, 'done');
		assert.deepEqual(failing.requests, ['mock-model', 'mock-metered', 'mock-metered']);
	});

	it('another user still gets the stalled model first', async () => {
		await stalledRun();
		const own = await listOf(tokenFor(USER_A, WORKSPACE_A));
		assert.ok(own.find((m) => m.id === 'mock-model')?.cooldownUntil, 'the stalled user sees the rest');
		const other = await listOf(tokenFor(USER_B, WORKSPACE_B));
		assert.equal(other.find((m) => m.id === 'mock-model')?.cooldownUntil, undefined);
	});
});
