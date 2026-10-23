/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   key-fixtures.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Public keys for the key tests. Every fingerprint is a LITERAL copied from the tool that
 * made the key, never computed by the code under test:
 *   ssh: ssh-keygen -t <type> -N "" -C <comment> -f k && ssh-keygen -lf k.pub
 *   gpg: gpg --batch --passphrase '' --quick-gen-key "<uid>" <algo> sign never && gpg --fingerprint
 * The helpers below build hostile variants (a secret subkey, a v5 key, a bad CRC) around them.
 */

import { createHash } from 'node:crypto';

export const SSH_KEYS = {
	ed25519: {
		type: 'ssh-ed25519',
		blob: 'AAAAC3NzaC1lZDI1NTE5AAAAIAwobe0oSPfr04WSLuV76sI21k1p3oU3YCMklDidAMBj',
		comment: 'dev@laptop',
		fingerprint: 'SHA256:/U2MIY8cAROIApCz15XFve/Secqh7Xk2JEJGRlEEHAA',
	},
	rsa3072: {
		type: 'ssh-rsa',
		blob: 'AAAAB3NzaC1yc2EAAAADAQABAAABgQDfH9P9Gh/FBQcrOL+GQlaOsf/HI/ee5Y/mKa+xHFfe5LNBBbMXnYA3vuQIW4ZHiMVNUkH+hI84HHDBA7zQ78JZpyjN0GyGGvXI4CshtVXt/217i2NVkHEUvpc5azLPzSmTGWgoxY0WWqbeV/je84gmNgzh9VEK1mmsv4bsmBGMu8ILjU0y5/q99Q+qKl0gdnmow7FSFA77Ny4kPDjAIYosViW8xlxPWk1bu/8I/SE/rN+bsktJYvTnDn2nBS2mCzZHo15bC6QtAiyhQK5IMFd/N70ZNcMyGjAzfP/nRCxxwpi+U23WvRbnrv3VvadhYHt+z7O0vkCpIugragMz04duuBsZDHTIUQJdEDcAr/nvsadETFxNJ0oPWSSQBkp2W2YlwCkxDhQcvaA4iAE8Ry72+RhiIBhycywB/MLw5GCIkn5jN8q1SmoxbQ8pS+MFzBxwnlwijMLYXZoqXKghgHhoivRDzFY91yC5ny1yE3Kbd1S1usNj+5UorNT70ubToAU=',
		comment: 'rsa3072',
		fingerprint: 'SHA256:pxma/ahUnjUaN7bObzUUG9pKImC53jrMIvXapI+b4tk',
		bits: 3072,
	},
	rsa2048: {
		type: 'ssh-rsa',
		blob: 'AAAAB3NzaC1yc2EAAAADAQABAAABAQCQ9pC3u5KI8ioqV3QfjsOmB/siaexsbO2fWP0y83suzlypZ9G1mRzNNPXeCmKxZZv6iQZ3Co2KtJ5RFv+xcAydS7hIGKmTleZx7EYTIwJWnfFz5sxtdlX4xZtl9vCYXlYmW7t180pyhyDVB6k1lRXKyAMRet8LOagh4DIzxeLtqkthM9nEole/SURxdJG+C3hWo+frKqN66QcVd6jSzaMH5U4p3ionbyQTV6Tkhsq3GO1Amssbz85xwW296J4fAtMJQC3stnrCXKGDf02Q7WCIAnff7bNhKH7W8wj62WnOWiROxvMvSzSZ2cchTrbzhoR7CqJtfRi+f9flAt4Z1DsR',
		comment: 'rsa2048',
		fingerprint: 'SHA256:65LxCvZNvkjEoDcPeVzRRr88OL5FQXJha8wocq277b4',
		bits: 2048,
	},
	ecdsa256: {
		type: 'ecdsa-sha2-nistp256',
		blob: 'AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBNJY7bwFNinEk3+LHVUkIeZDZDdE6KFqNBt3FVcrwLt5dR7fxNk8K9yyLIXqwoD+he0JCWqx9hYIinVoYd3EpTo=',
		comment: 'ec256',
		fingerprint: 'SHA256:JNcNAtrHnXNPA8NzbQyCV05L7VjwK4ln6CEW1rpN+A4',
		bits: 256,
	},
	ecdsa384: {
		type: 'ecdsa-sha2-nistp384',
		blob: 'AAAAE2VjZHNhLXNoYTItbmlzdHAzODQAAAAIbmlzdHAzODQAAABhBK/70FVqlEtnb30RLwUoaugEkiSDB+m1f10p4EtxAIf5EUtpOEBboNs8hWe89epkQOTaXagKVbbF9QPNzo7KXAgXJ8UMPLGxSxSsr5Q4c4/ZXBOyLUhWHGswdTZAsEsjFg==',
		comment: 'ec384',
		fingerprint: 'SHA256:660Wlpjp4nb7CNEmkJRfy2UNzKGHFQWLOJo4wvhdPVE',
		bits: 384,
	},
	ecdsa521: {
		type: 'ecdsa-sha2-nistp521',
		blob: 'AAAAE2VjZHNhLXNoYTItbmlzdHA1MjEAAAAIbmlzdHA1MjEAAACFBABOL0AJgoBiKBIurCj5Mp2bntZyn5lTpsc9O6ebq0yJ3KPBX+F7Sd903z6U/L2ZzQnU5fugW1Bx14zyyaqIMnBOhAAx21hfWTX8kZEE+PyIbBu/8l/I2281TMGyxPLGoZEEjdT+lZLccwblGwbE+26K4cjta/Y8qfwx4Dd8tEmEE3fDdg==',
		comment: 'ec521',
		fingerprint: 'SHA256:LXdy3CCLS/WywHissTOZX2U8iWkHtZUjVJ2p8/Ilf2Q',
		bits: 521,
	},
};

