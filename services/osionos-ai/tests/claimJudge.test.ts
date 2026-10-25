import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	judgeClaims,
	judgeClaimsTraced,
	parseClaims,
	quoteFound,
	quoteNear,
	saysNotInSources,
} from '../eval/answers/claimJudge.ts';

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
// quoteNear
// ---------------------------------------------------------------------------

describe('quoteNear', () => {
	it('exact text passes at ratio 0.8', () => {
		assert.equal(quoteNear('The frame ships in eight weeks', 'The frame ships in eight weeks.', 0.8), true);
	});

	it('one changed word in a ten-word quote passes at 0.8 and fails at 1.0', () => {
		const quote = 'The frame kit ships in eight weeks from Vejle today';
		const source = 'The frame kit ships in eight weeks from Vejle tomorrow.';
		assert.equal(quoteNear(quote, source, 0.8), true);
		assert.equal(quoteNear(quote, source, 1), false);
	});

	it('a changed number fails at any ratio', () => {
		const quote = 'The frame kit ships in 12 weeks';
		const source = 'The frame kit ships in 8 weeks.';
		assert.equal(quoteNear(quote, source, 0.5), false);
		assert.equal(quoteNear(quote, source, 0.8), false);
		assert.equal(quoteNear(quote, source, 1), false);
	});

	it('unrelated text fails', () => {
		assert.equal(quoteNear('The frame kit ships in eight weeks', 'It comes from the Vejle workshop.', 0.5), false);
	});

	it('an empty quote fails', () => {
		assert.equal(quoteNear('', 'The frame ships in eight weeks.', 0.8), false);
		assert.equal(quoteNear('   ', 'The frame ships in eight weeks.', 0.8), false);
	});
});

// ---------------------------------------------------------------------------
// saysNotInSources
// ---------------------------------------------------------------------------

describe('saysNotInSources', () => {
	it('recognises the English phrasing, with a trailing citation', () => {
		assert.equal(
			saysNotInSources(
				'The delivery timeframe for the NW-ALDER-55 shelf system is not specified in the provided sources. [n]',
			),
			true,
		);
	});

	it('recognises a French phrasing', () => {
		assert.equal(saysNotInSources("Le délai de livraison n'est pas précisé dans les sources."), true);
	});

	it('recognises a Spanish phrasing', () => {
		assert.equal(saysNotInSources('El plazo de entrega no se especifica en las fuentes.'), true);
	});

	it('a long answer that mentions one missing detail is not an abstention', () => {
		assert.equal(
			saysNotInSources(
				'The shelf is steel. It ships flat. The lead time is not specified in the sources. Ask sales for a date.',
			),
			false,
		);
	});

	it('a factual answer is not an abstention', () => {
		assert.equal(saysNotInSources('The lead time is eight weeks [1].'), false);
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

// ---------------------------------------------------------------------------
// judgeClaimsTraced
// ---------------------------------------------------------------------------

describe('judgeClaimsTraced', () => {
	it('traces every claim and calls entailment only for a found quote', async () => {
		let first = true;
		let entailCalls = 0;
		const complete = async (): Promise<string> => {
			if (first) {
				first = false;
				return claimsJson(false, 4, [
					{ claim: 'The kit ships in eight weeks.', source: 1, quote: 'ships in eight weeks' },
					{ claim: 'It is made in Copenhagen.', source: 2, quote: 'made in Copenhagen' },
					{ claim: 'It weighs five kilos.', source: 1, quote: 'weighs five kilos' },
				]);
			}
			entailCalls++;
			return 'yes';
		};

		const traced = await judgeClaimsTraced(
			'What is the lead time?',
			'The kit ships in eight weeks, is made in Copenhagen, and weighs five kilos.',
			['The frame kit ships in eight weeks and weighs five kilos.', 'It comes from the Vejle workshop.'],
			complete,
		);

		assert.equal(traced?.claims.length, 3);
		assert.equal(traced?.claims[0].quoteFound, true);
		assert.equal(traced?.claims[0].entailed, true);
		assert.equal(traced?.claims[1].quoteFound, false);
		assert.equal(traced?.claims[1].entailed, null);
		assert.equal(traced?.claims[2].quoteFound, true);
		assert.equal(traced?.claims[2].entailed, true);
		assert.equal(entailCalls, 2);
		assert.deepEqual(traced?.verdict, { faithful: false, relevant: 4, abstained: false });
	});
});

describe('judgeClaimsTraced with abstainRule', () => {
	const answer =
		'The delivery timeframe for the NW-ALDER-55 shelf system is not specified in the provided sources. [n]';
	const claims = claimsJson(false, 2, [
		{ claim: 'The shelf system delivery timeframe is unknown.', source: 1, quote: 'twelve weeks' },
	]);
	const sources = ['The NW-ALDER-55 shelf system is made of steel.'];

	it('a short not-in-sources answer is a faithful abstention, whatever claims it lists', async () => {
		const complete = completer([claims]);
		const traced = await judgeClaimsTraced(
			'What is the delivery timeframe of the NW-ALDER-55?',
			answer,
			sources,
			complete,
			{ abstainRule: true },
		);
		assert.deepEqual(traced?.verdict, { faithful: true, relevant: 2, abstained: true });
		assert.deepEqual(traced?.claims, []);
	});

	it('without the option the same answer stays unfaithful', async () => {
		const complete = completer([claims]);
		const traced = await judgeClaimsTraced(
			'What is the delivery timeframe of the NW-ALDER-55?',
			answer,
			sources,
			complete,
		);
		assert.deepEqual(traced?.verdict, { faithful: false, relevant: 2, abstained: false });
		assert.equal(traced?.claims[0].quoteFound, false);
	});
});

describe('judgeClaimsTraced with sourceFallback', () => {
	const question = 'What is the lead time?';
	const answer = 'The kit ships in twelve weeks.';
	const sources = ['The frame kit ships in eight weeks.'];
	const claims = claimsJson(false, 4, [
		{ claim: 'The kit ships in twelve weeks.', source: 1, quote: 'twelve weeks' },
	]);

	it('a missing quote that the source supports is faithful', async () => {
		const complete = completer([claims, 'yes']);
		const traced = await judgeClaimsTraced(question, answer, sources, complete, { sourceFallback: true });
		assert.deepEqual(traced?.verdict, { faithful: true, relevant: 4, abstained: false });
		assert.equal(traced?.claims[0].quoteFound, false);
		assert.equal(traced?.claims[0].entailed, null);
		assert.equal(traced?.claims[0].supported, true);
	});

	it('a missing quote that the source does not support is unfaithful', async () => {
		const complete = completer([claims, 'no']);
		const traced = await judgeClaimsTraced(question, answer, sources, complete, { sourceFallback: true });
		assert.deepEqual(traced?.verdict, { faithful: false, relevant: 4, abstained: false });
		assert.equal(traced?.claims[0].supported, false);
	});

	it('an out-of-range source index never calls the fallback', async () => {
		let calls = 0;
		const complete = async (): Promise<string> => {
			calls++;
			if (calls === 1) {
				return claimsJson(false, 3, [
					{ claim: 'It ships in eight weeks.', source: 9, quote: 'eight weeks' },
				]);
			}
			return 'yes';
		};
		const traced = await judgeClaimsTraced(
			question,
			'It ships in eight weeks.',
			sources,
			complete,
			{ sourceFallback: true },
		);
		assert.equal(calls, 1);
		assert.equal(traced?.claims[0].supported, null);
		assert.deepEqual(traced?.verdict, { faithful: false, relevant: 3, abstained: false });
	});
});
