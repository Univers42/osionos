/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-key-parse.test.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The public-key validator, the part of the account plane that reads hostile text. Every
 * refusal rule has its own case, and the two rules a person cannot hand-pick enough
 * examples for (private material anywhere in a PGP stream, injection through the line)
 * are also driven by a seeded generator.
 *
 * The fingerprints are literals copied from ssh-keygen and gpg (tests/bridge/support/
 * key-fixtures.mjs), never computed by the code under test.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseGpgPublicKey, parsePublicKey, parseSshPublicKey } from '../../scripts/bridge-key-parse.mjs';
import {
	GPG_KEYS, SSH_KEYS, armorOf, crc24, dearmor, lineOf, newPacket, oldPacket, packetsOf, sha256Fingerprint, sshBlob, sshLine,
} from './support/key-fixtures.mjs';

const PRIVATE_MESSAGE = 'Private keys are never accepted. Paste the public key only.';

/** A seeded generator, so a failing generated case replays. */
function seeded(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
		mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
}

const pick = (random, list) => list[Math.floor(random() * list.length)];

/** Asserts a 400 with the code, and that the message quotes nothing the caller sent. */
function refused(run, code, submitted = '') {
	assert.throws(run, (error) => {
		assert.equal(error.status, 400);
		assert.equal(error.code, code);
		for (const token of String(submitted).split(/\s+/).filter((word) => word.length >= 8)) {
			assert.ok(!error.message.includes(token), 'the message must not echo the submitted text');
		}
		return true;
	});
}

const mpint = (bytes) => (bytes[0] & 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes);
const rsaLine = (modulus) => lineOf('ssh-rsa', Buffer.from([1, 0, 1]), mpint(modulus));
const rebuild = (packets) => Buffer.concat(packets.map((packet) => newPacket(packet.tag, packet.body)));
const gpgText = (bytes) => armorOf(bytes);
const ed = SSH_KEYS.ed25519;

describe('parseSshPublicKey accepts what ssh-keygen writes', () => {
	for (const [name, key] of Object.entries(SSH_KEYS).filter(([name]) => name !== 'rsa2048')) {
		it(`reads the ${name} fixture: literal fingerprint, rebuilt line, no comment`, () => {
			const parsed = parseSshPublicKey(sshLine(key));
			assert.equal(parsed.type, key.type);
			assert.equal(parsed.fingerprint, key.fingerprint);
			assert.equal(parsed.line, `${key.type} ${key.blob}`);
			assert.ok(!parsed.line.includes(key.comment));
			assert.equal(parsed.blob.toString('base64'), key.blob);
			if (key.bits) assert.equal(parsed.bits, key.bits);
		});
	}

	it('accepts a line without a comment and one with a trailing newline', () => {
		assert.equal(parseSshPublicKey(sshLine(ed, '')).fingerprint, ed.fingerprint);
		assert.equal(parseSshPublicKey(`${sshLine(ed)}\n`).fingerprint, ed.fingerprint);
	});

	it('accepts a security-key ed25519 blob and fingerprints the decoded blob', () => {
		const blob = sshBlob('sk-ssh-ed25519@openssh.com', Buffer.alloc(32, 7), 'ssh:');
		const parsed = parseSshPublicKey(`sk-ssh-ed25519@openssh.com ${blob.toString('base64')} yubikey`);
		assert.equal(parsed.fingerprint, sha256Fingerprint(blob));
	});

	it('keeps no comment text in the rebuilt line, for any generated comment', () => {
		const random = seeded(11);
		const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@._- ';
		for (let round = 0; round < 200; round += 1) {
			const comment = Array.from({ length: 1 + Math.floor(random() * 40) }, () => pick(random, alphabet)).join('').trim() || 'x';
			const parsed = parseSshPublicKey(`${ed.type} ${ed.blob} ${comment}`);
			assert.equal(parsed.line, `${ed.type} ${ed.blob}`);
		}
	});
});

