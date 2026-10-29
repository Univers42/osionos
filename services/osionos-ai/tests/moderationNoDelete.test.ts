import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * C86: moderation is a soft state. No file of src/moderation (or the TEI
 * client it uses) may DELETE a row or write the state 'removed'.
 *
 * Caveat: a textual grep. It misses a statement assembled from pieces; it
 * reads comments too, so a comment must not spell the words either.
 */

const dirs = [new URL('../src/moderation/', import.meta.url), new URL('../src/encoders/', import.meta.url)];
const files = dirs.flatMap((dir) => readdirSync(dir).map((name) => new URL(name, dir)));

describe('moderation code is soft', () => {
	it('has files to check', () => {
		assert.ok(files.length >= 3);
	});
	for (const file of files) {
		it(`${file.pathname.split('/').slice(-2).join('/')} has no DELETE and no 'removed'`, () => {
			const text = readFileSync(file, 'utf8');
			assert.ok(!/\bDELETE\b/i.test(text), 'DELETE');
			assert.ok(!text.includes("'removed'"), "'removed'");
			assert.ok(!text.includes("'remove'"), "'remove'");
		});
	}
});
