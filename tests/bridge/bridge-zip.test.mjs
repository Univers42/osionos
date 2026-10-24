/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-zip.test.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The server-side zip writer. `unzip -t` is not in the container, so the archive is
 * re-read by hand: the central directory, then each entry's local header, size and
 * CRC. The constants are the ones src/features/page-export/model/zipWriter.ts writes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { ZIP_ENTRY_NAME_MAX, buildZip, zipAvailable } from '../../scripts/bridge-zip.mjs';

const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** The entries of a STORE zip, read from its end-of-central-directory record. */
function readZip(zip) {
	const end = zip.length - 22;
	assert.equal(zip.readUInt32LE(end), 0x06054b50, 'end record signature');
	const count = zip.readUInt16LE(end + 10);
	let cursor = zip.readUInt32LE(end + 16);
	const entries = [];
	for (let index = 0; index < count; index += 1) {
		assert.equal(zip.readUInt32LE(cursor), 0x02014b50, 'central header signature');
		assert.equal(zip.readUInt16LE(cursor + 8), 0x800, 'UTF-8 flag');
		assert.equal(zip.readUInt16LE(cursor + 10), 0, 'method: store');
		assert.equal(zip.readUInt16LE(cursor + 14), DOS_DATE);
		const entry = { crc: zip.readUInt32LE(cursor + 16), size: zip.readUInt32LE(cursor + 24), offset: zip.readUInt32LE(cursor + 42) };
		const nameLength = zip.readUInt16LE(cursor + 28);
		entry.name = zip.toString('utf8', cursor + 46, cursor + 46 + nameLength);
		cursor += 46 + nameLength;
		assert.equal(zip.readUInt32LE(entry.offset), 0x04034b50, 'local header signature');
		const start = entry.offset + 30 + zip.readUInt16LE(entry.offset + 26);
		entry.bytes = zip.subarray(start, start + entry.size);
		entry.localCrc = zip.readUInt32LE(entry.offset + 14);
		entries.push(entry);
	}
	return entries;
}

/** Bit-by-bit CRC-32, the same polynomial zipWriter.ts builds its table from. */
function referenceCrc(bytes) {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

describe('bridge-zip', () => {
	it('has zlib.crc32 (Node 22.2+) and says so', () => {
		assert.equal(typeof zlib.crc32, 'function');
		assert.equal(zipAvailable, true);
	});

	it('round-trips an empty file, a 70,000-byte file and a UTF-8 name', () => {
		const big = Buffer.alloc(70_000, 'ab');
		const files = [
			{ name: 'empty.json', bytes: Buffer.alloc(0) },
			{ name: 'big.csv', bytes: big },
			{ name: 'café-日本.json', bytes: Buffer.from('{"a":1}') },
		];
		const entries = readZip(buildZip(files));
		assert.deepEqual(entries.map((entry) => entry.name), files.map((file) => file.name));
		entries.forEach((entry, index) => {
			assert.deepEqual(entry.bytes, files[index].bytes);
			assert.equal(entry.crc, referenceCrc(files[index].bytes));
			assert.equal(entry.localCrc, entry.crc);
		});
	});

	it('is deterministic', () => {
		const files = [{ name: 'a.json', bytes: Buffer.from('x') }];
		assert.deepEqual(buildZip(files), buildZip(files));
	});

	const refused = [
		['empty', ''],
		['absolute', '/etc/passwd'],
		['drive letter', 'C:evil.json'],
		['parent segment', '../escape.json'],
		['embedded parent', 'a/../b.json'],
		['backslash', 'a\\b.json'],
		['NUL', 'a\u0000b.json'],
		['control byte', 'a\nb.json'],
		['over 255 bytes', `${'x'.repeat(ZIP_ENTRY_NAME_MAX)}.json`],
		['non-string', 42],
	];
	for (const [label, name] of refused) {
		it(`refuses an entry name that is ${label}`, () => {
			assert.throws(() => buildZip([{ name, bytes: Buffer.alloc(0) }]), { code: 'zip_bad_entry_name' });
		});
	}

	it('accepts a name of exactly 255 bytes and refuses a repeated name', () => {
		const name = 'x'.repeat(ZIP_ENTRY_NAME_MAX);
		assert.equal(readZip(buildZip([{ name, bytes: Buffer.alloc(1) }]))[0].name, name);
		assert.throws(() => buildZip([{ name: 'a', bytes: Buffer.alloc(0) }, { name: 'a', bytes: Buffer.alloc(0) }]), { code: 'zip_bad_entry_name' });
	});

	it('fails closed without a checksum function', () => {
		assert.throws(() => buildZip([{ name: 'a', bytes: Buffer.alloc(0) }], { crc32: null }), { code: 'zip_unavailable' });
	});
});
