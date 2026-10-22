/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   image-fixtures.mjs                                 :::      :::    :::   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Image fixtures built byte by byte, so a test can put a hostile length field
// exactly where it wants it. The PNG carries a real CRC and a real zlib stream
// (a fixture that only looks like a PNG would let a broken parser pass).

import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
	const table = new Int32Array(256);
	for (let n = 0; n < 256; n += 1) {
		let c = n;
		for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
		table[n] = c;
	}
	return table;
})();

function crc32(buffer) {
	let c = 0xffffffff;
	for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

export function pngChunk(type, data) {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length, 0);
	const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body), 0);
	return Buffer.concat([length, body, crc]);
}

/** A PNG with real pixels; `extra` chunks are appended before IEND. */
export function pngFixture({ width = 1, height = 1, extra = [] } = {}) {
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = 6;
	const raw = Buffer.alloc(height * (1 + width * 4));
	const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', header)];
	for (const chunk of extra) parts.push(chunk);
	parts.push(pngChunk('IDAT', deflateSync(raw)));
	parts.push(pngChunk('IEND', Buffer.alloc(0)));
	return Buffer.concat(parts);
}

/** A JPEG with an APP0 (JFIF) and a frame header; `extra` segments sit before SOF0. */
export function jpegFixture({ width = 1, height = 1, extra = [] } = {}) {
	const jfif = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0', 'latin1'), Buffer.from([0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00])]);
	const frame = Buffer.alloc(11);
	frame.writeUInt16BE(11, 0);
	frame[2] = 8;
	frame.writeUInt16BE(height, 3);
	frame.writeUInt16BE(width, 5);
	frame[7] = 1;
	frame[8] = 0x01;
	frame[9] = 0x11;
	return Buffer.concat([
		Buffer.from([0xff, 0xd8]),
		jfif,
		...extra,
		Buffer.from([0xff, 0xc0]), frame,
		Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
		Buffer.from([0x00, 0x00]),
		Buffer.from([0xff, 0xd9]),
	]);
}

/** A JPEG segment with a marker, a length and a payload. */
export function jpegSegment(marker, payload) {
	const length = Buffer.alloc(2);
	length.writeUInt16BE(payload.length + 2, 0);
	return Buffer.concat([Buffer.from([0xff, marker]), length, payload]);
}

/** A GIF; `comment` becomes a comment extension (the polyglot carrier). */
export function gifFixture({ width = 1, height = 1, comment = null } = {}) {
	const screen = Buffer.alloc(7);
	screen.writeUInt16LE(width, 0);
	screen.writeUInt16LE(height, 2);
	const parts = [Buffer.from('GIF89a', 'latin1'), screen];
	if (comment !== null) {
		const data = Buffer.from(comment, 'latin1');
		parts.push(Buffer.from([0x21, 0xfe, data.length]), data, Buffer.from([0x00]));
	}
	parts.push(Buffer.from([0x3b]));
	return Buffer.concat(parts);
}

export function webpChunk(fourcc, data) {
	const header = Buffer.alloc(8);
	header.write(fourcc, 0, 4, 'latin1');
	header.writeUInt32LE(data.length, 4);
	const pad = data.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0);
	return Buffer.concat([header, data, pad]);
}

export function webpContainer(chunks) {
	const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), ...chunks]);
	const size = Buffer.alloc(4);
	size.writeUInt32LE(body.length, 0);
	return Buffer.concat([Buffer.from('RIFF', 'latin1'), size, body]);
}

/** A WebP: `kind` picks VP8 (lossy), VP8L (lossless) or VP8X (extended). */
export function webpFixture({ width = 1, height = 1, kind = 'VP8L', flags = 0, extra = [] } = {}) {
	const chunks = [];
	if (kind === 'VP8X') {
		const data = Buffer.alloc(10);
		data[0] = flags;
		data.writeUIntLE(width - 1, 4, 3);
		data.writeUIntLE(height - 1, 7, 3);
		chunks.push(webpChunk('VP8X', data));
	} else if (kind === 'VP8 ') {
		const data = Buffer.alloc(10);
		data[3] = 0x9d;
		data[4] = 0x01;
		data[5] = 0x2a;
		data.writeUInt16LE(width, 6);
		data.writeUInt16LE(height, 8);
		chunks.push(webpChunk('VP8 ', data));
	} else {
		const data = Buffer.alloc(5);
		data[0] = 0x2f;
		data.writeUInt32LE(((width - 1) | ((height - 1) << 14)) >>> 0, 1);
		chunks.push(webpChunk('VP8L', data));
	}
	for (const chunk of extra) chunks.push(chunk);
	return webpContainer(chunks);
}

/** The PDF and ZIP bodies the content check must not refuse (they are attachments). */
export function pdfFixture() {
	return Buffer.from('%PDF-1.7\n1 0 obj\n<< >>\nendobj\ntrailer\n%%EOF\n', 'latin1');
}

export function zipFixture() {
	return Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]);
}

export function htmlFixture() {
	return Buffer.from('<!doctype html><html><body><script>alert(1)</script></body></html>', 'latin1');
}

/** A seeded generator: the same seed always mutates the same way. */
export function lcg(seed) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state;
	};
}
