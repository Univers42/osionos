/**
 * The header of an image: its format and its dimensions, read from the bytes
 * before any decode.
 *
 * Magic bytes only: png, jpeg, webp. A width times height over 16.7 million
 * pixels is refused before a single pixel is decoded, so a PNG that declares
 * sixty thousand by sixty thousand costs a few bytes of RAM, not gigabytes.
 * Single frame only: APNG (an `acTL` chunk) and animated WebP (`ANIM`) are
 * refused. Corrupt input is a 422, never a 500.
 */

export type ImageFormat = 'png' | 'jpeg' | 'webp';

export interface ImageHeader {
	format: ImageFormat;
	width: number;
	height: number;
}

/** The ceiling of pixels an image may declare: 16.7 megapixels. */
export const MAX_PIXELS = 16_700_000;

function invalid(code = 'invalid_image'): never {
	throw Object.assign(new Error(code), { status: 422, code });
}

function tooLarge(): never {
	throw Object.assign(new Error('image_too_large'), { status: 422, code: 'image_too_large' });
}

function animated(): never {
	throw Object.assign(new Error('animated_image'), { status: 422, code: 'animated_image' });
}

/** Read a big-endian 32-bit integer. */
function readU32BE(bytes: Uint8Array, offset: number): number {
	return (
		((bytes[offset] << 24) >>> 0) +
		((bytes[offset + 1] << 16) >>> 0) +
		((bytes[offset + 2] << 8) >>> 0) +
		(bytes[offset + 3] >>> 0)
	);
}

/** Read a little-endian 32-bit integer. */
function readU32LE(bytes: Uint8Array, offset: number): number {
	return (
		(bytes[offset] >>> 0) +
		((bytes[offset + 1] << 8) >>> 0) +
		((bytes[offset + 2] << 16) >>> 0) +
		((bytes[offset + 3] << 24) >>> 0)
	);
}

/** Read a 24-bit little-endian integer. */
function readU24LE(bytes: Uint8Array, offset: number): number {
	return (bytes[offset] >>> 0) + ((bytes[offset + 1] << 8) >>> 0) + ((bytes[offset + 2] << 16) >>> 0);
}

function parsePng(bytes: Uint8Array): ImageHeader {
	if (bytes.length < 24) invalid();
	// signature
	const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	for (let i = 0; i < sig.length; i += 1) if (bytes[i] !== sig[i]) invalid();
	// IHDR must be the first chunk.
	const offset = 8;
	// chunk: length(4) type(4) data(...) crc(4)
	if (offset + 12 > bytes.length) invalid();
	const length = readU32BE(bytes, offset);
	if (length < 13) invalid();
	const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
	if (type !== 'IHDR') invalid();
	const width = readU32BE(bytes, offset + 8);
	const height = readU32BE(bytes, offset + 12);
	// scan chunks for acTL (APNG) anywhere before IEND
	let pos = 8;
	let hasAcTL = false;
	while (pos + 8 <= bytes.length) {
		const chunkLen = readU32BE(bytes, pos);
		if (chunkLen < 0 || pos + 12 + chunkLen > bytes.length) break;
		const chunkType = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
		if (chunkType === 'acTL') hasAcTL = true;
		if (chunkType === 'IEND') break;
		pos += 12 + chunkLen;
	}
	if (hasAcTL) animated();
	if (width <= 0 || height <= 0 || width * height > MAX_PIXELS) {
		if (width > 0 && height > 0 && width * height > MAX_PIXELS) tooLarge();
		invalid();
	}
	return { format: 'png', width, height };
}

