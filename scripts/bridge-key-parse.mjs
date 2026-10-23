/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-key-parse.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The validator of the public keys a person pastes into Settings. Pure: Buffer and
 * node:crypto only, no I/O, so the sandbox plane can re-run it on what the client relays.
 *
 * It reads hostile text, so the rules are refusals first:
 *   - private material (PEM/OpenSSH/PGP private blocks, PGP secret packets 5 and 7 anywhere
 *     in the stream) answers private_key_refused with one fixed message and never quotes the
 *     input;
 *   - an ssh line is exactly `<type> <base64> [comment]`: no second line, no control
 *     character, no options. The comment is dropped and the line the caller stores is REBUILT
 *     as `type + " " + base64(blob)`, so nothing the person typed survives into a file;
 *   - a PGP block is rebuilt from its decoded packets too (armor headers and comments are
 *     dropped).
 * Every error is `{status: 400, code}` with a fixed message.
 *
 * Caveat: the ssh check is structural (type string, lengths, bit size). It does not prove an
 * ecdsa point is on the curve nor that an RSA modulus is not a prime square.
 * Caveat: the PGP walk validates framing and takes the fingerprint of the primary key only.
 * It refuses secret packets anywhere and any packet type a public block does not hold, but it
 * checks neither self-signatures nor revocations, so a revoked key is accepted. A block that
 * carries no CRC-24 line is accepted (RFC 4880 makes the line optional); a present one must
 * match.
 */

import { createHash } from 'node:crypto';

const MAX_INPUT_BYTES = 16384;
const MAX_PACKETS = 256;
const MIN_RSA_BITS = 3072;
const PRIVATE_MESSAGE = 'Private keys are never accepted. Paste the public key only.';
// The base64 of the `openssh-key-v1` magic, for a private key pasted without its armor.
const OPENSSH_MAGIC_BASE64 = Buffer.from('openssh-key-v1').toString('base64').slice(0, 18);
const PRIVATE_MARKERS = ['PRIVATE KEY', 'PGP PRIVATE', 'openssh-key-v1', OPENSSH_MAGIC_BASE64];
const BAD_CHARACTERS = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const PLAIN_TYPE = /^[a-z0-9-]+(?:@openssh\.com)?$/;
const CURVES = { 'ecdsa-sha2-nistp256': ['nistp256', 65], 'ecdsa-sha2-nistp384': ['nistp384', 97], 'ecdsa-sha2-nistp521': ['nistp521', 133] };
const SSH_TYPES = new Set(['ssh-ed25519', 'ssh-rsa', 'sk-ssh-ed25519@openssh.com', ...Object.keys(CURVES)]);
const PGP_ALGORITHMS = { 1: 'rsa', 2: 'rsa', 3: 'rsa', 16: 'elgamal', 17: 'dsa', 18: 'ecdh', 19: 'ecdsa', 22: 'eddsa' };
// Public key, subkey, user id, user attribute, signature: all a public block holds.
const PUBLIC_TAGS = new Set([2, 6, 13, 14, 17]);
const SECRET_TAGS = new Set([5, 7]);
const ARMOR_BEGIN = '-----BEGIN PGP PUBLIC KEY BLOCK-----';
const ARMOR_END = '-----END PGP PUBLIC KEY BLOCK-----';

function keyError(code, message) {
	return Object.assign(new Error(message), { status: 400, code });
}

const invalid = (message) => keyError('key_invalid', message);

function checkedText(value) {
	if (typeof value !== 'string' || value === '') throw invalid('The key is empty.');
	if (PRIVATE_MARKERS.some((marker) => value.includes(marker))) throw keyError('private_key_refused', PRIVATE_MESSAGE);
	if (Buffer.byteLength(value) > MAX_INPUT_BYTES) throw invalid('The key is too large.');
	return value;
}

/** Reads length-prefixed fields of an ssh blob; every overrun is an invalid key. */
function blobReader(blob) {
	let at = 0;
	const take = (size) => {
		if (size > blob.length - at) throw invalid('The key blob is truncated.');
		const slice = blob.subarray(at, at + size);
		at += size;
		return slice;
	};
	return {
		string: () => take(take(4).readUInt32BE(0)),
		done: () => {
			if (at !== blob.length) throw invalid('The key blob has trailing bytes.');
		},
	};
}