describe('parseSshPublicKey refuses weak, malformed and mismatched keys', () => {
	const edBlob = Buffer.from(ed.blob, 'base64');
	const cases = [
		['a 2048-bit RSA key is weak', sshLine(SSH_KEYS.rsa2048), 'key_weak'],
		['a 1024-bit RSA key is weak', rsaLine(Buffer.alloc(128, 0xff)), 'key_weak'],
		['a 3071-bit RSA key is weak', rsaLine(Buffer.concat([Buffer.from([0x7f]), Buffer.alloc(383, 0xff)])), 'key_weak'],
		['an RSA modulus of zero is weak', rsaLine(Buffer.alloc(1, 0)), 'key_weak'],
		['a negative RSA modulus is malformed', lineOf('ssh-rsa', Buffer.from([1, 0, 1]), Buffer.alloc(384, 0xff)), 'key_invalid'],
		['an embedded type that differs from the declared one', `ssh-ed25519 ${SSH_KEYS.rsa3072.blob}`, 'key_invalid'],
		['an ecdsa type whose blob names another curve', `ecdsa-sha2-nistp384 ${SSH_KEYS.ecdsa256.blob}`, 'key_invalid'],
		['an ecdsa blob whose curve name differs from its type string', lineOf('ecdsa-sha2-nistp256', 'nistp384', Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)])), 'key_invalid'],
		['an ecdsa point of the wrong length', lineOf('ecdsa-sha2-nistp256', 'nistp256', Buffer.concat([Buffer.from([4]), Buffer.alloc(63, 1)])), 'key_invalid'],
		['a compressed ecdsa point', lineOf('ecdsa-sha2-nistp256', 'nistp256', Buffer.concat([Buffer.from([2]), Buffer.alloc(64, 1)])), 'key_invalid'],
		['an ed25519 key of 31 bytes', lineOf('ssh-ed25519', Buffer.alloc(31, 1)), 'key_invalid'],
		['an ed25519 key of 33 bytes', lineOf('ssh-ed25519', Buffer.alloc(33, 1)), 'key_invalid'],
		['an ed25519 blob with trailing bytes', `ssh-ed25519 ${Buffer.concat([edBlob, Buffer.from([0])]).toString('base64')}`, 'key_invalid'],
		['truncated base64', `ssh-ed25519 ${ed.blob.slice(0, -6)}`, 'key_invalid'],
		['base64 with a character outside the alphabet', `ssh-ed25519 ${ed.blob.slice(0, -4)}!!!!`, 'key_invalid'],
		['a blob that is only a type string', `ssh-ed25519 ${sshBlob('ssh-ed25519').toString('base64')}`, 'key_invalid'],
		['a missing blob', 'ssh-ed25519', 'key_invalid'],
		['an empty string', '', 'key_invalid'],
		['only spaces', '   ', 'key_invalid'],
		['a DSA key', 'ssh-dss AAAAB3NzaC1kc3MAAAA= comment', 'key_unsupported'],
		['an input over 16 KiB', `ssh-ed25519 ${ed.blob} ${'a'.repeat(16384)}`, 'key_invalid'],
	];

	for (const [name, text, code] of cases) {
		it(`refuses ${name} with ${code}`, () => refused(() => parseSshPublicKey(text), code, text));
	}

	it('accepts the 3072-bit boundary and a larger key', () => {
		assert.equal(parseSshPublicKey(rsaLine(Buffer.alloc(384, 0xff))).bits, 3072);
		assert.equal(parseSshPublicKey(rsaLine(Buffer.alloc(512, 0xff))).bits, 4096);
	});

	for (const value of [undefined, null, 42, {}, ['ssh-ed25519']]) {
		it(`refuses a ${typeof value} input`, () => refused(() => parseSshPublicKey(value), 'key_invalid'));
	}
});

