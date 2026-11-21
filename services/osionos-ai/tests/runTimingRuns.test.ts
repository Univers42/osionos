import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { USER_A } from './harness.ts';
import { startKit, lastOf } from './failoverKit.ts';

/**
 * AB2 and AB3 on real runs: the usage a run kept before the marks is kept
 * byte for byte, `timing` joins it in the same write, and the log event names
 * neither the user nor the run.
 */
const kit = await startKit();
const { app, failing, bridge, mock, runToEnd, runRow, clean } = kit;

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
	await failing.close();
});
beforeEach(clean);

type Usage = Record<string, unknown> & { timing?: Record<string, unknown> };

/** The usage without its `timing`: what the row held before AB2. */
function withoutTiming(usage: Usage | null): Record<string, unknown> {
	const { timing: _timing, ...rest } = usage ?? {};
	return rest;
}

/** The stdout lines of `work`: the service logs in-process. */
async function logged(work: () => Promise<void>): Promise<string[]> {
	const lines: string[] = [];
	const original = console.info;
	console.info = (line: unknown) => { lines.push(String(line)); };
	try {
		await work();
	} finally {
		console.info = original;
	}
	return lines;
}

const assertTiming = (timing: Record<string, unknown> | undefined) => {
	assert.ok(timing, 'usage.timing is missing');
	for (const key of ['preflight_ms', 'stream_ms', 'attempts', 'failover_ms', 'append_ms_total']) {
		assert.ok(Number.isInteger(timing[key]), `${key} = ${String(timing[key])}`);
	}
	assert.equal(typeof timing.retrieval_failed, 'boolean');
};

describe('AB2 usage.timing', () => {
	it('a succeeded run keeps inputTokens, outputTokens and costMicroUsd byte for byte, plus timing', async () => {
		const { runId, events } = await runToEnd({ model: 'mock-platform' });
		assert.equal(lastOf(events).event, 'done');
		const row = await runRow(runId);
		const usage = row.usage as Usage;
		assert.equal(row.status, 'succeeded');
		assert.deepEqual(withoutTiming(usage), { inputTokens: 1000, outputTokens: 500, costMicroUsd: 10_500 });
		assertTiming(usage.timing);
		assert.ok((usage.timing?.provider_ttft_ms as number) >= 0);
		assert.equal(usage.timing?.attempts, 1);
	});

	it('a failed-over run keeps its attempts byte for byte, plus timing from the same write', async () => {
		failing.script('mock-metered', 429);
		const { runId, events } = await runToEnd({ model: 'mock-metered', fallbacks: [{ model: 'mock-platform' }] });
		assert.equal(lastOf(events).event, 'done');
		const usage = (await runRow(runId)).usage as Usage;
		assert.deepEqual(withoutTiming(usage), {
			inputTokens: 1000,
			outputTokens: 500,
			costMicroUsd: 10_500,
			attempts: [
				{ model: 'mock-metered', kind: 'platform', outcome: 'rate_limited', billed: 0 },
				{ model: 'mock-platform', kind: 'platform', outcome: 'succeeded', billed: 10_500 },
			],
		});
		assertTiming(usage.timing);
		assert.equal(usage.timing?.attempts, 2);
	});

	it('a failed run keeps its usage and gains timing', async () => {
		failing.always('mock-metered', 503);
		const { runId } = await runToEnd({ model: 'mock-metered' });
		const row = await runRow(runId);
		const timing = (row.usage as Usage).timing;
		assert.equal(row.status, 'failed');
		assertTiming(timing);
		// The run's own one retry: two attempts, and the first one's time is failover time.
		assert.equal(timing?.attempts, 2);
		assert.ok((timing?.failover_ms as number) > 0);
		assert.equal('provider_ttft_ms' in (timing ?? {}), false);
	});
});

describe('AB3 run_timing event', () => {
	it('is one line per run with the model, the scope, the outcome, and neither user id nor run id', async () => {
		let runId = '';
		const lines = await logged(async () => {
			({ runId } = await runToEnd({ model: 'mock-platform' }));
			await runRow(runId);
		});
		const events = lines.filter((line) => line.includes('"run_timing"'));
		assert.equal(events.length, 1);
		const event = JSON.parse(events[0]);
		assert.equal(event.model, 'mock-platform');
		assert.equal(event.kind, 'platform');
		assert.equal(event.outcome, 'succeeded');
		assert.ok(Number.isInteger(event.preflight_ms));
		const everything = lines.join('\n');
		assert.equal(everything.includes(USER_A), false);
		assert.equal(everything.includes(runId), false);
	});

	it('names the failure code of a failed run', async () => {
		failing.always('mock-metered', 503);
		const lines = await logged(async () => { await runToEnd({ model: 'mock-metered' }); });
		const event = JSON.parse(lines.filter((line) => line.includes('"run_timing"'))[0]);
		assert.equal(event.outcome, 'provider_unavailable');
	});
});