/** The bit length of an mpint: leading zero byte stripped, a set high bit alone is negative. */
function mpintBits(bytes) {
	if (bytes.length > 0 && bytes[0] & 0x80) throw invalid('The RSA modulus is negative.');
	let start = 0;
	while (start < bytes.length && bytes[start] === 0) start += 1;
	if (start === bytes.length) return 0;
	return (bytes.length - start - 1) * 8 + (32 - Math.clz32(bytes[start]));
}

/** Checks the body of a blob for its type and returns the bit size where the type has one. */
function checkSshBody(type, reader) {
	if (type === 'ssh-ed25519' || type === 'sk-ssh-ed25519@openssh.com') {
		if (reader.string().length !== 32) throw invalid('An ed25519 key is 32 bytes.');
		if (type !== 'ssh-ed25519') reader.string();
		return undefined;
	}
	if (type === 'ssh-rsa') {
		if (reader.string().length === 0) throw invalid('The RSA exponent is empty.');
		const bits = mpintBits(reader.string());
		if (bits < MIN_RSA_BITS) throw keyError('key_weak', `An RSA key needs at least ${MIN_RSA_BITS} bits.`);
		return bits;
	}
	const [curve, pointSize] = CURVES[type];
	if (reader.string().toString('latin1') !== curve) throw invalid('The curve does not match the key type.');
	const point = reader.string();
	if (point.length !== pointSize || point[0] !== 4) throw invalid('The ecdsa point is malformed.');
	return Number(curve.slice(-3));
}

/** Splits one ssh line into its type and base64, refusing anything that is not a bare key line. */
function sshFields(value) {
	const text = checkedText(value).replace(/\r?\n$/, '');
	if (BAD_CHARACTERS.test(text)) throw invalid('The key must be one line of plain text.');
	const [type, encoded] = text.split(/ +/);
	if (!SSH_TYPES.has(type)) {
		throw PLAIN_TYPE.test(type ?? '') ? keyError('key_unsupported', 'This key type is not supported.') : invalid('The key must start with its type.');
	}
	// The round trip rejects non-canonical padding and trailing garbage inside the base64.
	if (!BASE64.test(encoded ?? '') || Buffer.from(encoded, 'base64').toString('base64') !== encoded) throw invalid('The key data is not valid base64.');
	return { type, blob: Buffer.from(encoded, 'base64') };
}

/** {type, blob, fingerprint, bits?, line} for one `<type> <base64> [comment]` line. */
export function parseSshPublicKey(value) {
	const { type, blob } = sshFields(value);
	const reader = blobReader(blob);
	if (reader.string().toString('latin1') !== type) throw invalid('The key type does not match its data.');
	const bits = checkSshBody(type, reader);
	reader.done();
	const fingerprint = `SHA256:${createHash('sha256').update(blob).digest('base64').replace(/=+$/, '')}`;
	const parsed = { type, blob, fingerprint, line: `${type} ${blob.toString('base64')}` };
	return bits === undefined ? parsed : { ...parsed, bits };
}

