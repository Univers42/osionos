import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	classify,
	EmbedConcurrency,
	nextLimit,
	roundCap,
} from '../src/indexer/concurrency.ts';
import type { EmbedOutcome } from '../src/indexer/concurrency.ts';

/**
 * The concurrency of the embedder: the AIMD controller.
 *
 * Pure: no database, no clock, no network. The controller takes the outcome
 * of a call and gives the next limit.
 */

describe('the concurrency of the embedder', () => {
	it('grows on a fast call and halves on a slow one: fast, fast, slow, 429 is 3, 4, 2, 1', () => {
		const controller = new EmbedConcurrency();
		const limits: number[] = [];
		const outcomes: EmbedOutcome[] = ['fast', 'fast', 'slow', 'throttled'];
		for (const outcome of outcomes) limits.push(controller.observe(outcome));
		assert.deepEqual(limits, [3, 4, 2, 1]);
	});

	it('starts at two calls in flight', () => {
		assert.equal(new EmbedConcurrency().current, 2);
	});

	it('never goes below one, and never above the maximum', () => {
		const controller = new EmbedConcurrency({ max: 4 });
		for (let round = 0; round < 10; round += 1) controller.observe('throttled');
		assert.equal(controller.current, 1);
		for (let round = 0; round < 10; round += 1) controller.observe('fast');
		assert.equal(controller.current, 4);
	});

	it('reads a 429 and a 503 as the service pushing back', () => {
		assert.equal(classify(10, 1500, 429), 'throttled');
		assert.equal(classify(10, 1500, 503), 'throttled');
		assert.equal(classify(10, 1500, 200), 'fast');
		assert.equal(classify(2000, 1500, 200), 'slow');
	});

	it('caps a bulk round at half of the maximum: a query always finds room', () => {
		assert.equal(roundCap(0, 8), 8);
		assert.equal(roundCap(1, 8), 4);
		assert.equal(roundCap(1, 1), 1);
	});

	it('keeps the limit of a round under the cap of its lane', () => {
		const controller = new EmbedConcurrency({ max: 8 });
		for (let round = 0; round < 6; round += 1) controller.observe('fast');
		assert.equal(controller.current, 8);
		assert.equal(controller.limitFor(0), 8);
		assert.equal(controller.limitFor(1), 4);
	});

	it('is a pure function of the limit and the outcome', () => {
		assert.equal(nextLimit(2, 'fast', 8), 3);
		assert.equal(nextLimit(2, 'slow', 8), 1);
		assert.equal(nextLimit(8, 'fast', 8), 8);
		assert.equal(nextLimit(1, 'throttled', 8), 1);
	});
});
