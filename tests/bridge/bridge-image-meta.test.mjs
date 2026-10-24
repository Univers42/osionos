/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-image-meta.test.mjs                         :::      :::    :::   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P0-6: an avatar leaves the browser as bytes, and bytes carry more than pixels.
// The bridge strips the metadata (GPS in an EXIF block, an XMP packet, a PNG
// comment, a GIF comment) and never trusts the client to have done it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { imageInfo, stripImageMetadata } from '../../scripts/bridge-image-meta.mjs';
import {
	gifFixture,
	jpegFixture,
	jpegSegment,
	pngChunk,
	pngFixture,
	webpChunk,
	webpFixture,
} from './support/image-fixtures.mjs';

describe('imageInfo reads the dimensions of every format the bridge stores', () => {
	it('reads a PNG', () => {
		assert.deepEqual(imageInfo(pngFixture({ width: 64, height: 64 })), { type: 'image/png', width: 64, height: 64 });
	});

	it('reads a JPEG', () => {
		assert.deepEqual(imageInfo(jpegFixture({ width: 160, height: 160 })), { type: 'image/jpeg', width: 160, height: 160 });
	});

	it('reads a GIF', () => {
		assert.deepEqual(imageInfo(gifFixture({ width: 460, height: 460 })), { type: 'image/gif', width: 460, height: 460 });
	});

	it('reads the three WebP kinds', () => {
		assert.deepEqual(imageInfo(webpFixture({ width: 64, height: 64, kind: 'VP8L' })), { type: 'image/webp', width: 64, height: 64 });
		assert.deepEqual(imageInfo(webpFixture({ width: 64, height: 64, kind: 'VP8 ' })), { type: 'image/webp', width: 64, height: 64 });
		assert.deepEqual(imageInfo(webpFixture({ width: 64, height: 64, kind: 'VP8X' })), { type: 'image/webp', width: 64, height: 64 });
	});

	it('refuses what is not an image', () => {
		assert.throws(() => imageInfo(Buffer.from('not an image at all')), { code: 'invalid_image' });
		assert.throws(() => imageInfo(Buffer.alloc(0)), { code: 'invalid_image' });
	});
});

describe('stripImageMetadata removes what the formats call metadata', () => {
	it('drops the APP1 EXIF block of a JPEG and keeps APP0 and APP14', () => {
		const exif = jpegSegment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from('GPSLatitude 51/1 30/1 0/1')]));
		const adobe = jpegSegment(0xee, Buffer.from('Adobe', 'latin1'));
		const source = jpegFixture({ width: 64, height: 64, extra: [exif, adobe] });
		const stripped = stripImageMetadata(source);

		assert.equal(stripped.includes(Buffer.from('Exif', 'latin1')), false, 'the EXIF block is gone');
		assert.equal(stripped.includes(Buffer.from('GPSLatitude', 'latin1')), false, 'the GPS payload is gone');
		assert.equal(stripped.includes(Buffer.from('JFIF', 'latin1')), true, 'APP0 stays');
		assert.equal(stripped.includes(Buffer.from('Adobe', 'latin1')), true, 'APP14 stays');
		assert.deepEqual(imageInfo(stripped), { type: 'image/jpeg', width: 64, height: 64 });
		assert.ok(stripped.length < source.length);
	});

	it('drops the COM segment of a JPEG', () => {
		const source = jpegFixture({ width: 8, height: 8, extra: [jpegSegment(0xfe, Buffer.from('a comment', 'latin1'))] });
		const stripped = stripImageMetadata(source);
		assert.equal(stripped.includes(Buffer.from('a comment', 'latin1')), false);
		assert.deepEqual(imageInfo(stripped), { type: 'image/jpeg', width: 8, height: 8 });
	});

	it('drops the EXIF and XMP chunks of a WebP, clears the flags and fixes the RIFF size', () => {
		const source = webpFixture({
			width: 64,
			height: 64,
			kind: 'VP8X',
			flags: 0x08 | 0x04,
			extra: [webpChunk('EXIF', Buffer.from('Exif data', 'latin1')), webpChunk('XMP ', Buffer.from('<x:xmpmeta/>', 'latin1'))],
		});
		const stripped = stripImageMetadata(source);

		assert.equal(stripped.includes(Buffer.from('Exif data', 'latin1')), false);
		assert.equal(stripped.includes(Buffer.from('xmpmeta', 'latin1')), false);
		assert.equal(stripped.readUInt32LE(4), stripped.length - 8, 'the RIFF size is the file size again');
		const flags = stripped[stripped.indexOf(Buffer.from('VP8X', 'latin1')) + 8];
		assert.equal(flags & 0x08, 0, 'the EXIF flag is cleared');
		assert.equal(flags & 0x04, 0, 'the XMP flag is cleared');
		assert.deepEqual(imageInfo(stripped), { type: 'image/webp', width: 64, height: 64 });
	});

	it('drops the text chunks of a PNG', () => {
		const source = pngFixture({
			width: 64,
			height: 64,
			extra: [
				pngChunk('tEXt', Buffer.from('Comment\0GPS 51.5, -0.1', 'latin1')),
				pngChunk('zTXt', Buffer.concat([Buffer.from('Author\0', 'latin1'), Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])])),
				pngChunk('eXIf', Buffer.from('II*\0', 'latin1')),
				pngChunk('tIME', Buffer.from([0x07, 0xe6, 0x01, 0x01, 0x00, 0x00, 0x00])),
			],
		});
		const stripped = stripImageMetadata(source);

		assert.equal(stripped.includes(Buffer.from('Comment', 'latin1')), false);
		assert.equal(stripped.includes(Buffer.from('GPS 51.5', 'latin1')), false);
		assert.deepEqual(imageInfo(stripped), { type: 'image/png', width: 64, height: 64 });
	});

	it('drops the comment extension of a GIF', () => {
		const source = gifFixture({ width: 64, height: 64, comment: 'a comment' });
		const stripped = stripImageMetadata(source);
		assert.equal(stripped.includes(Buffer.from('a comment', 'latin1')), false);
		assert.deepEqual(imageInfo(stripped), { type: 'image/gif', width: 64, height: 64 });
	});
});

