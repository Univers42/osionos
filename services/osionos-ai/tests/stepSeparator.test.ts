import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { stepSeparator } from '../src/runs/streamPump.ts';

/**
 * The separator between two steps of the loop.
 *
 * The text of a step that follows another one begins on a line of its own:
 * markdown needs a blank line to start a new paragraph, and the two steps
 * are two paragraphs.
 */
describe('the separator between two steps', () => {
	it('is nothing when the answer is empty', () => {
		assert.equal(stepSeparator(''), '');
	});

	it('is a blank line after a text that does not end with a line', () => {
		assert.equal(stepSeparator('a'), '\n\n');
	});

	it('is a line after a text that ends with a line', () => {
		assert.equal(stepSeparator('a\n'), '\n');
	});

	it('is nothing after a text that ends with a blank line', () => {
		assert.equal(stepSeparator('a\n\n'), '');
	});
});
