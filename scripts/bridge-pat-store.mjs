/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-pat-store.mjs                                +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The personal access token rows: the store that mints a secret, the one that lists the
 * caller's tokens, the two that revoke them and the one that resolves a hash into a row.
 *
 * The secret is 256 bits of randomness behind a prefix, and only its sha256 is stored. The
 * hash covers the WHOLE secret, prefix included, so a hash in the table cannot be replayed
 * as a secret. Nothing here compares a secret or a hash: the lookup is an indexed equality
 * in SQL, and a 256-bit secret has nothing to brute-force.
 *
 * The owner reads through the account role (ADR 0001: the role may select eleven columns
 * and never writes); the bridge writes through the service role (ADR 0003), because the
 * account role must not be able to write the hash. Every write takes the user id from the
 * verified session, never from the request.
 *
 * The caller owns the id and the hash of the row it is about to insert: the audit row that
 * names them is written BEFORE the insert, so a failed insert is still an attempt.
 *
 * Caveat: the list has no paging, but creation stops at PAT_LIVE_LIMIT live tokens and the list
 * holds only live ones, so every live token is reachable from the API.
 * Caveat: a table that is not there (the desktop edition has no account plane yet) is an
 * outage, not an empty answer: the store answers 503 account_plane_unavailable.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pgError } from './bridge-pg.mjs';

export const PAT_PREFIX = 'osio_pat_';

const PAT_TABLE = 'osionos_personal_access_tokens';
const PAT_SECRET_PATTERN = /^osio_pat_[A-Za-z0-9_-]{43}$/;
const LIST_COLUMNS = 'id,name,kind,scopes,grants,created_at,expires_at,last_used_at,revoked_at,revoked_reason';
// One number for the list window and the cap: a live token is always inside the window.
export const PAT_LIVE_LIMIT = 50;
const LIST_LIMIT = PAT_LIVE_LIMIT;

/** A missing table is an outage, never an empty answer. */
function unavailable(error) {
	if (Number(error?.upstreamStatus) === 404) return pgError(503, 'account_plane_unavailable');
	return error;
}

/** The stamp of a revocation: an ISO date whatever the caller had at hand. */
function stamp(now) {
	return new Date(now ?? Date.now()).toISOString();
}

/**
 * The secret and its hash: the secret is 32 random bytes in base64url behind the prefix,
 * the hash is the sha256 of the whole secret. The caller shows the secret once and stores
 * the hash.
 */
export function mintPatSecret() {
	const secret = PAT_PREFIX + randomBytes(32).toString('base64url');
	return { secret, hash: hashPatSecret(secret) };
}

/** The sha256 of a whole secret, prefix included. */
export function hashPatSecret(secret) {
	return createHash('sha256').update(String(secret ?? '')).digest('hex');
}

/** True when the value has the shape of a secret this build mints. */
export function isPatSecret(value) {
	return typeof value === 'string' && PAT_SECRET_PATTERN.test(value);
}

/**
 * The row of a new token, written through the service role: the account role has no
 * INSERT on the table, so it could not write the hash even by accident.
 */
export async function createPat({ pg, userId, name, kind, scopes = [], grants = [], expiresAt, id, hash }) {
	const row = {
		id: id ?? randomUUID(),
		user_id: userId,
		name,
		kind,
		scopes,
		grants,
		token_hash: hash,
		expires_at: expiresAt,
	};
	try {
		const rows = await pg.asService().post(PAT_TABLE, row, { prefer: 'return=representation' });
		return Array.isArray(rows) ? (rows[0] ?? row) : row;
	} catch (error) {
		throw unavailable(error);
	}
}

/**
 * The caller's live (unrevoked) tokens, newest first. Revoked rows are left out so one can
 * never push a live credential out of the limited window. Read through the account role: the
 * owner policy of the table is the scope, so the route adds no user filter of its own and a mistake in it cannot widen the
 * answer. The columns are named, so the hash is never even fetched.
 */
export async function listPats({ pg, session }) {
	const params = new URLSearchParams({
		select: LIST_COLUMNS,
		revoked_at: 'is.null',
		order: 'created_at.desc',
		limit: String(LIST_LIMIT),
	});
	try {
		const rows = await pg.asUser(session).get(`${PAT_TABLE}?${params}`);
		return Array.isArray(rows) ? rows : [];
	} catch (error) {
		throw unavailable(error);
	}
}

/** How many unrevoked tokens the user holds, counted up to PAT_LIVE_LIMIT. */
export async function countLivePats({ pg, userId }) {
	const params = new URLSearchParams({
		user_id: `eq.${userId}`,
		revoked_at: 'is.null',
		select: 'id',
		limit: String(PAT_LIVE_LIMIT),
	});
	try {
		const rows = await pg.asService().get(`${PAT_TABLE}?${params}`);
		return Array.isArray(rows) ? rows.length : 0;
	} catch (error) {
		throw unavailable(error);
	}
}

/**
 * The revocation of one token. The filter carries the owner and the live rows, so another
 * user's token and an already revoked one are the same empty answer: the id is not a probe
 * for what exists.
 */
export async function revokePat({ pg, userId, id, now }) {
	const params = new URLSearchParams({
		id: `eq.${id}`,
		user_id: `eq.${userId}`,
		revoked_at: 'is.null',
		select: 'id',
	});
	try {
		const rows = await pg.asService().patch(`${PAT_TABLE}?${params}`, { revoked_at: stamp(now), revoked_reason: 'user' }, { prefer: 'return=representation' });
		return Array.isArray(rows) && rows.length > 0;
	} catch (error) {
		throw unavailable(error);
	}
}

/**
 * The revocation of every live token of the caller: the same filter without the id. The
 * count of the rows that changed is the answer, so the caller can say how many it killed.
 */
export async function revokeAllPats({ pg, userId, now }) {
	const params = new URLSearchParams({
		user_id: `eq.${userId}`,
		revoked_at: 'is.null',
		select: 'id',
	});
	try {
		const rows = await pg.asService().patch(`${PAT_TABLE}?${params}`, { revoked_at: stamp(now), revoked_reason: 'user' }, { prefer: 'return=representation' });
		return Array.isArray(rows) ? rows.length : 0;
	} catch (error) {
		throw unavailable(error);
	}
}

/**
 * The row a hash names: the one read that must see the hash, and the only one. It is an
 * indexed equality on a 256-bit secret, so there is no timing oracle and no enumeration.
 */
export async function findPatByHash({ pg, hash }) {
	const params = new URLSearchParams({
		token_hash: `eq.${hash}`,
		select: 'id,user_id,kind,scopes,grants,expires_at,last_used_at,revoked_at',
	});
	try {
		const rows = await pg.asService().get(`${PAT_TABLE}?${params}`);
		return Array.isArray(rows) ? (rows[0] ?? null) : null;
	} catch (error) {
		throw unavailable(error);
	}
}
