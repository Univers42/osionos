/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-mime.test.mjs                               :::      :::    :::   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P0-6: the declared Content-Type reaches the browser as the type a stored object
// is served with, so it must be the type the BYTES are. This is the check every
// upload route shares (bridge-storage-core.mjs calls it once, in the writer), and
// the parser behind it must never read past the buffer: the P0-3 RESP parser hung
// on exactly that.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertBytesMatch, sniffMime } from '../../scripts/bridge-mime.mjs';
import { imageInfo, stripImageMetadata } from '../../scripts/bridge-image-meta.mjs';
import {
	gifFixture,
	htmlFixture,
	lcg,
	jpegFixture,
	pdfFixture,
	pngFixture,
	webpFixture,
	zipFixture,
} from './support/image-fixtures.mjs';

const FORMATS = [
	{ name: 'png', build: () => pngFixture({ width: 4, height: 4 }) },
	{ name: 'jpeg', build: () => jpegFixture({ width: 4, height: 4 }) },
	{ name: 'gif', build: () => gifFixture({ width: 4, height: 4 }) },
	{ name: 'webp', build: () => webpFixture({ width: 4, height: 4 }) },
];

/** The parsers must answer or refuse, never walk off the end of the buffer. */
function parseOutcome(buffer) {
	const started = process.hrtime.bigint();
	try {
		const info = imageInfo(buffer);
		stripImageMetadata(buffer);
		const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
		return { kind: 'value', info, elapsed };
	} catch (error) {
		const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
		return { kind: 'error', error, elapsed };
	}
}

describe('sniffMime reads the bytes, not the request', () => {
	it('names the formats it knows', () => {
		assert.equal(sniffMime(pngFixture()), 'image/png');
		assert.equal(sniffMime(jpegFixture()), 'image/jpeg');
		assert.equal(sniffMime(gifFixture()), 'image/gif');
		assert.equal(sniffMime(webpFixture()), 'image/webp');
		assert.equal(sniffMime(webpFixture({ kind: 'VP8 ' })), 'image/webp');
		assert.equal(sniffMime(webpFixture({ kind: 'VP8X' })), 'image/webp');
		assert.equal(sniffMime(pdfFixture()), 'application/pdf');
		assert.equal(sniffMime(zipFixture()), 'application/zip');
		assert.equal(sniffMime(htmlFixture()), 'text/html');
	});

	it('refuses what it cannot name', () => {
		assert.equal(sniffMime(Buffer.alloc(0)), null);
		assert.equal(sniffMime(Buffer.from([0x00, 0x01, 0x02, 0x03])), null);
		assert.equal(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0x00])), null, 'a JPEG signature without a frame is not a JPEG');
		assert.equal(sniffMime('not a buffer'), null);
	});
});

describe('assertBytesMatch is the gate of the shared writer', () => {
	it('refuses HTML bytes declared as an image', () => {
		assert.throws(() => assertBytesMatch('image/png', htmlFixture()), { status: 415, code: 'unsupported_media_type' });
	});

	it('accepts a real image declared as that image', () => {
		assert.equal(assertBytesMatch('image/png', pngFixture()), true);
		assert.equal(assertBytesMatch('image/jpeg', jpegFixture()), true);
		assert.equal(assertBytesMatch('image/webp', webpFixture()), true);
		assert.equal(assertBytesMatch('image/gif', gifFixture()), true);
	});

	it('accepts an attachment whatever it holds — it is never rendered', () => {
		assert.equal(assertBytesMatch('application/pdf', pdfFixture()), true);
		assert.equal(assertBytesMatch('application/octet-stream', zipFixture()), true);
		assert.equal(assertBytesMatch('application/zip', zipFixture()), true);
	});

	it('refuses a page type whatever it holds', () => {
		for (const type of ['text/html', 'image/svg+xml', 'application/xhtml+xml']) {
			assert.throws(() => assertBytesMatch(type, Buffer.from('<html></html>')), { status: 415, code: 'unsupported_media_type' }, type);
		}
	});
});

describe('a polyglot is refused, not guessed', () => {
	const htmlWithPngHeader = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), htmlFixture()]);
	const svgWithPngHeader = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')]);
	const gifWithScript = gifFixture({ comment: '<script>alert(1)</script>' });

	it('refuses an HTML body that starts with a PNG signature', () => {
		assert.equal(sniffMime(htmlWithPngHeader), null);
		assert.throws(() => assertBytesMatch('image/png', htmlWithPngHeader), { status: 415 });
		assert.throws(() => assertBytesMatch('text/html', htmlWithPngHeader), { status: 415 });
	});

	it('refuses an SVG that starts with a PNG signature', () => {
		assert.equal(sniffMime(svgWithPngHeader), null);
		assert.throws(() => assertBytesMatch('image/png', svgWithPngHeader), { status: 415 });
		assert.throws(() => assertBytesMatch('image/svg+xml', svgWithPngHeader), { status: 415 });
	});

	it('refuses a GIF whose comment carries markup', () => {
		assert.equal(sniffMime(gifWithScript), null);
		assert.throws(() => assertBytesMatch('image/gif', gifWithScript), { status: 415 });
		assert.throws(() => assertBytesMatch('text/html', gifWithScript), { status: 415 });
	});
});

describe('every length field is bounded', () => {
	for (const format of FORMATS) {
		it(`${format.name}: a length of 0, of the remaining size + 1 and of 2^32-1 never walks off the buffer`, () => {
			const original = format.build();
			for (let at = 0; at + 4 <= original.length; at += 1) {
				// 0, 1, the size that is left plus one, and the largest length there is.
				for (const mutation of [0, 1, original.length - at + 1, 0xffffffff]) {
					const mutated = Buffer.from(original);
					mutated.writeUInt32BE(mutation, at);
					const outcome = parseOutcome(mutated);
					assert.ok(outcome.elapsed < 50, `${format.name}: a mutation at ${at} took ${outcome.elapsed}ms`);
					if (outcome.kind === 'error') {
						assert.notEqual(outcome.error.name, 'RangeError', `${format.name}: an out-of-range read at ${at}`);
						assert.equal(typeof outcome.error.code, 'string');
					}
				}
			}
		});
	}
});

describe('a seeded mutation loop never hangs and never reads past the buffer', () => {
	const RUNS = 2_000;

	for (const format of FORMATS) {
		it(`${format.name}: ${RUNS} mutations answer or refuse within 50 ms`, () => {
			const original = format.build();
			const random = lcg(0x5eed ^ format.name.length);
			for (let run = 0; run < RUNS; run += 1) {
				const mutated = Buffer.from(original);
				const at = random() % mutated.length;
				mutated[at] = random() & 0xff;
				const outcome = parseOutcome(mutated);
				assert.ok(outcome.elapsed < 50, `mutation ${run} took ${outcome.elapsed}ms`);
				if (outcome.kind === 'error') {
					assert.notEqual(outcome.error.name, 'RangeError', `mutation ${run} read past the buffer`);
					assert.ok(outcome.error.code, 'a refusal carries a stable code');
				}
			}
		});
	}
});