function parseJpeg(bytes: Uint8Array): ImageHeader {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) invalid();
	let i = 2;
	let width = 0;
	let height = 0;
	let found = false;
	while (i < bytes.length - 1) {
		if (bytes[i] !== 0xff) {
			i += 1;
			continue;
		}
		// skip fill bytes
		while (i < bytes.length && bytes[i] === 0xff) i += 1;
		if (i >= bytes.length) break;
		const marker = bytes[i];
		i += 1;
		// standalone markers
		if (marker === 0xd9 || marker === 0xd8) continue; // EOI/SOI
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // TEM/RST
		if (i + 2 > bytes.length) invalid();
		const segLen = (bytes[i] << 8) | bytes[i + 1];
		if (segLen < 2 || i + segLen > bytes.length) invalid();
		// SOF markers: 0xC0..0xCF except 0xC4 (DHT), 0xC8 (JPG), 0xCC (DAC)
		if (
			marker >= 0xc0 &&
			marker <= 0xcf &&
			marker !== 0xc4 &&
			marker !== 0xc8 &&
			marker !== 0xcc
		) {
			if (segLen < 7) invalid();
			height = (bytes[i + 3] << 8) | bytes[i + 4];
			width = (bytes[i + 5] << 8) | bytes[i + 6];
			found = true;
			break;
		}
		i += segLen;
	}
	if (!found || width <= 0 || height <= 0) invalid();
	if (width * height > MAX_PIXELS) tooLarge();
	return { format: 'jpeg', width, height };
}

function parseWebp(bytes: Uint8Array): ImageHeader {
	// RIFF....WEBP
	if (bytes.length < 12) invalid();
	if (bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46) invalid();
	if (bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50) invalid();
	let isAnimated = false;
	let width = 0;
	let height = 0;
	let found = false;
	// chunks start at offset 12
	let pos = 12;
	while (pos + 8 <= bytes.length) {
		const fourcc = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
		const size = readU32LE(bytes, pos + 4);
		if (size < 0 || pos + 8 + size > bytes.length) break;
		if (fourcc === 'VP8 ') {
			// lossy: width/height at offset 26/28? bytes: frame tag 3, width/height 2 each at offset 6 within chunk? 
			// VP8 bitstream: 3 bytes frame tag, then 2 bytes width, 2 bytes height (with scale bits)
			const base = pos + 8;
			if (base + 10 <= bytes.length) {
				width = (bytes[base + 6] | (bytes[base + 7] << 8)) & 0x3fff;
				height = (bytes[base + 8] | (bytes[base + 9] << 8)) & 0x3fff;
				found = true;
			}
		} else if (fourcc === 'VP8L') {
			const base = pos + 8;
			// signature 0x2f
			if (bytes[base] === 0x2f) {
				const b0 = bytes[base + 1];
				const b1 = bytes[base + 2];
				const b2 = bytes[base + 3];
				const b3 = bytes[base + 4];
				width = 1 + (((b1 & 0x3f) << 8) | b0);
				height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
				found = true;
			}
		} else if (fourcc === 'VP8X') {
			const base = pos + 8;
			const flags = bytes[base];
			if (flags & 0x02) isAnimated = true; // animation flag
			// canvas size: 3 bytes width-1, 3 bytes height-1 at offset 4
			width = readU24LE(bytes, base + 4) + 1;
			height = readU24LE(bytes, base + 7) + 1;
			found = true;
		} else if (fourcc === 'ANIM') {
			isAnimated = true;
		} else if (fourcc === 'ANMF') {
			isAnimated = true;
		}
		pos += 8 + size + (size & 1);
	}
	if (isAnimated) animated();
	if (!found || width <= 0 || height <= 0) invalid();
	if (width * height > MAX_PIXELS) tooLarge();
	return { format: 'webp', width, height };
}

export function readImageHeader(input: unknown): ImageHeader {
	let bytes: Uint8Array;
	if (input instanceof Uint8Array) bytes = input;
	else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
	else if (ArrayBuffer.isView(input)) bytes = new Uint8Array((input as ArrayBufferView).buffer);
	else if (typeof input === 'object' && input !== null && 'buffer' in (input as Record<string, unknown>)) {
		bytes = new Uint8Array((input as { buffer: ArrayBuffer }).buffer);
	} else {
		invalid();
	}
	if (bytes.length < 4) invalid();
	// magic dispatch
	if (bytes[0] === 0x89 && bytes[1] === 0x50) return parsePng(bytes);
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return parseJpeg(bytes);
	if (bytes[0] === 0x52 && bytes[1] === 0x49) return parseWebp(bytes);
	invalid();
}

// aliases
export const parseImageHeader = readImageHeader;
export const imageHeader = readImageHeader;
export const validateImageHeader = readImageHeader;
export const getImageDimensions = readImageHeader;
export default readImageHeader;