/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-seal.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * AES-256-GCM sealing of a per-user secret at rest, shared by every table that stores
 * ciphertext (TOTP secrets, secondary email addresses). One primitive, one byte format:
 * `v1.` + base64(iv || tag || ciphertext). The AAD binds a value to its user and to its
 * purpose label, so a row copied to another account, or one purpose's ciphertext offered
 * to another's key, does not open.
 *
 * Caveat: the AAD has no row binding, so a database writer can swap sealed values between
 * one user's rows; callers that care recompute a keyed hash after opening. Rotation goes
 * through `<keyEnv>_PREVIOUS` and there is no re-seal path: keep it set until one exists.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 'v1.';

/**
 * @param {{ keyEnv: string, aadLabel: string, fail: (cause?: unknown) => Error }} options
 *   `fail` builds the module's own unavailable error; every failure is that one error.
 */
export function createSeal({ keyEnv, aadLabel, fail }) {
	const keyFrom = (text) => {
		const key = Buffer.from(String(text ?? ''), 'base64');
		if (key.length !== KEY_BYTES) throw fail();
		return key;
	};
	const aadOf = (userId) => Buffer.from(`${aadLabel}${userId}`, 'ascii');

	function openWith(key, raw, userId) {
		const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES));
		decipher.setAAD(aadOf(userId));
		decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
		return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
	}

	/** Always under the current key, never the previous one. */
	function seal(plain, userId, env = process.env) {
		const key = keyFrom(env[keyEnv]);
		const iv = randomBytes(IV_BYTES);
		const cipher = createCipheriv('aes-256-gcm', key, iv);
		cipher.setAAD(aadOf(userId));
		const sealed = Buffer.concat([cipher.update(plain), cipher.final()]);
		return VERSION + Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString('base64');
	}

	/** Opens under the current key, then the previous one (rotation). */
	function open(sealed, userId, env = process.env) {
		if (typeof sealed !== 'string' || !sealed.startsWith(VERSION)) throw fail();
		const raw = Buffer.from(sealed.slice(VERSION.length), 'base64');
		if (raw.length <= IV_BYTES + TAG_BYTES) throw fail();
		const keys = [keyFrom(env[keyEnv])];
		// A malformed previous key only loses the rows sealed under it; it must not lock out the current ones.
		if (env[`${keyEnv}_PREVIOUS`]) {
			try {
				keys.push(keyFrom(env[`${keyEnv}_PREVIOUS`]));
			} catch { /* ignored on purpose, see above */ }
		}
		for (const key of keys) {
			try {
				return openWith(key, raw, userId);
			} catch { /* try the previous key; a final failure is reported below */ }
		}
		throw fail();
	}

	return { seal, open };
}
