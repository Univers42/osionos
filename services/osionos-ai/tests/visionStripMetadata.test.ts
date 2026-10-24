import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readImageHeader } from '../src/vision/imageHeader.ts';
import { stripMetadata } from '../src/vision/stripMetadata.ts';
import {
	gpsApp1,
	hasBytes,
	jpegBytes,
	pngBytes,
	pngChunkTypes,
	svgBytes,
	webpBytes,
	webpChunkTypes,
} from './visionFixtures.ts';

/**
 * The metadata of an image: it is removed, byte by byte.
 *
 * The pixels are never touched: the file is cut, not re-encoded. What is left
 * must still be an image the reader of the header can read.
 */

/** The bytes of a number, little-endian, on four bytes. */
function le32(bytes: Uint8Array, offset: number): number {
	return (
		(bytes[offset] >>> 0) +
		(bytes[offset + 1] << 8) +
		(bytes[offset + 2] << 16) +
		(bytes[offset + 3] << 24)
	);
}

describe('the metadata of an image', () => {
	it('drops the APP1 of a JPEG, and keeps the frame', () => {
		const source = jpegBytes({ width: 40, height: 30, app1: gpsApp1() });
		const stripped = stripMetadata(source);

		assert.equal(hasBytes(stripped, 'Exif'), false);
		assert.equal(hasBytes(stripped, 'GPS'), false);
		assert.equal(stripped.length < source.length, true);
		// The frame is still there: the image is still an image.
		const header = readImageHeader(stripped);
		assert.equal(header.format, 'jpeg');
		assert.equal(header.width, 40);
		assert.equal(header.height, 30);
	});

	it('drops the APP13 of a JPEG, the IPTC one', () => {
		const source = jpegBytes({ width: 8, height: 8, app13: [1, 2, 3, 4, 5] });
		const stripped = stripMetadata(source);

		assert.equal(hasBytes(stripped, 'Photoshop 3.0'), false);
		assert.equal(readImageHeader(stripped).format, 'jpeg');
	});

	it('drops the APP1 and the APP13 of a JPEG at once', () => {
		const source = jpegBytes({ width: 8, height: 8, app1: gpsApp1(), app13: [9, 9] });
		const stripped = stripMetadata(source);

		assert.equal(hasBytes(stripped, 'Exif'), false);
		assert.equal(hasBytes(stripped, 'Photoshop 3.0'), false);
	});

	it('leaves a JPEG without metadata as it is', () => {
		const source = jpegBytes({ width: 8, height: 8 });
		const stripped = stripMetadata(source);
		assert.deepEqual([...stripped], [...source]);
	});

	it('drops the tEXt and the eXIf of a PNG, and keeps the rest', () => {
		const source = pngBytes({
			width: 10,
			height: 10,
			chunks: [
				{ type: 'tEXt', data: [...new TextEncoder().encode('Comment\0a secret')] },
				{ type: 'eXIf', data: [...new TextEncoder().encode('II*\0')] },
			],
		});
		const stripped = stripMetadata(source);

		const types = pngChunkTypes(stripped);
		assert.equal(types.includes('tEXt'), false);
		assert.equal(types.includes('eXIf'), false);
		assert.equal(types.includes('IHDR'), true);
		assert.equal(types.includes('IEND'), true);
		assert.equal(hasBytes(stripped, 'a secret'), false);
		assert.equal(readImageHeader(stripped).width, 10);
	});

	it('drops the EXIF and the XMP of a WebP, clears the flags, and fixes the size', () => {
		const source = webpBytes({ width: 16, height: 16, exif: true, xmp: true });
		const stripped = stripMetadata(source);

		const types = webpChunkTypes(stripped);
		assert.equal(types.includes('EXIF'), false);
		assert.equal(types.includes('XMP '), false);
		assert.equal(types.includes('VP8X'), true);
		assert.equal(types.includes('VP8 '), true);
		// The flags of the VP8X say nothing about the chunks that are gone.
		const flags = stripped[20];
		assert.equal(flags & 0x08, 0, 'the EXIF flag must be clear');
		assert.equal(flags & 0x04, 0, 'the XMP flag must be clear');
		// The RIFF size is the size of what is left.
		assert.equal(le32(stripped, 4), stripped.length - 8);
		assert.equal(readImageHeader(stripped).format, 'webp');
	});

	it('leaves a WebP without metadata as it is', () => {
		const source = webpBytes({ width: 8, height: 8 });
		const stripped = stripMetadata(source);
		assert.deepEqual([...stripped], [...source]);
	});

	it('leaves bytes that are not an image as they are', () => {
		const source = svgBytes();
		const stripped = stripMetadata(source);
		assert.deepEqual([...stripped], [...source]);
	});
});
