import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ALLOWED_CODES, guardRefuses, parseGuard } from '../src/images/guardPolicy.ts';

/**
 * The policy of the L1 guard (devil C72), read on the answers of A1.
 *
 * The parser is the port of the one of the spike (`spikes/a1/guard-client.py`),
 * and the policy is the strict mode of A1 with the `T`/`C` carve-out of its
 * finding 4. The file is pure: no environment, no service, no guard.
 */

describe('osionos-ai images: the answer of the guard, read (C72)', () => {
	it('the two lines of the contract are read', () => {
		const parsed = parseGuard('Safety: Safe\nCategories: None');
		assert.equal(parsed.verdict, 'Safe');
		assert.deepEqual(parsed.codes, []);
	});

	it('a markdown answer is read too', () => {
		const parsed = parseGuard('**Safety:** Unsafe\n**Categories:** Sexual Content');
		assert.equal(parsed.verdict, 'Unsafe');
		assert.deepEqual(parsed.codes, ['A']);
	});

	it('the categories of the model are the codes of the slice', () => {
		const parsed = parseGuard('Safety: Controversial\nCategories: Politically Sensitive Topics, Copyright Violation');
		assert.equal(parsed.verdict, 'Controversial');
		assert.deepEqual(parsed.codes, ['T', 'C']);
	});

	it('a category nobody knows is a question mark', () => {
		const parsed = parseGuard('Safety: Unsafe\nCategories: Extremely Odd');
		assert.equal(parsed.verdict, 'Unsafe');
		assert.deepEqual(parsed.codes, ['?']);
	});

	it('an answer that is not an answer is unparsed', () => {
		assert.deepEqual(parseGuard('I am not sure about this one'), { verdict: 'unparsed', codes: [] });
		assert.deepEqual(parseGuard(''), { verdict: 'unparsed', codes: [] });
	});

	it('the allowed codes are the two of the finding 4 of A1', () => {
		assert.deepEqual([...ALLOWED_CODES].sort(), ['C', 'T']);
	});
});

describe('osionos-ai images: the policy of the guard (C72)', () => {
	const table: { verdict: 'Safe' | 'Unsafe' | 'Controversial' | 'unparsed'; codes: string[]; refuses: boolean }[] = [
		{ verdict: 'Safe', codes: [], refuses: false },
		{ verdict: 'Controversial', codes: ['T'], refuses: false },
		{ verdict: 'Controversial', codes: ['C', 'T'], refuses: false },
		{ verdict: 'Controversial', codes: ['A'], refuses: true },
		{ verdict: 'Controversial', codes: ['T', 'A'], refuses: true },
		{ verdict: 'Unsafe', codes: [], refuses: true },
		{ verdict: 'Controversial', codes: [], refuses: true },
		{ verdict: 'unparsed', codes: [], refuses: true },
		{ verdict: 'Unsafe', codes: ['?'], refuses: true },
	];

	for (const row of table) {
		it(`${row.verdict} ${JSON.stringify(row.codes)} refuses: ${row.refuses}`, () => {
			assert.equal(guardRefuses({ verdict: row.verdict, codes: row.codes }), row.refuses);
		});
	}
});
