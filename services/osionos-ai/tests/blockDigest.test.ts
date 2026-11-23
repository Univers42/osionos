import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { blockDigest } from '../src/approvals/inverseData.ts';

/** The digest of a block is of its value, not of the key order a JSONB column hands back. */
describe('blockDigest', () => {
	it('is equal when only the object key order differs, at any depth', () => {
		const sent = { type: 'paragraph', content: { text: 'hi', marks: [{ type: 'bold', from: 0 }], align: 'left' } };
		const stored = { content: { align: 'left', marks: [{ from: 0, type: 'bold' }], text: 'hi' }, type: 'paragraph' };
		assert.equal(blockDigest(sent), blockDigest(stored));
	});

	it('still tells different values and different array order apart', () => {
		assert.notEqual(blockDigest({ type: 'p', content: { a: 1 } }), blockDigest({ type: 'p', content: { a: 2 } }));
		assert.notEqual(blockDigest({ type: 'p', content: [1, 2] }), blockDigest({ type: 'p', content: [2, 1] }));
	});

	it('keeps the digest of a plain string block, so recorded rows still match', () => {
		const legacy = createHash('sha256').update(JSON.stringify(['paragraph', 'x'])).digest('hex');
		assert.equal(blockDigest({ type: 'paragraph', content: 'x' }), legacy);
	});
});