describe('parseSshPublicKey refuses anything that could add a line or an option', () => {
	const evilKey = `${ed.type} ${ed.blob}`;
	const injections = [
		['a second line behind a comment', `${evilKey} evil\ncommand="x" ${evilKey}`],
		['a second key on a second line', `${evilKey}\n${evilKey}`],
		['an options-looking first token', `command=ssh-ed25519 ${ed.blob}`],
		['a from option with quotes', `from="10.0.0.1" ${evilKey}`],
		['an options prefix before a valid key', `no-pty,command="x" ${evilKey}`],
		['a bare quote as first token', `" ${evilKey}`],
	];
	for (const [name, text] of injections) {
		it(`refuses ${name}`, () => refused(() => parseSshPublicKey(text), 'key_invalid', text));
	}

	const separators = { CR: '\r', LF: '\n', NUL: '\u0000', 'U+2028': '\u2028', 'U+2029': '\u2029', 'U+0085': '\u0085', TAB: '\t', DEL: '\u007f' };
	for (const [name, character] of Object.entries(separators)) {
		it(`refuses ${name} inside the comment`, () => refused(() => parseSshPublicKey(`${evilKey} a${character}b`), 'key_invalid'));
		it(`refuses ${name} between the fields`, () => refused(() => parseSshPublicKey(`${ed.type}${character}${ed.blob}`), 'key_invalid'));
	}

	it('refuses every generated combination of a separator, a payload and a position', () => {
		const random = seeded(23);
		const payloads = ['command="touch /tmp/x"', 'from="*"', 'ssh-rsa AAAAB3NzaC1yc2E', evilKey, 'permitopen="*:*"', 'environment="A=b"'];
		const breakers = Object.values(separators).filter((value) => value !== '\t');
		for (let round = 0; round < 300; round += 1) {
			const breaker = pick(random, breakers);
			const payload = pick(random, payloads);
			const text = pick(random, [
				`${evilKey} c${breaker}${payload}`,
				`${payload}${breaker}${evilKey}`,
				`${ed.type}${breaker}${payload}${breaker}${ed.blob}`,
				`${evilKey}${breaker}${breaker}${payload}`,
			]);
			assert.throws(() => parseSshPublicKey(text), (error) => error.status === 400 && error.code === 'key_invalid', JSON.stringify(text));
		}
	});
});

describe('private material is refused in the ssh path', () => {
	const openssh = Buffer.concat([Buffer.from('openssh-key-v1\0'), Buffer.alloc(40, 3)]).toString('base64');
	const samples = [
		['an OpenSSH private key', `-----BEGIN OPENSSH PRIVATE KEY-----\n${openssh}\n-----END OPENSSH PRIVATE KEY-----`],
		['an RSA private key', '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAxxxxxxxxxxxxxxxxxxxxxxxxx\n-----END RSA PRIVATE KEY-----'],
		['a PKCS8 private key', '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----'],
		['an openssh-key-v1 header without armor', `openssh-key-v1 ${openssh}`],
		['the base64 of an openssh-key-v1 body alone', openssh],
		['a private key hiding behind a public type', `ssh-ed25519 ${openssh}`],
		['a PGP private block', '-----BEGIN PGP PRIVATE KEY BLOCK-----\n\nlQdGBF\n-----END PGP PRIVATE KEY BLOCK-----'],
	];
	for (const [name, text] of samples) {
		it(`refuses ${name} with the fixed message`, () => {
			assert.throws(() => parseSshPublicKey(text), (error) => {
				assert.equal(error.status, 400);
				assert.equal(error.code, 'private_key_refused');
				assert.equal(error.message, PRIVATE_MESSAGE);
				return true;
			});
		});
	}

	it('keeps PRIVATE KEY in a comment case-sensitive: a lower-case comment is only a comment', () => {
		assert.equal(parseSshPublicKey(`${ed.type} ${ed.blob} my private key`).fingerprint, ed.fingerprint);
	});
});

describe('parseGpgPublicKey accepts what gpg exports', () => {
	for (const [name, key] of Object.entries(GPG_KEYS)) {
		it(`reads the ${name} fixture: literal fingerprint, algorithm, rebuilt armor`, () => {
			const parsed = parseGpgPublicKey(key.armor);
			assert.equal(parsed.fingerprint, key.fingerprint);
			assert.equal(parsed.algorithm, key.algorithm);
			assert.deepEqual(dearmor(parsed.armor), dearmor(key.armor));
			assert.equal(parsed.armor.split('\n')[1], '');
		});
	}

	it('drops armor header lines and accepts CRLF line endings', () => {
		const text = armorOf(dearmor(GPG_KEYS.ed25519.armor), { headers: ['Comment: evil\\nkey'] }).replace(/\n/g, '\r\n');
		const parsed = parseGpgPublicKey(text);
		assert.equal(parsed.fingerprint, GPG_KEYS.ed25519.fingerprint);
		assert.ok(!parsed.armor.includes('Comment'));
		assert.ok(!parsed.armor.includes('\r'));
	});
});

