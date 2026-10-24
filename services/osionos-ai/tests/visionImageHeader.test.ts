import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_PIXELS, readImageHeader } from '../src/vision/imageHeader.ts';
import { gpsApp1, jpegBytes, pngBytes, svgBytes, webpBytes } from './visionFixtures.ts';

/**
 * The header of an image: the format and the size, read from the bytes.
 *
 * Every image of a run is read before a single pixel is decoded, so the
 * parser is the wall that a decompression bomb never reaches.
 */

/** The code and the status of a refusal. */
function refusal(bytes: Uint8Array): { code: string; status: number } {
	try {
		readImageHeader(bytes);
	} catch (error) {
		const failure = error as { code?: unknown; status?: unknown };
		return { code: String(failure.code ?? ''), status: Number(failure.status ?? 0) };
	}
	throw new Error('the header was read, and it should not have been');
}

describe('the header of an image', () => {
	it('reads the size of a PNG from its IHDR', () => {
		const header = readImageHeader(pngBytes({ width: 120, height: 80 }));
		assert.equal(header.format, 'png');
		assert.equal(header.width, 120);
		assert.equal(header.height, 80);
	});

	it('reads the size of a JPEG from its frame', () => {
		const header = readImageHeader(jpegBytes({ width: 640, height: 480 }));
		assert.equal(header.format, 'jpeg');
		assert.equal(header.width, 640);
		assert.equal(header.height, 480);
	});

	it('reads the size of a JPEG that carries a GPS APP1', () => {
		const header = readImageHeader(jpegBytes({ width: 32, height: 16, app1: gpsApp1() }));
		assert.equal(header.format, 'jpeg');
		assert.equal(header.width, 32);
		assert.equal(header.height, 16);
	});

	it('reads the canvas of a WebP from its VP8X', () => {
		const header = readImageHeader(webpBytes({ width: 300, height: 200 }));
		assert.equal(header.format, 'webp');
		assert.equal(header.width, 300);
		assert.equal(header.height, 200);
	});

	it('refuses a PNG that declares more pixels than the ceiling', () => {
		const refusalOfBig = refusal(pngBytes({ width: 60_000, height: 60_000 }));
		assert.equal(refusalOfBig.code, 'image_too_large');
		assert.equal(refusalOfBig.status, 422);
	});

	it('refuses a PNG that declares one pixel too many', () => {
		const side = Math.floor(Math.sqrt(MAX_PIXELS)) + 1;
		const refusalOfBig = refusal(pngBytes({ width: side, height: side }));
		assert.equal(refusalOfBig.code, 'image_too_large');
	});

	it('refuses an APNG, which has more than one frame', () => {
		const refusalOfAnimated = refusal(pngBytes({ animated: true }));
		assert.equal(refusalOfAnimated.code, 'animated_image');
		assert.equal(refusalOfAnimated.status, 422);
	});

	it('refuses an animated WebP, which the VP8X flag announces', () => {
		const refusalOfAnimated = refusal(webpBytes({ animated: true }));
		assert.equal(refusalOfAnimated.code, 'animated_image');
		assert.equal(refusalOfAnimated.status, 422);
	});

	it('refuses a corrupt JPEG, and never answers a 500', () => {
		const refusalOfBroken = refusal(jpegBytes({ corrupt: true }));
		assert.equal(refusalOfBroken.code, 'invalid_image');
		assert.equal(refusalOfBroken.status, 422);
	});

	it('refuses bytes that are not an image at all', () => {
		const refusalOfSvg = refusal(svgBytes());
		assert.equal(refusalOfSvg.code, 'invalid_image');
		assert.equal(refusalOfSvg.status, 422);
	});

	it('refuses an empty file', () => {
		const refusalOfNothing = refusal(new Uint8Array(0));
		assert.equal(refusalOfNothing.code, 'invalid_image');
		assert.equal(refusalOfNothing.status, 422);
	});

	it('refuses a PNG whose IHDR is not the first chunk', () => {
		const broken = pngBytes({ width: 4, height: 4 });
		// The signature stays, the IHDR does not: the first chunk is another one.
		const withoutHeader = new Uint8Array([...broken.slice(0, 8), ...broken.slice(33)]);
		const refusalOfBroken = refusal(withoutHeader);
		assert.equal(refusalOfBroken.code, 'invalid_image');
	});
});
