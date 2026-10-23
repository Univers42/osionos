import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TestContext } from 'node:test';
import { awaitWindowRoom } from './harness.ts';

/** The helper that keeps a burst inside one fixed one-minute window (src/rateLimit.ts). */

/** Freezes the clock at `second` of a minute; only setTimeout is mocked, so setImmediate still runs. */
function clockAt(t: TestContext, second: number): void {
	const minuteStart = Date.now() - (Date.now() % 60_000);
	t.mock.method(Date, 'now', () => minuteStart + second * 1000);
	t.mock.timers.enable({ apis: ['setTimeout'] });
}

/** 'done' when the helper settled within the current turn of the event loop, else 'waiting'. */
function settledNow(promise: Promise<void>): Promise<'done' | 'waiting'> {
	return Promise.race([promise.then(() => 'done' as const), new Promise<'waiting'>((resolve) => setImmediate(() => resolve('waiting')))]);
}

describe('awaitWindowRoom', () => {
	it('at second 50 with 15 s wanted, it waits until the next minute starts plus 50 ms', async (t) => {
		clockAt(t, 50);
		const promise = awaitWindowRoom(15);
		t.mock.timers.tick(10_049);
		assert.equal(await settledNow(promise), 'waiting');
		t.mock.timers.tick(1);
		assert.equal(await settledNow(promise), 'done');
	});

	it('at second 10 with 15 s wanted, it does not wait', async (t) => {
		clockAt(t, 10);
		assert.equal(await settledNow(awaitWindowRoom(15)), 'done');
	});
});
