/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-recs-slate.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 13:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The signed slate: the list of pages the recommender served to ONE user, in
 * rank order, sealed so a later request (the beacon, "Not interested") can
 * prove it names a page that was really served to that user (devil C49).
 *
 * The token is base64url(JSON) + '.' + HMAC-SHA256 under a key derived from
 * the app session secret with HKDF and its own label: a slate can never verify
 * as a session token, and a session token never as a slate. The signature is
 * checked BEFORE the payload is parsed, and an empty secret is refused — a key
 * derived from '' would let anyone sign.
 */

import { createHmac, hkdfSync, randomUUID, timingSafeEqual } from 'node:crypto';

/** The HKDF label of the slate's key: one key, one purpose. */
const SLATE_KEY_INFO = 'osionos-rec-slate-v1';

/** A slate is good for an hour; after that it is not a slate any more. */
const SLATE_TTL_MS = 3_600_000;

/** The HKDF key of the slate: never the app secret itself, and never one derived from nothing. */
function slateKey(secret) {
	const ikm = Buffer.isBuffer(secret) ? secret : Buffer.from(String(secret ?? ''), 'utf8');
	if (ikm.length === 0) throw new Error('The slate needs the app session secret.');
	return Buffer.from(hkdfSync('sha256', ikm, '', SLATE_KEY_INFO, 32));
}

/** The signature of an encoded payload. */
function signatureOf(secret, encoded) {
	return createHmac('sha256', slateKey(secret)).update(encoded).digest('base64url');
}

/**
 * The token of a slate.
 *
 * @param {string} secret the app session secret
 * @param {{ recId: string, userId: string, surface: string, items: string[], issuedAt: number }} slate
 * @returns {string} the token
 */
export function signSlate(secret, { recId, userId, surface, items, issuedAt } = {}) {
	const payload = {
		recId: String(recId ?? ''),
		userId: String(userId ?? ''),
		surface: String(surface ?? ''),
		items: (Array.isArray(items) ? items : []).map(String),
		issuedAt: Number(issuedAt ?? Date.now()),
	};
	const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
	return `${encoded}.${signatureOf(secret, encoded)}`;
}

/**
 * The verification of a slate: the signature, the user and the age. Anything
 * else is null — a token of another shape (a session token), a flipped
 * character, another user's slate or a slate of an hour ago.
 *
 * @param {string} secret the app session secret
 * @param {string} token the token to verify
 * @param {string} userId the user the slate must belong to
 * @param {number} nowMs the moment of the check, in milliseconds
 * @returns {{ recId: string, surface: string, items: string[] } | null}
 */
export function verifySlate(secret, token, userId, nowMs = Date.now()) {
	const parts = String(token ?? '').split('.');
	if (parts.length !== 2) return null;
	const [encoded, signature] = parts;
	const given = Buffer.from(String(signature), 'utf8');
	const wanted = Buffer.from(signatureOf(secret, encoded), 'utf8');
	if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
	let payload;
	try {
		payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
	if (String(payload.userId ?? '') !== String(userId ?? '')) return null;
	const issuedAt = Number(payload.issuedAt);
	if (!Number.isFinite(issuedAt)) return null;
	if (Number(nowMs) - issuedAt > SLATE_TTL_MS) return null;
	return {
		recId: String(payload.recId ?? ''),
		surface: String(payload.surface ?? ''),
		items: Array.isArray(payload.items) ? payload.items.map(String) : [],
	};
}

/**
 * A fresh slate of the "home" surface for a user: its id and its token. The
 * personal and the popular answers issue theirs the same way.
 */
export function issueSlate(secret, userId, pageIds) {
	const recId = randomUUID();
	const slate = signSlate(secret, { recId, userId, surface: 'home', items: pageIds, issuedAt: Date.now() });
	return { recId, slate };
}
