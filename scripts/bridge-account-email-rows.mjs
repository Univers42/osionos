/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-email-rows.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The table of secondary addresses (osionos_user_emails) and the address handling around
 * it: validation, the sealed column, the keyed hash, and every PostgREST call. Only the
 * service role reads the table, and every query names its user_id.
 *
 * Caveat: a verified secondary can come to equal another user's GoTrue primary AFTER it was
 * verified (B changes primary through GoTrue's own flow, or a new account signs up or links
 * OAuth with a provider-verified X); the primary has no row, so no index sees it. Nothing in
 * F-3b grants authority to a secondary (no sign-in, recovery or invite reach). F-3b2
 * (make-primary) and any address-keyed lookup MUST recheck both directions.
 *
 * Caveat: the seal key rotates through OSIONOS_EMAIL_SEAL_KEY_PREVIOUS but there is NO
 * re-seal path, so _PREVIOUS must stay set until one exists. The lookup key
 * (OSIONOS_EMAIL_LOOKUP_KEY) has NO rotation: changing it orphans every email_hmac, the
 * verified-unique index silently stops matching and every address looks free. Rotating it
 * needs a backfill that re-HMACs every row from the opened address (a future package).
 *
 * Caveat: aliases (`a+1@x`, dotted gmail) are distinct strings and bypass uniqueness by
 * design. A missing table, a down database and any unexpected error all collapse into one
 * 503 `email_unavailable`; only a unique violation (`23505`) is told apart.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { accountError } from './bridge-account-sudo.mjs';
import { createSeal } from './bridge-seal.mjs';

const TABLE = 'osionos_user_emails';
export const SEAL_ENV = 'OSIONOS_EMAIL_SEAL_KEY';
export const LOOKUP_ENV = 'OSIONOS_EMAIL_LOOKUP_KEY';
const COLUMNS = 'id,user_id,email_enc,email_hmac,created_at,verified_at';
const UNAVAILABLE = 'Email changes are unavailable; try again shortly.';
const MAX_ADDRESS = 254;
const LOCAL_ATOM = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+$/;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const LAST_LABEL = /^[a-z]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PENDING_TTL_MS = 3_600_000;

export const emailUnavailable = (cause) => Object.assign(accountError(503, 'email_unavailable', UNAVAILABLE), { cause });
export const isUuid = (value) => UUID.test(String(value));

const seal = createSeal({ keyEnv: SEAL_ENV, aadLabel: 'osionos-user-email:v1:', fail: emailUnavailable });

/** The trimmed, lowercased address, or null when it is not one the bridge will mail. */
export function normaliseAddress(value) {
	const address = typeof value === 'string' ? value.trim().toLowerCase() : '';
	if (address === '' || address.length > MAX_ADDRESS) return null;
	// The charset is strict because grobase builds `To: %s` from this string: a comma or CRLF is header injection.
	const parts = address.split('@');
	if (parts.length !== 2) return null;
	const [local, domain] = parts;
	if (!local.split('.').every((atom) => LOCAL_ATOM.test(atom))) return null;
	const labels = domain.split('.');
	if (labels.length < 2 || !labels.every((label) => DOMAIN_LABEL.test(label))) return null;
	return LAST_LABEL.test(labels[labels.length - 1]) ? address : null;
}

/** True when both keys are present and well-formed; the equal-keys refusal lives in the router. */
export function keysUsable(env) {
	const key = Buffer.from(String(env?.[SEAL_ENV] ?? ''), 'base64');
	return key.length === 32 && String(env?.[LOOKUP_ENV] ?? '').length >= 32;
}

export const hmacOf = (address, env) => createHmac('sha256', String(env[LOOKUP_ENV])).update(address).digest('hex');

/** The address of a row, or null when it does not open or its hash does not match (a swapped column). */
export function openAddress(row, env) {
	try {
		const address = seal.open(row.email_enc, row.user_id, env).toString('utf8');
		const expected = Buffer.from(hmacOf(address, env), 'hex');
		const given = Buffer.from(String(row.email_hmac), 'hex');
		return given.length === expected.length && timingSafeEqual(given, expected) ? address : null;
	} catch {
		return null;
	}
}

async function run(call) {
	try {
		return await call();
	} catch (error) {
		if (String(error?.upstreamCode) === '23505') throw Object.assign(new Error('That address is already verified.'), { status: 409, code: 'unique_violation' });
		throw emailUnavailable(error);
	}
}

const filter = (userId, extra = '') => `user_id=eq.${userId}${extra}`;

/** @param {{ pg: object, env: object }} deps */
export function createEmailRows({ pg, env }) {
	const service = () => pg.asService();
	const one = (rows) => (Array.isArray(rows) && rows.length > 0 ? rows[0] : null);
	return {
		list: (userId) => run(async () => (await service().get(`${TABLE}?${filter(userId)}&select=${COLUMNS}&order=created_at.asc`)) ?? []),
		get: (userId, id) => run(async () => one(await service().get(`${TABLE}?id=eq.${id}&${filter(userId)}&select=${COLUMNS}&limit=1`))),
		own: (userId, hmac) => run(async () => one(await service().get(`${TABLE}?${filter(userId, `&email_hmac=eq.${hmac}`)}&select=${COLUMNS}&limit=1`))),
		async verifiedByOther(userId, hmac) {
			const rows = await run(() => service().get(`${TABLE}?email_hmac=eq.${hmac}&verified_at=not.is.null&user_id=neq.${userId}&select=id&limit=1`));
			return one(rows) !== null;
		},
		async pendingCount(userId) {
			const rows = await run(() => service().get(`${TABLE}?${filter(userId, '&verified_at=is.null')}&select=id`));
			return Array.isArray(rows) ? rows.length : 0;
		},
		sweep: (userId, nowMs) => run(() => service().del(`${TABLE}?${filter(userId, `&verified_at=is.null&created_at=lt.${new Date(nowMs - PENDING_TTL_MS).toISOString()}`)}`)),
		insert: (userId, address) => run(async () => one(await service().post(TABLE, {
			user_id: userId,
			email_enc: seal.seal(Buffer.from(address, 'utf8'), userId, env),
			email_hmac: hmacOf(address, env),
		}, { prefer: 'return=representation' }))),
		async remove(userId, id) {
			const rows = await run(() => service().del(`${TABLE}?id=eq.${id}&${filter(userId)}`, { prefer: 'return=representation' }));
			return Array.isArray(rows) && rows.length > 0;
		},
		markVerified: (userId, id, atIso) => run(async () => one(await service().patch(`${TABLE}?id=eq.${id}&${filter(userId, '&verified_at=is.null')}`, { verified_at: atIso }, { prefer: 'return=representation' }))),
	};
}