describe('parseGpgPublicKey checks the armor and the framing', () => {
	const bytes = dearmor(GPG_KEYS.ed25519.armor);
	const packets = packetsOf(bytes);
	const cases = [
		['a wrong CRC-24', armorOf(bytes, { crc: crc24(bytes) ^ 1 }), 'key_invalid'],
		['a CRC of another key', armorOf(bytes, { crc: crc24(dearmor(GPG_KEYS.rsa3072.armor)) }), 'key_invalid'],
		['a v5 primary key', gpgText(rebuild([{ ...packets[0], body: Buffer.concat([Buffer.from([5]), packets[0].body.subarray(1)]) }, ...packets.slice(1)])), 'key_unsupported'],
		['a v6 primary key', gpgText(rebuild([{ ...packets[0], body: Buffer.concat([Buffer.from([6]), packets[0].body.subarray(1)]) }, ...packets.slice(1)])), 'key_unsupported'],
		['a v3 primary key', gpgText(rebuild([{ ...packets[0], body: Buffer.concat([Buffer.from([3]), packets[0].body.subarray(1)]) }, ...packets.slice(1)])), 'key_unsupported'],
		['a stream that does not start with a public key', gpgText(rebuild([packets[1], packets[0]])), 'key_invalid'],
		['two primary keys', gpgText(Buffer.concat([bytes, rebuild([packets[0]])])), 'key_invalid'],
		['a packet that runs past the end', gpgText(bytes.subarray(0, bytes.length - 3)), 'key_invalid'],
		['a packet type a public block never holds', gpgText(Buffer.concat([bytes, newPacket(1, Buffer.alloc(10))])), 'key_invalid'],
		['an experimental packet tag', gpgText(Buffer.concat([bytes, newPacket(60, Buffer.alloc(10))])), 'key_invalid'],
		['a partial body length on a user id', gpgText(Buffer.concat([bytes, Buffer.from([0xcd, 0xe0]), Buffer.alloc(1 << 0, 0)])), 'key_invalid'],
		['an old indeterminate length on a user id', gpgText(Buffer.concat([bytes, Buffer.from([0xb7]), Buffer.alloc(8, 1)])), 'key_invalid'],
		['more packets than the cap', gpgText(Buffer.concat([bytes, ...Array.from({ length: 300 }, () => newPacket(13, Buffer.from('x')))])), 'key_invalid'],
		['no armor at all', 'hello', 'key_invalid'],
		['another armor type', GPG_KEYS.ed25519.armor.replaceAll('PUBLIC KEY BLOCK', 'MESSAGE'), 'key_invalid'],
		['a missing end line', GPG_KEYS.ed25519.armor.replace(/-----END[^\n]*\n/, ''), 'key_invalid'],
		['text behind the end line', `${GPG_KEYS.ed25519.armor}trailing`, 'key_invalid'],
		['two armored blocks', GPG_KEYS.ed25519.armor + GPG_KEYS.ed25519.armor, 'key_invalid'],
		['base64 that is not base64', GPG_KEYS.ed25519.armor.replace('mDMEatvF', 'mDM!atvF'), 'key_invalid'],
		['an empty body', armorOf(Buffer.alloc(0)), 'key_invalid'],
		['a NUL byte', GPG_KEYS.ed25519.armor.replace('mDMEatvF', 'mDMEat\u0000F'), 'key_invalid'],
		['U+2028', GPG_KEYS.ed25519.armor.replace('mDMEatvF', 'mDMEat\u2028F'), 'key_invalid'],
		['an input over 16 KiB', `${GPG_KEYS.ed25519.armor}${' '.repeat(16384)}`, 'key_invalid'],
	];
	for (const [name, text, code] of cases) {
		it(`refuses ${name} with ${code}`, () => refused(() => parseGpgPublicKey(text), code));
	}

	it('refuses an algorithm it cannot name', () => {
		const odd = { ...packets[0], body: Buffer.concat([packets[0].body.subarray(0, 5), Buffer.from([99]), packets[0].body.subarray(6)]) };
		refused(() => parseGpgPublicKey(gpgText(rebuild([odd, ...packets.slice(1)]))), 'key_unsupported');
	});
});