describe('the bytes after the end of the image are dropped', () => {
	const TAIL = Buffer.from('<html><script>alert(1)</script></html>', 'latin1');

	it('a PNG stops at its IEND chunk', () => {
		const stripped = stripImageMetadata(Buffer.concat([pngFixture({ width: 8, height: 8 }), TAIL]));
		assert.equal(stripped.includes(Buffer.from('<html>', 'latin1')), false, 'the tail is gone');
		assert.deepEqual(imageInfo(stripped), { type: 'image/png', width: 8, height: 8 });
	});

	it('a JPEG stops at the EOI that closes the image', () => {
		const stripped = stripImageMetadata(Buffer.concat([jpegFixture({ width: 8, height: 8 }), TAIL]));
		assert.equal(stripped.includes(Buffer.from('<html>', 'latin1')), false, 'the tail is gone');
		assert.deepEqual(imageInfo(stripped), { type: 'image/jpeg', width: 8, height: 8 });
	});

	it('a GIF stops at its trailer', () => {
		const stripped = stripImageMetadata(Buffer.concat([gifFixture({ width: 8, height: 8 }), TAIL]));
		assert.equal(stripped.includes(Buffer.from('<html>', 'latin1')), false, 'the tail is gone');
		assert.deepEqual(imageInfo(stripped), { type: 'image/gif', width: 8, height: 8 });
	});

	it('a WebP stops at the size its RIFF header declares', () => {
		const stripped = stripImageMetadata(Buffer.concat([webpFixture({ width: 8, height: 8 }), TAIL]));
		assert.equal(stripped.includes(Buffer.from('<html>', 'latin1')), false, 'the tail is gone');
		assert.deepEqual(imageInfo(stripped), { type: 'image/webp', width: 8, height: 8 });
	});
});

describe('a malformed or truncated file throws instead of guessing', () => {
	const cases = [
		{ name: 'a PNG cut in half', buffer: pngFixture().subarray(0, 20) },
		{ name: 'a JPEG cut in half', buffer: jpegFixture().subarray(0, 12) },
		{ name: 'a GIF cut in half', buffer: gifFixture().subarray(0, 8) },
		{ name: 'a WebP cut in half', buffer: webpFixture().subarray(0, 10) },
	];

	for (const testCase of cases) {
		it(`${testCase.name} throws within 50 ms`, () => {
			const started = process.hrtime.bigint();
			assert.throws(() => imageInfo(testCase.buffer), { code: 'invalid_image' });
			assert.throws(() => stripImageMetadata(testCase.buffer), { code: 'invalid_image' });
			const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
			assert.ok(elapsed < 50, `took ${elapsed}ms`);
		});
	}

	it('a chunk length of 2^32-1 throws instead of allocating', () => {
		const source = pngFixture();
		const mutated = Buffer.from(source);
		mutated.writeUInt32BE(0xffffffff, 8);
		const started = process.hrtime.bigint();
		assert.throws(() => imageInfo(mutated), { code: 'invalid_image' });
		assert.throws(() => stripImageMetadata(mutated), { code: 'invalid_image' });
		const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
		assert.ok(elapsed < 50, `took ${elapsed}ms`);
	});
});