export const sshLine = (key, comment = key.comment) => `${key.type} ${key.blob}${comment ? ` ${comment}` : ''}`;

export const GPG_KEYS = {
	ed25519: {
		fingerprint: '472376FF48AC99F3D381891C800C9173364B73B7',
		algorithm: 'eddsa',
		armor: `-----BEGIN PGP PUBLIC KEY BLOCK-----

mDMEatvF4RYJKwYBBAHaRw8BAQdAQJXtp+9ZPomJ68OcHRvVlggJb6lKPD4EzD6V
SVzuDZu0HEZpeHR1cmUgRWQgPGVkQGV4YW1wbGUudGVzdD6IkwQTFgoAOxYhBEcj
dv9IrJnz04GJHIAMkXM2S3O3BQJq28XhAhsDBQsJCAcCAiICBhUKCQgLAgQWAgMB
Ah4HAheAAAoJEIAMkXM2S3O3vyMBAPJQSnsGH3DXLCz6+1gill19yH0Isiy98OPX
4KH67oxXAQCITHwexaMqJyx6pDrBQKtW4eDh0UFJjQRnMs2cV5ZNBA==
=Ophe
-----END PGP PUBLIC KEY BLOCK-----
`,
	},
	rsa3072: {
		fingerprint: 'FB39CABA45325499E04B34DE4C8AE1D266EA3397',
		algorithm: 'rsa',
		armor: `-----BEGIN PGP PUBLIC KEY BLOCK-----

mQGNBGrbxeEBDADIaetxcbMY0MwI+dLvCnbs7zxPWL/cZe3HHFQQpsO9Zin27j7n
6QEPyhMyJXfHM7m4H0evbSB1t46yVD2Z+FIkZsPdq/WXRbCpmFRuPofVML4laJyZ
FxSgnaSOeNyRZufNgpr8byVBONnBiEC8uGnJfkhY2soHPzyAqVADdtEGWduNuz4v
zKnybJrjBwpr81USW/gBl7oRffH/f+NkDfaiFTG51b9B10pclo7YV3LQ610gMzBP
paWbN8yGZN0Jrz9bECsxJmVvMtPSvWFTrZzgWlITJHD7U5+ke8jTcs5ItyXotmk8
1W1o2PyeLF6KHFsR7Y5TVOyVmFG4+9QNduO46SPcP824HoDOkoyJUheHBj4M7F1L
S0zjh520lNuQODpYzFbdYeBBrXv6E6YdVmMKlmWrCzcbGk6Lv5tp+DMy6XCn3iuQ
0TgvnA/PB4MmNvvjWlovZXUuUlwGdw5UAzt7iYkuH1xfAhifGqdq5NNzJGo8+eRD
TVePMvK5FJ1mcVMAEQEAAbQeRml4dHVyZSBSc2EgPHJzYUBleGFtcGxlLnRlc3Q+
iQHRBBMBCgA7FiEE+znKukUyVJngSzTeTIrh0mbqM5cFAmrbxeECGwMFCwkIBwIC
IgIGFQoJCAsCBBYCAwECHgcCF4AACgkQTIrh0mbqM5deeQv+M0uYZZOjrWk2VRSS
r7aWrMoB5tv32IAvu+TEBm8OJyeO1DQRItOtsRJkvAZNZULhf7iAJc4OZ3zrF9I0
gLNHLokUtwGymSO5GzCTPcDzzXQwQdhWblty2XphyzlJ74Uoz/k7AKYB02X4ux19
L29u1Oww5efU7xW+SAYU1m4R/sjrZ12XUom99pmLcs5XE2vDikCM30y3CA0s+CAF
QrXZOy6BU99IS/YzPHTjA8/81hdJfHRzLd4Hbau+XgNZ7Q98lQ06ZG4IOIbZHroC
9FLH8L7Noky957ypGdK3NfBsRV2SHkCNRKuXawfYkwoLuipgrrFSeW1KXF0s03Gl
VQ+f4bxVpiXvT6HBhSkTHiCfDuzBHEWq3F5eI8plENiGUxHKqu7prFRl/a3q0AQL
uv6KG+n8PjLT4mC1W3URAw3PjFa1gj9ra9bQl9C72wxTKx0YbMnkAHpeQ68ZBVwH
rCXtw9jGXxd6tUnGstdPaTbbZA7QtMAdOhuI7kR+/FCPRM7W
=ypRR
-----END PGP PUBLIC KEY BLOCK-----
`,
	},
};

