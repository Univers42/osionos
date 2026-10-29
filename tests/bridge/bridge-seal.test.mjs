/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-seal.test.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The seal primitive in isolation, as an email instance: round trip, user binding, key
 * rotation, byte-compatibility with the MFA format, and the caller's own error code.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createSeal } from '../../scripts/bridge-seal.mjs';
import { openSecret, sealSecret } from '../../scripts/bridge-account-mfa-totp.mjs';

const USER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const OTHER_USER = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const KEY = Buffer.alloc(32, 3).toString('base64');
const OLD_KEY = Buffer.alloc(32, 5).toString('base64');
const failWith = () => Object.assign(new Error('unavailable'), { status: 503, code: 'email_unavailable' });
const email = createSeal({ keyEnv: 'OSIONOS_EMAIL_SEAL_KEY', aadLabel: 'osionos-user-email:v1:', fail: failWith });
const ENV = { OSIONOS_EMAIL_SEAL_KEY: KEY };
const PLAIN = Buffer.from('someone@example.com');
const codeOf = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

describe('bridge-seal', () => {
	it('S1 round-trips and uses a fresh iv per seal', () => {
		const sealed = email.seal(PLAIN, USER, ENV);
		assert.ok(sealed.startsWith('v1.'));
		assert.ok(!sealed.includes('@'));
		assert.deepEqual(email.open(sealed, USER, ENV), PLAIN);
		assert.notEqual(email.seal(PLAIN, USER, ENV), sealed);
	});

	it('S2 does not open for another user', () => {
		assert.equal(codeOf(() => email.open(email.seal(PLAIN, USER, ENV), OTHER_USER, ENV)), 'email_unavailable');
	});

	it('S3 opens a value sealed under the previous key, and seals only under the current one', () => {
		const old = email.seal(PLAIN, USER, { OSIONOS_EMAIL_SEAL_KEY: OLD_KEY });
		const rotated = { ...ENV, OSIONOS_EMAIL_SEAL_KEY_PREVIOUS: OLD_KEY };
		assert.deepEqual(email.open(old, USER, rotated), PLAIN);
		assert.equal(codeOf(() => email.open(email.seal(PLAIN, USER, rotated), USER, { OSIONOS_EMAIL_SEAL_KEY: OLD_KEY })), 'email_unavailable');
		assert.deepEqual(email.open(email.seal(PLAIN, USER, ENV), USER, { ...ENV, OSIONOS_EMAIL_SEAL_KEY_PREVIOUS: 'not-a-key' }), PLAIN, 'a malformed previous key is ignored');
	});

	it('S4 keeps the MFA byte format: an independently built value opens, and ours opens independently', () => {
		const key = Buffer.alloc(32, 7);
		const iv = randomBytes(12);
		const cipher = createCipheriv('aes-256-gcm', key, iv);
		cipher.setAAD(Buffer.from(`osionos-mfa-totp:v1:${USER}`, 'ascii'));
		const ct = Buffer.concat([cipher.update(PLAIN), cipher.final()]);
		const legacy = `v1.${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')}`;
		const env = { OSIONOS_MFA_SECRET_KEY: key.toString('base64') };
		assert.deepEqual(openSecret(legacy, USER, env), PLAIN);

		const raw = Buffer.from(sealSecret(PLAIN, USER, env).slice(3), 'base64');
		const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
		decipher.setAAD(Buffer.from(`osionos-mfa-totp:v1:${USER}`, 'ascii'));
		decipher.setAuthTag(raw.subarray(12, 28));
		assert.deepEqual(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]), PLAIN);
	});

	it('S5 a missing or short key is the instance\'s own code', () => {
		assert.equal(codeOf(() => email.seal(PLAIN, USER, {})), 'email_unavailable');
		assert.equal(codeOf(() => email.seal(PLAIN, USER, { OSIONOS_EMAIL_SEAL_KEY: Buffer.alloc(31).toString('base64') })), 'email_unavailable');
		assert.equal(codeOf(() => sealSecret(PLAIN, USER, {})), 'mfa_unavailable');
	});

	it('one purpose\'s ciphertext does not open under the other\'s label', () => {
		const same = { OSIONOS_MFA_SECRET_KEY: KEY, OSIONOS_EMAIL_SEAL_KEY: KEY };
		assert.equal(codeOf(() => openSecret(email.seal(PLAIN, USER, same), USER, same)), 'mfa_unavailable');
	});
});
