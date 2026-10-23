import assert from 'node:assert/strict';
import { test } from 'node:test';
import { percentile, bootstrapCI } from './report.mjs';

test('percentile nearest-rank', () => {
	assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
	assert.equal(percentile([1, 2, 3, 4], 95), 4);
	assert.equal(percentile([], 50), NaN);
});

test('bootstrap CI deterministic', () => {
	const vals = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
	const ci = bootstrapCI(vals, 95, 42, 1000);
	assert.ok(ci.low <= ci.high);
	assert.ok(ci.low >= 10 && ci.high <= 100);
	// deterministic
	const ci2 = bootstrapCI(vals, 95, 42, 1000);
	assert.equal(ci.low, ci2.low);
	assert.equal(ci.high, ci2.high);
});