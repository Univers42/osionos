import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_LEDGER_CHARS, WorkspaceTextLedger } from '../src/web/queryGuard.ts';

const PAGE =
	'The quarterly migration of the billing cluster is scheduled for the second weekend of March, owner is Marta.';

describe('WorkspaceTextLedger', () => {
	it('C356 a sentence pasted from a page is refused, whatever the case or spacing', () => {
		const ledger = new WorkspaceTextLedger();
		ledger.add(PAGE);
		assert.equal(ledger.overlaps('news: THE  quarterly migration of the billing cluster is scheduled for'), true);
	});

	it('C356 the same idea paraphrased passes (the documented limit)', () => {
		const ledger = new WorkspaceTextLedger();
		ledger.add(PAGE);
		assert.equal(ledger.overlaps('when does the billing cluster move, march weekend, who owns it'), false);
	});

	it('C356 a 7-word overlap under 40 chars passes', () => {
		const ledger = new WorkspaceTextLedger();
		ledger.add('alpha beta gamma delta eps zeta eta theta iota');
		const query = 'alpha beta gamma delta eps zeta eta';
		assert.equal(query.length < 40, true);
		assert.equal(ledger.overlaps(query), false);
	});

	it('C356 8 consecutive words are refused even under 40 chars', () => {
		const ledger = new WorkspaceTextLedger();
		ledger.add('a b c d e f g h i');
		assert.equal(ledger.overlaps('x a b c d e f g h'), true);
	});

	it('C356 40 characters across a word boundary are caught, 39 are not', () => {
		const ledger = new WorkspaceTextLedger();
		ledger.add(`xx ${'b'.repeat(19)} ${'c'.repeat(20)} yy`);
		assert.equal(ledger.overlaps(`q ${'b'.repeat(19)} ${'c'.repeat(20)} z`), true);
		assert.equal(ledger.overlaps(`q ${'b'.repeat(18)} ${'c'.repeat(19)} z`), false);
	});

	it('C356 an empty ledger never overlaps', () => {
		const ledger = new WorkspaceTextLedger();
		assert.equal(ledger.overlaps(PAGE), false);
		ledger.add('   ');
		assert.equal(ledger.overlaps(PAGE), false);
	});

	it('C356 control and format characters cannot split a run', () => {
		const ledger = new WorkspaceTextLedger();
		ledger.add(PAGE);
		assert.equal(ledger.overlaps('billing​ cluster is sched\u0007uled for the second weekend'), true);
	});

	it('C356 the ledger is bounded: the oldest text is dropped first', () => {
		const ledger = new WorkspaceTextLedger();
		ledger.add(PAGE);
		ledger.add(`${'z'.repeat(MAX_LEDGER_CHARS - 10)} tail`);
		ledger.add('y'.repeat(100));
		assert.equal(ledger.overlaps(PAGE), false);
		assert.equal(ledger.overlaps('y'.repeat(60)), true);
	});

	it('C356 a large ledger is scanned in linear time', () => {
		const ledger = new WorkspaceTextLedger();
		const words = Array.from({ length: 30_000 }, (_, i) => `w${i}`).join(' ');
		ledger.add(words);
		const start = performance.now();
		assert.equal(ledger.overlaps('nothing here matches at all, honestly not a single run of it'), false);
		assert.equal(performance.now() - start < 1000, true);
	});
});
