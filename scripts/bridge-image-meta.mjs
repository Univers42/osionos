/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-image-meta.mjs                              :::      :::    :::   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The image parsers of the content check: the dimensions of an image and the
 * metadata that must not travel with it. Pure functions over a Buffer — no
 * dependency, no I/O — because the bridge has no image library and a byte
 * check must never be a guess.
 *
 * Every parser bounds each length field against the buffer BEFORE it reads, so
 * a hostile file cannot walk off the end (the P0-3 RESP parser hung on exactly
 * that). A malformed or truncated file throws `invalid_image`; the caller turns
 * that into a 415. The stripped set is what the formats define as metadata:
 * PNG tEXt/zTXt/iTXt/eXIf/tIME, JPEG APP1-APP13/APP15/COM (APP0 and APP14 stay:
 * the colour profile), WebP EXIF/XMP (the flags and the RIFF size are fixed)
 * and the GIF comment extension.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_METADATA = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
const JPEG_METADATA = new Set([0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xec, 0xed, 0xef, 0xfe]);
const WEBP_METADATA = new Set(['EXIF', 'XMP ']);
const GIF_COMMENT = 'comment';

/** The one error shape: a stable code the caller maps to a 415. */
const imageError = (message) => Object.assign(new Error(message), { code: 'invalid_image' });
/** The parts of a file: the head plus the blocks, each marked keep or drop. */
function partsFrom(buffer, head, blocks, isMetadata) {
	const parts = [{ bytes: head, keep: true }];
	for (const block of blocks) parts.push({ bytes: buffer.subarray(block.start, block.end), keep: !isMetadata(block.key) });
	return parts;
}

function pngChunks(buffer) {
	if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
		throw imageError('PNG has no signature.');
	}
	const chunks = [];
	let at = PNG_SIGNATURE.length;
	while (at + 8 <= buffer.length) {
		const length = buffer.readUInt32BE(at);
		const key = buffer.toString('latin1', at + 4, at + 8);
		const dataStart = at + 8;
		const end = dataStart + length + 4;
		if (end > buffer.length) throw imageError('PNG chunk length runs past the end of the file.');
		chunks.push({ key, start: at, dataStart, dataEnd: dataStart + length, end });
		at = end;
		if (key === 'IEND') break;
	}
	if (chunks.length === 0) throw imageError('PNG holds no chunk.');
	if (chunks[0].key !== 'IHDR' || chunks[0].dataEnd - chunks[0].dataStart < 13) {
		throw imageError('PNG has no usable IHDR header.');
	}
	if (chunks[chunks.length - 1].key !== 'IEND') throw imageError('PNG has no IEND chunk.');
	return chunks;
}
function parsePng(buffer) {
	const chunks = pngChunks(buffer);
	const head = chunks[0];
	const width = buffer.readUInt32BE(head.dataStart);
	const height = buffer.readUInt32BE(head.dataStart + 4);
	if (width < 1 || height < 1) throw imageError('PNG has no usable dimensions.');
	const parts = partsFrom(buffer, PNG_SIGNATURE, chunks, (key) => PNG_METADATA.has(key));
	return { type: 'image/png', width, height, parts };
}

function jpegSegments(buffer) {
	if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
		throw imageError('JPEG has no start-of-image marker.');
	}
	const segments = [];
	let at = 2;
	while (at < buffer.length) {
		if (buffer[at] !== 0xff) throw imageError('JPEG segment marker is missing.');
		let markerAt = at;
		while (markerAt < buffer.length && buffer[markerAt] === 0xff) markerAt += 1;
		if (markerAt >= buffer.length) throw imageError('JPEG ends inside a marker.');
		const marker = buffer[markerAt];
		// SOS carries the entropy-coded data: everything after it is copied verbatim.
		if (marker === 0xda || marker === 0xd9) {
			segments.push({ key: marker, start: at, end: buffer.length, markerAt });
			break;
		}
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			segments.push({ key: marker, start: at, end: markerAt + 1, markerAt });
			at = markerAt + 1;
			continue;
		}
		if (markerAt + 3 > buffer.length) throw imageError('JPEG segment length is missing.');
		// The length counts the two length bytes and the payload, not the marker.
		const length = buffer.readUInt16BE(markerAt + 1);
		if (length < 2) throw imageError('JPEG segment length is invalid.');
		const end = markerAt + 1 + length;
		if (end > buffer.length) throw imageError('JPEG segment length runs past the end of the file.');
		segments.push({ key: marker, start: at, end, markerAt });
		at = end;
	}
	return segments;
}
function parseJpeg(buffer) {
	const segments = jpegSegments(buffer);
	let width = 0;
	let height = 0;
	for (const segment of segments) {
		const marker = segment.key;
		if (marker < 0xc0 || marker > 0xcf || marker === 0xc4 || marker === 0xc8 || marker === 0xcc) continue;
		if (segment.end - segment.markerAt < 8) throw imageError('JPEG frame header is truncated.');
		height = buffer.readUInt16BE(segment.markerAt + 4);
		width = buffer.readUInt16BE(segment.markerAt + 6);
		break;
	}
	if (width < 1 || height < 1) throw imageError('JPEG has no usable dimensions.');
	// The SOI is not a segment: it is the marker every JPEG starts with.
	const parts = partsFrom(buffer, buffer.subarray(0, 2), segments, (key) => JPEG_METADATA.has(key));
	return { type: 'image/jpeg', width, height, parts };
}

