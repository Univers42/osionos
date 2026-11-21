import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRunTimer, logRunTiming } from '../src/runs/runTiming.ts';

/**
 * The phase marks of a run (AB1): a clock the test drives, so every number is exact.
 */
function drivenTimer() {
	let ms = 0;
	const timer = createRunTimer(() => ms);
	return { timer, at: (value: number) => { ms = value; } };
}

describe('run timer', () => {
	it('AB1 preflight_ms is the integer ms from the start to the end of the pre-flight, set once', () => {
		const { timer, at } = drivenTimer();
		at(12.6);
		timer.endPreflight();
		at(500);
		timer.endPreflight();
		assert.equal(timer.snapshot().preflight_ms, 13);
	});

	it('AB1 the first content part marks provider_ttft_ms from the attempt start, once', () => {
		const { timer, at } = drivenTimer();
		at(100);
		timer.beginAttempt();
		at(350);
		timer.firstContent();
		at(900);
		timer.firstContent();
		const timing = timer.snapshot();
		assert.equal(timing.provider_ttft_ms, 250);
		assert.equal(timing.stream_ms, 800);
		assert.equal(timing.attempts, 1);
		assert.equal(timing.failover_ms, 0);
	});

	it('AB1 a run that never reached a content part has no provider_ttft_ms key', () => {
		const { timer, at } = drivenTimer();
		timer.beginAttempt();
		at(30);
		assert.equal('provider_ttft_ms' in timer.snapshot(), false);
	});

	it('AB1 failover_ms is the time of the attempts that moved on; ttft is the answering attempt', () => {
		const { timer, at } = drivenTimer();
		timer.beginAttempt();
		at(40);
		timer.failedOver();
		at(55);
		timer.beginAttempt();
		at(65);
		timer.firstContent();
		at(100);
		const timing = timer.snapshot();
		assert.equal(timing.attempts, 2);
		assert.equal(timing.failover_ms, 55);
		assert.equal(timing.provider_ttft_ms, 10);
		assert.equal(timing.stream_ms, 45);
	});

	it('AB1 endStream freezes stream_ms at the last provider part, before the persistence', () => {
		const { timer, at } = drivenTimer();
		timer.beginAttempt();
		at(80);
		timer.endStream();
		at(500);
		timer.endStream();
		assert.equal(timer.snapshot().stream_ms, 80);
	});

	it('AB1 a last attempt that moved on with no next one (refused) is failover_ms, not stream_ms', () => {
		const { timer, at } = drivenTimer();
		timer.beginAttempt();
		at(40);
		timer.failedOver();
		at(60);
		const timing = timer.snapshot();
		assert.equal(timing.stream_ms, 0);
		assert.equal(timing.failover_ms, 60);
		assert.equal(timing.attempts, 1);
	});

	it('AB1 append_ms_total sums the awaited appends, whether they resolve or throw', async () => {
		const { timer, at } = drivenTimer();
		await timer.timeAppend(async () => { at(7.4); });
		await assert.rejects(timer.timeAppend(async () => { at(10.2); throw new Error('redis'); }));
		assert.equal(timer.snapshot().append_ms_total, 10);
	});

	it('AB1 retrieval_failed is false until the retrieval says it failed', () => {
		const { timer } = drivenTimer();
		assert.equal(timer.snapshot().retrieval_failed, false);
		timer.retrievalFailed();
		assert.equal(timer.snapshot().retrieval_failed, true);
	});

	it('AB1 every number of a snapshot is an integer', () => {
		const { timer, at } = drivenTimer();
		at(1.5);
		timer.endPreflight();
		timer.beginAttempt();
		at(3.3);
		timer.firstContent();
		at(9.9);
		for (const [key, value] of Object.entries(timer.snapshot())) {
			if (typeof value === 'number') assert.ok(Number.isInteger(value), `${key} = ${value}`);
		}
	});
});

describe('run_timing event', () => {
	it('AB3 carries the model, the scope, the outcome and the integers, nothing else', () => {
		const lines: string[] = [];
		const original = console.info;
		console.info = (line: string) => { lines.push(line); };
		try {
			const { timer } = drivenTimer();
			logRunTiming(timer.snapshot(), { model: 'mock-model', kind: 'platform', outcome: 'succeeded' });
		} finally {
			console.info = original;
		}
		assert.equal(lines.length, 1);
		assert.deepEqual(Object.keys(JSON.parse(lines[0])).sort(), [
			'append_ms_total', 'attempts', 'event', 'failover_ms', 'kind', 'model', 'outcome',
			'preflight_ms', 'retrieval_failed', 'stream_ms',
		]);
		assert.equal(JSON.parse(lines[0]).event, 'run_timing');
	});

	it('AB3 a user connection logs the literal "user", never the model string the user typed', () => {
		const lines: string[] = [];
		const original = console.info;
		console.info = (line: string) => { lines.push(line); };
		try {
			const { timer } = drivenTimer();
			logRunTiming(timer.snapshot(), { model: 'ft:gpt-4o:acme-corp:abc', kind: 'user', outcome: 'succeeded' });
		} finally {
			console.info = original;
		}
		assert.equal(JSON.parse(lines[0]).model, 'user');
		assert.equal(lines[0].includes('acme-corp'), false);
	});
});
