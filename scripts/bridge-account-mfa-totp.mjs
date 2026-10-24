/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-mfa-totp.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The TOTP primitive and the secret's encryption at rest: pure functions, no I/O, no state.
 * RFC 6238 over HMAC-SHA1 (the only algorithm every authenticator app agrees on), 6 digits,
 * 30 s steps. The secret is sealed with bridge-seal.mjs (AES-256-GCM, bound to its user by
 * the AAD), so a row copied to another account does not open.
 * Caveat: the window accepts one step either side of the clock, so a code is valid for up
 * to 90 s; replay is the caller's job (matchStep only enforces the `lastStep` floor it is given).
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createSeal } from './bridge-seal.mjs';

export const STEP_SECONDS = 30;
export const CODE_DIGITS = 6;
const WINDOW = 1;
const SECRET_BYTES = 20;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const unavailable = (cause) => Object.assign(new Error('Two-step verification is unavailable; try again shortly.'), { status: 503, code: 'mfa_unavailable', cause });

export const newSecret = () => randomBytes(SECRET_BYTES);

export function base32Encode(bytes) {
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += ALPHABET[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	return bits > 0 ? out + ALPHABET[(value << (5 - bits)) & 31] : out;
}

export function base32Decode(text) {
	let bits = 0;
	let value = 0;
	const out = [];
	for (const char of String(text).replace(/=+$/, '').toUpperCase()) {
		const index = ALPHABET.indexOf(char);
		if (index < 0) throw new TypeError('not base32');
		value = (value << 5) | index;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}
	return Buffer.from(out);
}

/** The HOTP value of RFC 4226 for one counter, as a zero-padded string. */
export function hotp(secret, counter) {
	const message = Buffer.alloc(8);
	message.writeBigUInt64BE(BigInt(counter));
	const digest = createHmac('sha1', secret).update(message).digest();
	const offset = digest[digest.length - 1] & 15;
	const binary = digest.readUInt32BE(offset) & 0x7fffffff;
	return String(binary % 10 ** CODE_DIGITS).padStart(CODE_DIGITS, '0');
}

/**
 * The step a code matches, or null. Every candidate is compared in constant time and the
 * loop never exits early, so the answer does not leak which step was close.
 * @returns {number | null} the matched step, only if it is above `lastStep`
 */
export function matchStep({ secret, code, nowMs, lastStep = 0 }) {
	if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
	const current = Math.floor(nowMs / 1000 / STEP_SECONDS);
	const given = Buffer.from(code);
	let matched = null;
	for (let step = current - WINDOW; step <= current + WINDOW; step += 1) {
		const equal = timingSafeEqual(given, Buffer.from(hotp(secret, step)));
		if (equal && step > lastStep) matched = matched === null ? step : Math.max(matched, step);
	}
	return matched;
}

export function otpauthUrl({ secret, account, issuer }) {
	const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
	const query = new URLSearchParams({ secret: base32Encode(secret), issuer, algorithm: 'SHA1', digits: String(CODE_DIGITS), period: String(STEP_SECONDS) });
	return `otpauth://totp/${label}?${query}`;
}

export const { seal: sealSecret, open: openSecret } = createSeal({ keyEnv: 'OSIONOS_MFA_SECRET_KEY', aadLabel: 'osionos-mfa-totp:v1:', fail: unavailable });
