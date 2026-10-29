/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-shared-store.mjs                            :+:      :+:    :+:   */
/*                                                   yw        yw        */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  Gonzalo   +=        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What the bridge keeps in the shared key/value store, and how the health line names it.
 *
 * The handoff record is sealed: the lookup key is derived from the handoff token (so the
 * token is the only way to find the record) and the value is encrypted with a second HKDF
 * output of the server secret, so a leaked Redis holds neither the token nor a usable
 * session. The replay marker is a single-use claim on the jti of a gateway assertion.
 *
 * Caveat: the HKDF salt is fixed, so the two derivations differ only by their info
 * string. The token is 32 random bytes and the secret is a server secret, so neither output
 * is brute-forceable — but a rotation of the secret makes every handoff in flight
 * unopenable, and the user signs in again.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const KEY_INFO = 'osb:handoff:key';
const SEAL_INFO = 'osb:handoff:seal';
const SALT = 'osionos-bridge-handoff-v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function derive(ikm, info) {
	return Buffer.from(hkdfSync('sha256', ikm, SALT, info, 32));
}

/** The key the store holds the record under: the token is the only way to compute it. */
export function handoffLookupKey(token) {
	return `handoff:${derive(String(token), KEY_INFO).toString('hex')}`;
}

/** The AES key the record is sealed under; it never leaves this process. */
export function handoffSealKey(secret) {
	return derive(String(secret), SEAL_INFO);
}

/** The record as one opaque string: the iv, the ciphertext and the tag. */
export function sealHandoffRecord(record, secret) {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv('aes-256-gcm', handoffSealKey(secret), iv);
	const ciphertext = Buffer.concat([cipher.update(JSON.stringify(record), 'utf8'), cipher.final()]);
	return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString('base64');
}

/**
 * The record behind a stored value, or null when it is not one: a flipped byte, a truncated
 * value or a value sealed with another secret all fail the authentication tag.
 */
export function openHandoffRecord(value, secret) {
	try {
		const blob = Buffer.from(String(value), 'base64');
		if (blob.length < IV_BYTES + TAG_BYTES) return null;
		const decipher = createDecipheriv('aes-256-gcm', handoffSealKey(secret), blob.subarray(0, IV_BYTES));
		decipher.setAuthTag(blob.subarray(blob.length - TAG_BYTES));
		const plaintext = Buffer.concat([
			decipher.update(blob.subarray(IV_BYTES, blob.length - TAG_BYTES)),
			decipher.final(),
		]);
		const record = JSON.parse(plaintext.toString('utf8'));
		return record && typeof record === 'object' && !Array.isArray(record) ? record : null;
	} catch {
		return null;
	}
}

/** The store as the health line names it: a configured Redis that is down is 'unavailable'. */
export function kvState(config) {
	if (!config.kv || !config.kvRequired) return 'memory';
	return config.kv.backend() === 'redis' ? 'redis' : 'unavailable';
}

/** The store as the boot line names it: without a Redis the bridge is one replica only. */
export function kvBootLine(required) {
	return required
		? '[osionos-bridge] key/value store: redis; the handoff tokens and the replay markers are shared by every replica.'
		: '[osionos-bridge] key/value store: memory; single replica only — a handoff minted on one replica cannot be consumed on another.';
}
