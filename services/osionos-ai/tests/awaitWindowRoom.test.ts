import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { awaitWindowRoom } from './harness.ts';

/**
 * Tests for the awaitWindowRoom helper.
 *
 * The helper waits until at least `seconds` remain in the current one-minute
 * window. It uses Date.now() and sleeps only when fewer than `seconds` remain,
 * then waits until the next minute starts plus 50 ms.
 */

describe('awaitWindowRoom', () => {
	it('a time at second 50 with seconds = 15 waits until second 60', async () => {
		// At second 50, only 10 seconds remain. With seconds=15, we need to wait.
		const baseNow = Date.now();
		const msIntoMinute = baseNow % 60_000;
		const targetMs = baseNow - msIntoMinute + 50_000; // second 50 of the current minute
		mock.method(globalThis.Date, 'now', () => targetMs);
		mock.timers.enable({ apis: ['setTimeout'] });

		const promise = awaitWindowRoom(15);
		// Advance timers by 10.05 seconds (from second 50 to second 60 + 50ms)
		await mock.timers.tick(10_050);
		await promise;

		mock.restoreAll();
		mock.timers.reset();
	});

	it('a time at second 10 with seconds = 15 does not wait', async () => {
		// At second 10, 50 seconds remain. With seconds=15, we don't need to wait.
		const baseNow = Date.now();
		const msIntoMinute = baseNow % 60_000;
		const targetMs = baseNow - msIntoMinute + 10_000; // second 10 of the current minute
		mock.method(globalThis.Date, 'now', () => targetMs);
		mock.timers.enable({ apis: ['setTimeout'] });

		const start = Date.now();
		await awaitWindowRoom(15);
		const elapsed = Date.now() - start;

		// Should not have waited (or only negligible time)
		assert.ok(elapsed < 100, `waited ${elapsed} ms, expected < 100 ms`);

		mock.restoreAll();
		mock.timers.reset();
	});
});