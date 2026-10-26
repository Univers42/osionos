import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareCodeUnits } from '../src/order.ts';

describe('compareCodeUnits', () => {
	it('orders like a bare sort, capitals before lower case and accents last, whatever the locale', () => {
		const words = ['é', 'b', 'B', 'a', 'Z', 'a'];
		assert.deepEqual([...words].sort(compareCodeUnits), [...words].sort());
		assert.deepEqual([...words].sort(compareCodeUnits), ['B', 'Z', 'a', 'a', 'b', 'é']);
	});
});
