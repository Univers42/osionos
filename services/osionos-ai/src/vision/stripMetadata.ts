/**
 * Strip the metadata of an image, byte by byte: no re-encode, no dependency.
 *
 * JPEG: drop APP1 (Exif/XMP) and APP13 (IPTC) segments.
 * PNG: drop eXIf, tEXt, iTXt, zTXt, tIME chunks.
 * WebP: drop EXIF/XMP chunks, clear the VP8X flags for them, fix the RIFF
 * size.
 */

function toBytes(input: unknown): Uint8Array {
	if (input instanceof Uint8Array) return input;
	if (input instanceof ArrayBuffer) return new Uint8Array(input);
	if (ArrayBuffer.isView(input)) return new Uint8Array((input as ArrayBufferView).buffer);
	throw new Error('invalid_input');
}

function concat(chunks: Uint8Array[]): Uint8Array {
	let total = 0;
	for (const c of chunks) total += c.byteLength;
	const out = new Uint8Array(total);
	let off = 0;
	for (const c of chunks) {
		out.set(c, off);
		off += c.byteLength;
	}
	return out;
}

function readU32BE(b: Uint8Array, o: number): number {
	return ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) >>> 0) + ((b[o + 2] << 8) >>> 0) + (b[o + 3] >>> 0);
}
function readU32LE(b: Uint8Array, o: number): number {
	return (b[o] >>> 0) + ((b[o + 1] << 8) >>> 0) + ((b[o + 2] << 16) >>> 0) + ((b[o + 3] << 24) >>> 0);
}
function writeU32LE(b: Uint8Array, o: number, v: number): void {
	b[o] = v & 0xff;
	b[o + 1] = (v >>> 8) & 0xff;
	b[o + 2] = (v >>> 16) & 0xff;
	b[o + 3] = (v >>> 24) & 0xff;
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function stripJpeg(bytes: Uint8Array): Uint8Array {
	// SOI
	const out: Uint8Array[] = [bytes.slice(0, 2)];
	let i = 2;
	// copy until SOS, then copy rest
	while (i < bytes.length) {
		if (bytes[i] !== 0xff) {
			// unexpected; copy rest
			out.push(bytes.slice(i));
			break;
		}
		// skip fill
		let j = i;
		while (j < bytes.length && bytes[j] === 0xff) j += 1;
		if (j >= bytes.length) {
			out.push(bytes.slice(i));
			break;
		}
		const marker = bytes[j];
		// standalone
		if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
			// copy marker (2 bytes) and continue
			out.push(bytes.slice(i, j + 1));
			i = j + 1;
			continue;
		}
		if (j + 3 > bytes.length) {
			out.push(bytes.slice(i));
			break;
		}
		const segLen = (bytes[j + 1] << 8) | bytes[j + 2];
		const segStart = i;
		const segEnd = j + 1 + segLen; // marker(1)+len(2)+payload
		// APP1 = 0xE1, APP13 = 0xED
		const isApp1 = marker === 0xe1;
		const isApp13 = marker === 0xed;
		if (marker === 0xda) {
			// SOS: copy from here to EOI
			out.push(bytes.slice(segStart));
			break;
		}
		if (!isApp1 && !isApp13) {
			out.push(bytes.slice(segStart, segEnd));
		}
		i = segEnd;
	}
	return concat(out);
}

function stripPng(bytes: Uint8Array): Uint8Array {
	const out: Uint8Array[] = [PNG_SIGNATURE.slice()];
	let pos = 8;
	const dropped = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);
	while (pos + 12 <= bytes.length) {
		const len = readU32BE(bytes, pos);
		if (len < 0 || pos + 12 + len > bytes.length) break;
		const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
		const chunkEnd = pos + 12 + len;
		if (type === 'IEND') {
			out.push(bytes.slice(pos, chunkEnd));
			break;
		}
		if (!dropped.has(type)) {
			out.push(bytes.slice(pos, chunkEnd));
		}
		pos = chunkEnd;
	}
	return concat(out);
}

function stripWebp(bytes: Uint8Array): Uint8Array {
	// RIFF header
	if (bytes.length < 12) return bytes.slice();
	const out: Uint8Array[] = [];
	// RIFF + size placeholder + WEBP
	const riffHeader = bytes.slice(0, 12);
	out.push(riffHeader.slice());
	let pos = 12;
	const keptChunks: { fourcc: string; data: Uint8Array }[] = [];
	while (pos + 8 <= bytes.length) {
		const fourcc = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
		const size = readU32LE(bytes, pos + 4);
		if (size < 0 || pos + 8 + size > bytes.length) break;
		const chunkData = bytes.slice(pos + 8, pos + 8 + size);
		const paddedSize = size + (size & 1);
		if (fourcc !== 'EXIF' && fourcc !== 'XMP ') {
			keptChunks.push({ fourcc, data: chunkData });
		}
		pos += 8 + paddedSize;
	}
	// rebuild VP8X flags if present
	const rebuilt: Uint8Array[] = [];
	// RIFF
	rebuilt.push(new TextEncoder().encode('RIFF'));
	// placeholder size
	rebuilt.push(new Uint8Array(4));
	rebuilt.push(new TextEncoder().encode('WEBP'));
	for (const chunk of keptChunks) {
		const fourccBytes = new TextEncoder().encode(chunk.fourcc);
		rebuilt.push(fourccBytes);
		const sizeBuf = new Uint8Array(4);
		writeU32LE(sizeBuf, 0, chunk.data.byteLength);
		rebuilt.push(sizeBuf);
		rebuilt.push(chunk.data);
		if (chunk.data.byteLength & 1) rebuilt.push(new Uint8Array(1));
		// clear VP8X exif/xmp flags
		if (chunk.fourcc === 'VP8X' && chunk.data.byteLength >= 1) {
			const data = chunk.data;
			// flags byte at 0: bit3 XMP, bit4 Exif
			data[0] = data[0] & ~(0x08 | 0x10);
			// mutate in rebuilt? we pushed original data slice (copy? slice is copy) yes data is slice copy
		}
	}
	const body = concat(rebuilt);
	// fix RIFF size = total - 8
	const size = body.byteLength - 8;
	writeU32LE(body, 4, size);
	return body;
}

export function stripMetadata(input: unknown): Uint8Array {
	const bytes = toBytes(input);
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return stripJpeg(bytes);
	if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return stripPng(bytes);
	if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49) return stripWebp(bytes);
	return bytes.slice();
}

// format detection helper
export function stripMetadataBytes(input: unknown): Uint8Array {
	return stripMetadata(input);
}

export const strip = stripMetadata;
export default stripMetadata;