function crc24(bytes) {
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

/** The decoded bytes of the one armored public block, its CRC checked when it has one. */
function dearmor(value) {
	const text = checkedText(value);
	if (BAD_CHARACTERS.test(text.replace(/[\r\n]/g, ''))) throw invalid('The key must be plain text.');
	const lines = text.split(/\r?\n/);
	while (lines.at(-1) === '') lines.pop();
	if (lines[0] !== ARMOR_BEGIN || lines.at(-1) !== ARMOR_END) throw invalid('Paste one PGP PUBLIC KEY BLOCK.');
	const inner = lines.slice(1, -1);
	const blank = inner.indexOf('');
	const body = blank === -1 ? inner : inner.slice(blank + 1);
	const crcLine = body.length > 0 && body.at(-1).startsWith('=') ? body.pop() : null;
	const encoded = body.join('');
	if (encoded === '' || !BASE64.test(encoded) || Buffer.from(encoded, 'base64').toString('base64') !== encoded) throw invalid('The key data is not valid base64.');
	const bytes = Buffer.from(encoded, 'base64');
	if (crcLine !== null && Buffer.from(crcLine.slice(1), 'base64').readUIntBE(0, 3) !== crc24(bytes)) throw invalid('The key checksum does not match.');
	return bytes;
}

/** The next packet as {tag, body, end}; the tag is read before the length is judged. */
function nextPacket(bytes, at) {
	const head = bytes[at];
	if (!(head & 0x80)) throw invalid('The key data is not a PGP packet stream.');
	let tag;
	let size;
	let start = at + 1;
	if (head & 0x40) {
		tag = head & 0x3f;
		const first = bytes[start];
		if (first === undefined) throw invalid('The key packet is truncated.');
		if (first < 192) [size, start] = [first, start + 1];
		else if (first < 224) [size, start] = [((first - 192) << 8) + (bytes[start + 1] ?? 0) + 192, start + 2];
		else if (first === 255) [size, start] = [bytes.readUInt32BE(start + 1), start + 5];
		else return { tag, partial: true };
	} else {
		tag = (head >> 2) & 0x0f;
		const lengthType = head & 3;
		if (lengthType === 3) return { tag, partial: true };
		const width = [1, 2, 4][lengthType];
		if (start + width > bytes.length) throw invalid('The key packet is truncated.');
		[size, start] = [bytes.readUIntBE(start, width), start + width];
	}
	if (start + size > bytes.length) throw invalid('The key packet runs past the end.');
	return { tag, body: bytes.subarray(start, start + size), end: start + size };
}

/** Walks EVERY top-level packet: a secret packet after a valid primary key is still refused. */
function walkPackets(bytes) {
	const packets = [];
	let at = 0;
	while (at < bytes.length) {
		if (packets.length >= MAX_PACKETS) throw invalid('The key has too many packets.');
		const packet = nextPacket(bytes, at);
		if (SECRET_TAGS.has(packet.tag)) throw keyError('private_key_refused', PRIVATE_MESSAGE);
		if (!PUBLIC_TAGS.has(packet.tag) || packet.partial) throw invalid('The key holds a packet a public key never has.');
		packets.push(packet);
		at = packet.end;
	}
	return packets;
}

function primaryOf(packets) {
	if (packets.length === 0 || packets[0].tag !== 6) throw invalid('The block must start with a public key.');
	if (packets.filter((packet) => packet.tag === 6).length !== 1) throw invalid('Paste one key per block.');
	const body = packets[0].body;
	if (body[0] !== 4) throw keyError('key_unsupported', 'Only version 4 PGP keys are supported.');
	const algorithm = PGP_ALGORITHMS[body[5]];
	if (!algorithm) throw keyError('key_unsupported', 'This PGP key algorithm is not supported.');
	return { body, algorithm };
}

function armorOf(bytes) {
	const crc = Buffer.from([crc24(bytes) >> 16, (crc24(bytes) >> 8) & 0xff, crc24(bytes) & 0xff]);
	const lines = bytes.toString('base64').match(/.{1,64}/g);
	return [ARMOR_BEGIN, '', ...lines, `=${crc.toString('base64')}`, ARMOR_END, ''].join('\n');
}

/** {fingerprint, algorithm, armor} for one armored PGP public key block (v4 only). */
export function parseGpgPublicKey(value) {
	const bytes = dearmor(value);
	const { body, algorithm } = primaryOf(walkPackets(bytes));
	const header = Buffer.from([0x99, body.length >> 8, body.length & 0xff]);
	// Not a security hash: a v4 fingerprint is SHA-1 by definition (RFC 4880 section 12.2) and only names the key.
	const fingerprint = createHash('sha1').update(header).update(body).digest('hex').toUpperCase(); // NOSONAR
	return { fingerprint, algorithm, armor: armorOf(bytes) };
}

/** The common shape the routes store: {kind, keyType, fingerprint, publicKey}. */
export function parsePublicKey(kind, value) {
	if (kind === 'ssh') {
		const { type, fingerprint, line } = parseSshPublicKey(value);
		return { kind, keyType: type, fingerprint, publicKey: line };
	}
	if (kind === 'gpg') {
		const { algorithm, fingerprint, armor } = parseGpgPublicKey(value);
		return { kind, keyType: algorithm, fingerprint, publicKey: armor };
	}
	throw invalid('The key kind must be ssh or gpg.');
}