describe('parseGpgPublicKey refuses a secret packet anywhere in the stream', () => {
	const bytes = dearmor(GPG_KEYS.rsa3072.armor);
	const packets = packetsOf(bytes);
	const encoders = {
		'new, one octet': (tag, body) => newPacket(tag, body),
		'old, one octet': (tag, body) => oldPacket(tag, body, 0),
		'old, two octets': (tag, body) => oldPacket(tag, body, 1),
		'old, four octets': (tag, body) => oldPacket(tag, body, 2),
	};
	const inserted = (position, packet) => Buffer.concat([rebuild(packets.slice(0, position)), packet, rebuild(packets.slice(position))]);

	it('refuses tag 5 and tag 7 at every position, in every length format', () => {
		const random = seeded(5);
		let checked = 0;
		for (const tag of [5, 7]) {
			for (const [format, encode] of Object.entries(encoders)) {
				for (let position = 0; position <= packets.length; position += 1) {
					const size = format === 'new, one octet' || format === 'old, one octet' ? 1 + Math.floor(random() * 120) : pick(random, [1, 60, 200, 300, 1000]);
					const secret = encode(tag, Buffer.from(Array.from({ length: size }, () => Math.floor(random() * 256))));
					assert.throws(() => parseGpgPublicKey(gpgText(inserted(position, secret))), (error) => {
						assert.equal(error.status, 400, `${format} tag ${tag} at ${position}`);
						assert.equal(error.code, 'private_key_refused', `${format} tag ${tag} at ${position}`);
						assert.equal(error.message, PRIVATE_MESSAGE);
						return true;
					});
					checked += 1;
				}
			}
		}
		assert.ok(checked >= 8 * packets.length);
	});

	it('refuses a secret packet whose own body is empty or random garbage', () => {
		for (const body of [Buffer.alloc(0), Buffer.from([4, 0, 0, 0, 0, 1])]) {
			refused(() => parseGpgPublicKey(gpgText(Buffer.concat([newPacket(5, body), bytes]))), 'private_key_refused');
		}
	});

	it('refuses a secret subkey that follows the whole valid key', () => {
		refused(() => parseGpgPublicKey(gpgText(Buffer.concat([bytes, newPacket(7, Buffer.alloc(40, 9))]))), 'private_key_refused');
	});

	it('names a secret packet before it complains about its length format', () => {
		refused(() => parseGpgPublicKey(gpgText(Buffer.concat([bytes, Buffer.from([0xc5, 0xe1]), Buffer.alloc(4)]))), 'private_key_refused');
		refused(() => parseGpgPublicKey(gpgText(Buffer.concat([bytes, Buffer.from([0x97]), Buffer.alloc(4)]))), 'private_key_refused');
	});

	it('refuses the private armor header, with or without a body', () => {
		refused(() => parseGpgPublicKey('-----BEGIN PGP PRIVATE KEY BLOCK-----\n\nAAAA\n-----END PGP PRIVATE KEY BLOCK-----'), 'private_key_refused');
		refused(() => parseGpgPublicKey(GPG_KEYS.rsa3072.armor.replace('PUBLIC KEY BLOCK', 'PRIVATE KEY BLOCK')), 'private_key_refused');
	});
});

describe('parsePublicKey picks the validator by kind', () => {
	it('returns the stored line and the key type for ssh', () => {
		const parsed = parsePublicKey('ssh', sshLine(ed));
		assert.deepEqual({ ...parsed }, { kind: 'ssh', keyType: ed.type, fingerprint: ed.fingerprint, publicKey: `${ed.type} ${ed.blob}` });
	});

	it('returns the rebuilt armor and the algorithm for gpg', () => {
		const parsed = parsePublicKey('gpg', GPG_KEYS.ed25519.armor);
		assert.equal(parsed.keyType, 'eddsa');
		assert.equal(parsed.fingerprint, GPG_KEYS.ed25519.fingerprint);
		assert.deepEqual(dearmor(parsed.publicKey), dearmor(GPG_KEYS.ed25519.armor));
	});

	it('refuses a kind it does not know, and a key under the wrong kind', () => {
		refused(() => parsePublicKey('pgp', sshLine(ed)), 'key_invalid');
		refused(() => parsePublicKey('ssh', GPG_KEYS.ed25519.armor), 'key_invalid');
		refused(() => parsePublicKey('gpg', sshLine(ed)), 'key_invalid');
	});
});
