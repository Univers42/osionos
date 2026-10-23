/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-zip.mjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * A STORE-only zip writer for the account export. The bridge image copies
 * scripts/bridge-*.mjs and cannot import from src/, so this is the server-side twin
 * of src/features/page-export/model/zipWriter.ts: same header layout, same flags,
 * same fixed timestamp (deterministic archives). It differs in one place: the CRC
 * comes from zlib.crc32 (Node 22.2+) instead of a hand-rolled table.
 *
 * Entry names come from the caller's registry, never from row data; they are still
 * checked here because an archive extractor is where a "../" name becomes a write
 * outside the target directory.
 *
 * Caveat: no zip64 (4 GiB or 65,535 entries) and no compression; the export caps
 * keep an archive far below both. A runtime without zlib.crc32 cannot build an
 * archive at all: buildZip throws `zip_unavailable` and the export module answers
 * 503 instead of writing a wrong checksum.
 */

import zlib from 'node:zlib';

export const ZIP_ENTRY_NAME_MAX = 255;
export const ZIP_MAX_ENTRIES = 65_535;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;
const UTF8_FLAG = 0x800;

/** True when this runtime can compute the checksum the format needs. */
export const zipAvailable = typeof zlib.crc32 === 'function';

/** NUL and the other control bytes, by code point (a control-character regex trips no-control-regex). */
function hasControl(text) {
	for (const char of text) {
		const code = char.codePointAt(0);
		if (code < 0x20 || code === 0x7f) return true;
	}
	return false;
}

function zipError(code, message) {
	return Object.assign(new Error(message), { status: 500, code });
}

/** Throws unless `name` is a relative, forward-slash, traversal-free entry name. */
export function assertEntryName(name) {
	if (typeof name !== 'string' || name === '') throw zipError('zip_bad_entry_name', 'A zip entry name is empty.');
	if (Buffer.byteLength(name, 'utf8') > ZIP_ENTRY_NAME_MAX) throw zipError('zip_bad_entry_name', 'A zip entry name is too long.');
	if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw zipError('zip_bad_entry_name', 'A zip entry name is absolute.');
	if (name.includes('\\') || hasControl(name)) throw zipError('zip_bad_entry_name', 'A zip entry name has a forbidden character.');
	if (name.includes('..')) throw zipError('zip_bad_entry_name', 'A zip entry name climbs out of the archive.');
}

function localHeader(name, crc, size) {
	const header = Buffer.alloc(30);
	header.writeUInt32LE(0x04034b50, 0);
	header.writeUInt16LE(20, 4);
	header.writeUInt16LE(UTF8_FLAG, 6);
	header.writeUInt16LE(0, 8);
	header.writeUInt16LE(DOS_TIME, 10);
	header.writeUInt16LE(DOS_DATE, 12);
	header.writeUInt32LE(crc, 14);
	header.writeUInt32LE(size, 18);
	header.writeUInt32LE(size, 22);
	header.writeUInt16LE(name.length, 26);
	header.writeUInt16LE(0, 28);
	return header;
}

function centralHeader(entry) {
	const header = Buffer.alloc(46);
	header.writeUInt32LE(0x02014b50, 0);
	header.writeUInt16LE(20, 4);
	header.writeUInt16LE(20, 6);
	header.writeUInt16LE(UTF8_FLAG, 8);
	header.writeUInt16LE(0, 10);
	header.writeUInt16LE(DOS_TIME, 12);
	header.writeUInt16LE(DOS_DATE, 14);
	header.writeUInt32LE(entry.crc, 16);
	header.writeUInt32LE(entry.size, 20);
	header.writeUInt32LE(entry.size, 24);
	header.writeUInt16LE(entry.name.length, 28);
	header.writeUInt32LE(entry.offset, 42);
	return header;
}

function endRecord(count, centralSize, centralStart) {
	const record = Buffer.alloc(22);
	record.writeUInt32LE(0x06054b50, 0);
	record.writeUInt16LE(count, 8);
	record.writeUInt16LE(count, 10);
	record.writeUInt32LE(centralSize, 12);
	record.writeUInt32LE(centralStart, 16);
	return record;
}

/**
 * Build a STORE zip from `[{ name, bytes }]`. `options.crc32` is the checksum
 * function; null means "this runtime has none" and is what a test passes to prove
 * the writer fails closed.
 */
export function buildZip(files, options = {}) {
	const crc32 = options.crc32 === undefined ? zlib.crc32 : options.crc32;
	if (typeof crc32 !== 'function') throw zipError('zip_unavailable', 'This runtime cannot compute zip checksums.');
	if (!Array.isArray(files) || files.length > ZIP_MAX_ENTRIES) throw zipError('zip_bad_entry_name', 'A zip needs between 0 and 65535 entries.');
	const seen = new Set();
	const parts = [];
	const central = [];
	let offset = 0;
	for (const file of files) {
		assertEntryName(file?.name);
		if (seen.has(file.name)) throw zipError('zip_bad_entry_name', 'A zip entry name is repeated.');
		seen.add(file.name);
		const name = Buffer.from(file.name, 'utf8');
		const bytes = Buffer.isBuffer(file.bytes) ? file.bytes : Buffer.from(file.bytes);
		const crc = crc32(bytes) >>> 0;
		central.push({ name, crc, size: bytes.length, offset });
		parts.push(localHeader(name, crc, bytes.length), name, bytes);
		offset += 30 + name.length + bytes.length;
	}
	const directory = central.flatMap((entry) => [centralHeader(entry), entry.name]);
	const centralSize = directory.reduce((total, part) => total + part.length, 0);
	return Buffer.concat([...parts, ...directory, endRecord(central.length, centralSize, offset)]);
}