/** ssh wire helpers: a string is a uint32 length and its bytes. */
export function sshString(bytes) {
	const body = Buffer.from(bytes);
	const length = Buffer.alloc(4);
	length.writeUInt32BE(body.length);
	return Buffer.concat([length, body]);
}

export const sshBlob = (...fields) => Buffer.concat(fields.map(sshString));

/** One ssh line from raw blob fields, for the hostile-blob cases. */
export const lineOf = (type, ...fields) => `${type} ${sshBlob(type, ...fields).toString('base64')}`;

export function crc24(bytes) {
	let crc = 0xb704ce;
	for (const byte of bytes) {
		crc ^= byte << 16;
		for (let bit = 0; bit < 8; bit += 1) {
			crc <<= 1;
			if (crc & 0x1000000) crc ^= 0x864cfb;
		}
	}
	return crc & 0xffffff;
}

/** The binary packets behind an armored block. */
export function dearmor(armor) {
	const body = armor.split('\n').filter((line) => line !== '' && !line.startsWith('-----') && !line.startsWith('='));
	return Buffer.from(body.join(''), 'base64');
}

/** An armored block around bytes; `crc` overrides the checksum, `version` leaves a header line. */
export function armorOf(bytes, { crc = crc24(bytes), headers = [] } = {}) {
	const lines = Buffer.from(bytes).toString('base64').match(/.{1,64}/g) ?? [];
	const sum = Buffer.from([crc >> 16, (crc >> 8) & 0xff, crc & 0xff]).toString('base64');
	return ['-----BEGIN PGP PUBLIC KEY BLOCK-----', ...headers, '', ...lines, `=${sum}`, '-----END PGP PUBLIC KEY BLOCK-----', ''].join('\n');
}

/** A new-format packet (RFC 4880 4.2.2) with a one, two or five octet length. */
export function newPacket(tag, body) {
	const size = body.length;
	let length = Buffer.from([size]);
	if (size >= 8384) length = Buffer.from([255, size >> 24, (size >> 16) & 255, (size >> 8) & 255, size & 255]);
	else if (size >= 192) length = Buffer.from([((size - 192) >> 8) + 192, (size - 192) & 255]);
	return Buffer.concat([Buffer.from([0xc0 | tag]), length, body]);
}

/** An old-format packet (4.2.1): lengthType 0 is one octet, 1 two, 2 four. */
export function oldPacket(tag, body, lengthType = 1) {
	const widths = [1, 2, 4];
	const length = Buffer.alloc(widths[lengthType]);
	length.writeUIntBE(body.length, 0, widths[lengthType]);
	return Buffer.concat([Buffer.from([0x80 | (tag << 2) | lengthType]), length, body]);
}

/** The packets of a binary stream as {tag, body}: a test-side walk, new and old formats. */
export function packetsOf(bytes) {
	const packets = [];
	let at = 0;
	while (at < bytes.length) {
		const head = bytes[at];
		let tag = (head >> 2) & 15;
		let size;
		at += 1;
		if (head & 0x40) {
			tag = head & 63;
			const first = bytes[at];
			if (first < 192) { size = first; at += 1; }
			else if (first < 224) { size = ((first - 192) << 8) + bytes[at + 1] + 192; at += 2; }
			else { size = bytes.readUInt32BE(at + 1); at += 5; }
		} else {
			const width = [1, 2, 4][head & 3];
			size = bytes.readUIntBE(at, width);
			at += width;
		}
		packets.push({ tag, body: bytes.subarray(at, at + size) });
		at += size;
	}
	return packets;
}

export const primaryOf = (key) => packetsOf(dearmor(key.armor))[0].body;

export const sha256Fingerprint = (blob) => `SHA256:${createHash('sha256').update(blob).digest('base64').replace(/=+$/, '')}`;