function readSubBlocks(buffer, at) {
	const parts = [];
	let cursor = at;
	while (cursor < buffer.length) {
		const size = buffer[cursor];
		cursor += 1;
		if (size === 0) return { end: cursor, parts };
		if (cursor + size > buffer.length) throw imageError('GIF data block runs past the end of the file.');
		parts.push(buffer.subarray(cursor, cursor + size));
		cursor += size;
	}
	throw imageError('GIF ends inside a data block.');
}
function gifBlocks(buffer) {
	if (buffer.length < 13) throw imageError('GIF is truncated.');
	const header = buffer.toString('latin1', 0, 6);
	if (header !== 'GIF87a' && header !== 'GIF89a') throw imageError('GIF has no signature.');
	const packed = buffer[10];
	const headerEnd = packed & 0x80 ? 13 + 3 * (2 ** ((packed & 0x07) + 1)) : 13;
	if (headerEnd > buffer.length) throw imageError('GIF colour table runs past the end of the file.');
	const blocks = [];
	let at = headerEnd;
	while (at < buffer.length) {
		const marker = buffer[at];
		if (marker === 0x3b) {
			blocks.push({ key: 'trailer', start: at, end: at + 1, text: '' });
			break;
		}
		if (marker === 0x21) {
			if (at + 2 > buffer.length) throw imageError('GIF extension is truncated.');
			const label = buffer[at + 1];
			const { end, parts } = readSubBlocks(buffer, at + 2);
			blocks.push({ key: label === 0xfe ? GIF_COMMENT : 'extension', start: at, end, text: Buffer.concat(parts).toString('latin1') });
			at = end;
			continue;
		}
		if (marker === 0x2c) {
			if (at + 10 > buffer.length) throw imageError('GIF image descriptor is truncated.');
			const local = buffer[at + 9];
			const cursor = at + 10 + (local & 0x80 ? 3 * (2 ** ((local & 0x07) + 1)) : 0);
			if (cursor > buffer.length) throw imageError('GIF colour table runs past the end of the file.');
			const { end } = readSubBlocks(buffer, cursor + 1);
			blocks.push({ key: 'image', start: at, end, text: '' });
			at = end;
			continue;
		}
		throw imageError('GIF block marker is unknown.');
	}
	return { headerEnd, blocks };
}
function parseGif(buffer) {
	const { headerEnd, blocks } = gifBlocks(buffer);
	const width = buffer.readUInt16LE(6);
	const height = buffer.readUInt16LE(8);
	if (width < 1 || height < 1) throw imageError('GIF has no usable dimensions.');
	const parts = partsFrom(buffer, buffer.subarray(0, headerEnd), blocks, (key) => key === GIF_COMMENT);
	return { type: 'image/gif', width, height, parts };
}

