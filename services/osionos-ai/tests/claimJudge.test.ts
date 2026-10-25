import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { judgeClaims, parseClaims, quoteFound } from '../eval/answers/claimJudge.ts';

// A fake complete: the queued answers, in order, with no model behind it.
function completer(responses: string[]): (prompt: string) => Promise<string> {
	return async () => {
		const next = responses.shift();
		if (next === undefined) throw new Error('the fake complete ran out of answers');
		return next;
	};
}

function claimsJson(abstained: boolean, relevant: number, claims: unknown[]): string {
	return JSON.stringify({ abstained, relevant, claims });
}

// ---------------------------------------------------------------------------
// quoteFound
// ---------------------------------------------------------------------------

describe('quoteFound', () => {
	it('finds a quote whatever the case and the spacing', () => {
		assert.equal(quoteFound('  EIGHT   weeks ', 'The frame ships in eight weeks.'), true);
	});

	it('ignores the punctuation and the quotes around the quote', () => {
		assert.equal(quoteFound('"Eight weeks."', 'The frame ships in eight weeks.'), true);
	});

	it('an empty quote is never found', () => {
		assert.equal(quoteFound('', 'The frame ships in eight weeks.'), false);
		assert.equal(quoteFound('   ', 'The frame ships in eight weeks.'), false);
	});

	it('a quote that is not there is not found', () => {
		assert.equal(quoteFound('twelve weeks', 'The frame ships in eight weeks.'), false);
	});
});

// ---------------------------------------------------------------------------
// parseClaims
// ---------------------------------------------------------------------------

describe('parseClaims', () => {
	it('reads fenced JSON', () => {
		const text = '```json\n' + claimsJson(false, 5, [{ claim: 'Eight weeks.', source: 1, quote: 'eight weeks' }]) + '\n```';
		const result = parseClaims(text);
		assert.notEqual(result, null);
		assert.equal(result?.relevant, 5);
		assert.equal(result?.claims.length, 1);
		assert.equal(result?.claims[0].quote, 'eight weeks');
	});

	it('reads JSON wrapped in prose', () => {
		const text = 'Here are the claims: ' + claimsJson(true, 1, []) + ' That is all.';
		const result = parseClaims(text);
		assert.notEqual(result, null);
		assert.equal(result?.abstained, true);
		assert.deepEqual(result?.claims, []);
	});

	it('garbage returns null', () => {
		assert.equal(parseClaims('no json here'), null);
		assert.equal(parseClaims('{"abstained": "no", "relevant": 5, "claims": []}'), null);
	});
});

// ---------------------------------------------------------------------------
// judgeClaims
// ---------------------------------------------------------------------------

describe('judgeClaims', () => {
	it('every claim quoted and entailed is faithful', async () => {
		const complete = completer([
			claimsJson(false, 5, [
				{ claim: 'The kit ships in eight weeks.', source: 1, quote: 'ships in eight weeks' },
				{ claim: 'It is made in Vejle.', source: 2, quote: 'from the Vejle workshop' },
			]),
			'yes',
			'yes',
		]);
		const verdict = await judgeClaims(
			'What is the lead time?',
			'The kit ships in eight weeks; it is made in Vejle.',
			['The frame kit ships in eight weeks.', 'It comes from the Vejle workshop.'],
			complete,
		);
		assert.deepEqual(verdict, { faithful: true, relevant: 5, abstained: false });
	});

	it('a quote that is not in its source is unfaithful even when entailment says yes', async () => {
		const complete = completer([
			claimsJson(false, 4, [{ claim: 'The kit ships in twelve weeks.', source: 1, quote: 'twelve weeks' }]),
			'yes',
		]);
		const verdict = await judgeClaims(
			'What is the lead time?',
			'The kit ships in twelve weeks.',
			['The frame kit ships in eight weeks.'],
			complete,
		);
		assert.deepEqual(verdict, { faithful: false, relevant: 4, abstained: false });
	});

	it('a source index out of range is unfaithful', async () => {
		const complete = completer([
			claimsJson(false, 3, [{ claim: 'It ships in eight weeks.', source: 9, quote: 'eight weeks' }]),
		]);
		const verdict = await judgeClaims(
			'What is the lead time?',
			'It ships in eight weeks.',
			['The frame kit ships in eight weeks.'],
			complete,
		);
		assert.deepEqual(verdict, { faithful: false, relevant: 3, abstained: false });
	});

	it('an entailment no is unfaithful', async () => {
		const complete = completer([
			claimsJson(false, 4, [{ claim: 'It ships in twelve weeks.', source: 1, quote: 'ships in twelve weeks' }]),
			'no',
		]);
		const verdict = await judgeClaims(
			'What is the lead time?',
			'It ships in twelve weeks.',
			['The frame kit ships in twelve weeks.'],
			complete,
		);
		assert.deepEqual(verdict, { faithful: false, relevant: 4, abstained: false });
	});

	it('an abstention with no claims is faithful', async () => {
		const complete = completer([claimsJson(true, 1, [])]);
		const verdict = await judgeClaims(
			'What is the lead time of the NW-KITE-33?',
			'Not found in your workspace.',
			['The frame kit ships in eight weeks.'],
			complete,
		);
		assert.deepEqual(verdict, { faithful: true, relevant: 1, abstained: true });
	});

	it('a parse failure returns null', async () => {
		const complete = completer(['I could not do that.']);
		const verdict = await judgeClaims('question', 'answer', ['source'], complete);
		assert.equal(verdict, null);
	});
});
