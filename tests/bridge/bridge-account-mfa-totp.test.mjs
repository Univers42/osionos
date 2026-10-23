/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-mfa-totp.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The TOTP primitive in isolation: RFC 6238 vectors, the window, the replay floor, the
 * secret's encryption at rest. Nothing here starts a server.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';
import { STEP_SECONDS, base32Decode, base32Encode, hotp, matchStep, newSecret, openSecret, otpauthUrl, sealSecret } from '../../scripts/bridge-account-mfa-totp.mjs';
import { MFA_KEY, OTHER_KEY } from './support/mfa-world.mjs';

const RFC_SECRET = Buffer.from('12345678901234567890');
const USER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const ENV = { OSIONOS_MFA_SECRET_KEY: MFA_KEY };
const at = (step) => (step * STEP_SECONDS + 1) * 1000;
const stepOf = (seconds) => Math.floor(seconds / STEP_SECONDS);

describe('two-step verification: the TOTP primitive', () => {
	it('matches the RFC 6238 SHA-1 vectors, truncated to six digits', () => {
		const vectors = [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']];
		for (const [seconds, code] of vectors) assert.equal(hotp(RFC_SECRET, stepOf(seconds)), code, `T=${seconds}`);
	});

	it('accepts the previous, current and next step and refuses two steps either way', () => {
		const step = 1000;
		for (const offset of [-1, 0, 1]) assert.equal(matchStep({ secret: RFC_SECRET, code: hotp(RFC_SECRET, step + offset), nowMs: at(step), lastStep: 0 }), step + offset);
		for (const offset of [-2, 2]) assert.equal(matchStep({ secret: RFC_SECRET, code: hotp(RFC_SECRET, step + offset), nowMs: at(step), lastStep: 0 }), null);
	});

	it('refuses a step at or below the floor, so a code works once', () => {
		const step = 1000;
		const code = hotp(RFC_SECRET, step);
		assert.equal(matchStep({ secret: RFC_SECRET, code, nowMs: at(step), lastStep: step - 1 }), step);
		assert.equal(matchStep({ secret: RFC_SECRET, code, nowMs: at(step), lastStep: step }), null);
		assert.equal(matchStep({ secret: RFC_SECRET, code, nowMs: at(step), lastStep: step + 5 }), null);
	});

	it('refuses anything that is not six digits without comparing it', () => {
		for (const code of ['', '12345', '1234567', '12345a', ' 123456', null, undefined, 123456]) assert.equal(matchStep({ secret: RFC_SECRET, code, nowMs: at(1000), lastStep: 0 }), null, String(code));
	});

	it('round-trips base32 and builds the otpauth URL an authenticator reads', () => {
		const secret = newSecret();
		assert.equal(secret.length, 20);
		assert.deepEqual(base32Decode(base32Encode(secret)), secret);
		assert.equal(base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
		const url = new URL(otpauthUrl({ secret, account: 'ada@example.com', issuer: 'osionos' }));
		assert.equal(url.protocol, 'otpauth:');
		assert.equal(url.hostname, 'totp');
		assert.equal(url.searchParams.get('secret'), base32Encode(secret));
		assert.deepEqual([url.searchParams.get('digits'), url.searchParams.get('period'), url.searchParams.get('algorithm'), url.searchParams.get('issuer')], ['6', '30', 'SHA1', 'osionos']);
	});
});

describe('two-step verification: the secret at rest', () => {
	it('seals as v1.base64(iv12 || tag16 || ciphertext) under AES-256-GCM with the user-bound AAD', () => {
		const sealed = sealSecret(RFC_SECRET, USER, ENV);
		assert.match(sealed, /^v1\.[A-Za-z0-9+/]+=*$/);
		const raw = Buffer.from(sealed.slice(3), 'base64');
		const decipher = createDecipheriv('aes-256-gcm', Buffer.from(MFA_KEY, 'base64'), raw.subarray(0, 12));
		decipher.setAAD(Buffer.from(`osionos-mfa-totp:v1:${USER}`, 'ascii'));
		decipher.setAuthTag(raw.subarray(12, 28));
		assert.deepEqual(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]), RFC_SECRET);
		assert.deepEqual(openSecret(sealed, USER, ENV), RFC_SECRET);
		assert.notEqual(sealSecret(RFC_SECRET, USER, ENV), sealed, 'a fresh iv per seal');
	});

	const sealed = sealSecret(RFC_SECRET, USER, ENV);
	const flipped = (text, index) => { const raw = Buffer.from(text.slice(3), 'base64'); raw[index] ^= 1; return `v1.${raw.toString('base64')}`; };
	const failures = [
		['a row copied to another user (wrong AAD)', () => openSecret(sealed, 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', ENV)],
		['the wrong key', () => openSecret(sealed, USER, { OSIONOS_MFA_SECRET_KEY: OTHER_KEY })],
		['a tampered tag', () => openSecret(flipped(sealed, 14), USER, ENV)],
		['a tampered ciphertext', () => openSecret(flipped(sealed, 30), USER, ENV)],
		['an unknown version', () => openSecret(`v2.${sealed.slice(3)}`, USER, ENV)],
		['a truncated value', () => openSecret('v1.AAAA', USER, ENV)],
		['a 31-byte key', () => sealSecret(RFC_SECRET, USER, { OSIONOS_MFA_SECRET_KEY: Buffer.alloc(31, 1).toString('base64') })],
		['a 33-byte key', () => openSecret(sealed, USER, { OSIONOS_MFA_SECRET_KEY: Buffer.alloc(33, 1).toString('base64') })],
		['no key', () => sealSecret(RFC_SECRET, USER, {})],
	];
	for (const [name, attempt] of failures) {
		it(`fails closed on ${name}`, () => {
			assert.throws(attempt, (error) => error.status === 503 && error.code === 'mfa_unavailable');
		});
	}

	it('opens a row sealed under the previous key and never seals under it', () => {
		const old = sealSecret(RFC_SECRET, USER, { OSIONOS_MFA_SECRET_KEY: OTHER_KEY });
		const rotated = { OSIONOS_MFA_SECRET_KEY: MFA_KEY, OSIONOS_MFA_SECRET_KEY_PREVIOUS: OTHER_KEY };
		assert.deepEqual(openSecret(old, USER, rotated), RFC_SECRET);
		assert.throws(() => openSecret(sealSecret(RFC_SECRET, USER, rotated), USER, { OSIONOS_MFA_SECRET_KEY: OTHER_KEY }), (error) => error.code === 'mfa_unavailable');
		assert.throws(() => openSecret(old, USER, ENV), (error) => error.code === 'mfa_unavailable');
	});
});