function webpChunks(buffer) {
	if (buffer.length < 12) throw imageError('WebP is truncated.');
	if (buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WEBP') {
		throw imageError('WebP has no RIFF header.');
	}
	if (buffer.readUInt32LE(4) + 8 > buffer.length) throw imageError('WebP RIFF size runs past the end of the file.');
	const chunks = [];
	let at = 12;
	while (at + 8 <= buffer.length) {
		const fourcc = buffer.toString('latin1', at, at + 4);
		const size = buffer.readUInt32LE(at + 4);
		const dataStart = at + 8;
		const dataEnd = dataStart + size;
		if (dataEnd > buffer.length) throw imageError('WebP chunk length runs past the end of the file.');
		chunks.push({ key: fourcc, start: at, dataStart, dataEnd, end: Math.min(dataEnd + (size % 2), buffer.length) });
		at = dataEnd + (size % 2);
	}
	if (chunks.length === 0) throw imageError('WebP holds no chunk.');
	return chunks;
}
/** The canvas of a VP8X chunk, and the chunk with its metadata flags cleared. */
function webpCanvas(chunk, buffer) {
	if (chunk.dataEnd - chunk.dataStart < 10) throw imageError('WebP canvas header is truncated.');
	const data = Buffer.from(buffer.subarray(chunk.dataStart, chunk.dataEnd));
	const width = 1 + (data[4] | (data[5] << 8) | (data[6] << 16));
	const height = 1 + (data[7] | (data[8] << 8) | (data[9] << 16));
	data[0] = data[0] & ~0x0c; // the EXIF (0x08) and the XMP (0x04) flags
	const header = Buffer.alloc(8);
	header.write(chunk.key, 0, 4, 'latin1');
	header.writeUInt32LE(data.length, 4);
	return { width, height, bytes: Buffer.concat([header, data, data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]) };
}
/** The frame of a VP8 (lossy) or VP8L (lossless) chunk. */
function webpFrame(chunk, buffer) {
	if (chunk.key === 'VP8L') {
		if (chunk.dataEnd - chunk.dataStart < 5) throw imageError('WebP lossless header is truncated.');
		const bits = buffer.readUInt32LE(chunk.dataStart + 1);
		return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
	}
	if (chunk.dataEnd - chunk.dataStart < 10) throw imageError('WebP frame header is truncated.');
	if (buffer[chunk.dataStart + 3] !== 0x9d || buffer[chunk.dataStart + 4] !== 0x01 || buffer[chunk.dataStart + 5] !== 0x2a) {
		throw imageError('WebP frame header is not a VP8 key frame.');
	}
	return {
		width: buffer.readUInt16LE(chunk.dataStart + 6) & 0x3fff,
		height: buffer.readUInt16LE(chunk.dataStart + 8) & 0x3fff,
	};
}
function parseWebp(buffer) {
	const chunks = webpChunks(buffer);
	const parts = [];
	let width = 0;
	let height = 0;
	for (const chunk of chunks) {
		if (chunk.key === 'VP8X') {
			const canvas = webpCanvas(chunk, buffer);
			width = canvas.width;
			height = canvas.height;
			parts.push({ bytes: canvas.bytes, keep: true });
			continue;
		}
		if (chunk.key === 'VP8L' || chunk.key === 'VP8 ') {
			const frame = webpFrame(chunk, buffer);
			width = width || frame.width;
			height = height || frame.height;
		}
		parts.push({ bytes: buffer.subarray(chunk.start, chunk.end), keep: !WEBP_METADATA.has(chunk.key) });
	}
	if (width < 1 || height < 1) throw imageError('WebP has no usable dimensions.');
	return { type: 'image/webp', width, height, parts };
}

/** The format of the bytes by their magic, or null when they are not an image this bridge reads. */
export function imageFormat(buffer) {
	if (!Buffer.isBuffer(buffer)) return null;
	const head = buffer.toString('latin1', 0, 12);
	if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) return 'gif';
	if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'webp';
	if (buffer.subarray(0, 8).equals(PNG_SIGNATURE) && buffer.length >= 8) return 'png';
	return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff ? 'jpeg' : null;
}

function parseImage(buffer) {
	const format = imageFormat(buffer);
	if (format === 'png') return parsePng(buffer);
	if (format === 'jpeg') return parseJpeg(buffer);
	if (format === 'gif') return parseGif(buffer);
	if (format === 'webp') return parseWebp(buffer);
	throw imageError('The bytes are not a PNG, JPEG, GIF or WebP image.');
}
/** The dimensions of an image: `{ type, width, height }`. Throws `invalid_image`. */
export function imageInfo(buffer) {
	const parsed = parseImage(buffer);
	return { type: parsed.type, width: parsed.width, height: parsed.height };
}
/** The same bytes without their metadata. Throws `invalid_image`. */
export function stripImageMetadata(buffer) {
	const parsed = parseImage(buffer);
	const body = Buffer.concat(parsed.parts.filter((part) => part.keep).map((part) => part.bytes));
	if (parsed.type !== 'image/webp') return body;
	// The RIFF size is the file size: dropping a chunk changes it.
	const size = Buffer.alloc(4);
	size.writeUInt32LE(body.length + 4, 0);
	return Buffer.concat([Buffer.from('RIFF', 'latin1'), size, Buffer.from('WEBP', 'latin1'), body]);
}

/** The text of a GIF's comment extension, '' when it has none. */
export function gifCommentText(buffer) {
	try {
		return gifBlocks(buffer).blocks.filter((block) => block.key === GIF_COMMENT).map((block) => block.text).join('');
	} catch {
		return '';
	}
}
