/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   keys-postgrest.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The public-key table as a PostgREST, wrapped around the token fake for everything else
 * (sessions, audit rows). The wrapper draws the lines Postgres draws for this table: the
 * account role reads its own rows through eight granted columns and writes nothing, the
 * service role writes, a duplicate (user, kind, fingerprint) is a 23505, and the 51st row
 * of a user is the trigger's P0001 `key_limit`.
 *
 * `events` is the ordered log of every request, so a test can prove the audit row was
 * written before the insert.
 *
 * Caveat: the CHECK constraints of the migration (title length, key size, kind) are not
 * evaluated here; the bridge validates the same rules first, which its own cases pin.
 */

import { randomUUID } from 'node:crypto';
import { AUDIT_TABLE, createPatStore } from './pat-postgrest.mjs';

export const KEYS_TABLE = 'osionos_user_keys';
export const KEY_ROW_LIMIT = 50;

const ACCOUNT_ROLE = 'osionos_account_user';
const ACCOUNT_COLUMNS = ['id', 'user_id', 'kind', 'title', 'public_key', 'fingerprint', 'key_type', 'created_at'];
const RESERVED = new Set(['select', 'order', 'limit', 'offset']);

export function keyRow({ id = randomUUID(), userId, kind = 'ssh', title = 'Laptop', publicKey = 'ssh-ed25519 AAAA', fingerprint, keyType = 'ssh-ed25519', createdAt = '2026-10-01T00:00:00.000Z' }) {
	return { id, user_id: userId, kind, title, public_key: publicKey, fingerprint, key_type: keyType, created_at: createdAt };
}

function roleOf(headers) {
	const payload = String(headers?.Authorization ?? '').split('.')[1];
	try {
		return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
}

const sameText = (left, right) => String(left ?? '').toLowerCase() === String(right ?? '').toLowerCase();

function eqFilters(params) {
	return [...params].filter(([key]) => !RESERVED.has(key)).map(([key, expr]) => {
		if (!expr.startsWith('eq.')) throw new Error(`keys store: unsupported filter ${key}=${expr}`);
		return [key, expr.slice(3)];
	});
}

export function createKeysStore({ keys = [], sessions = [], fail = null } = {}) {
	const inner = createPatStore({ sessions, fail });
	const rows = keys.map((row) => ({ ...row }));
	const keyCalls = [];
	const events = [];
	const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

	function read(call, claims) {
		const named = String(call.params.get('select') ?? '*').split(',').filter((name) => name !== '');
		const columns = named.includes('*') ? ACCOUNT_COLUMNS : named;
		const denied = claims?.role === ACCOUNT_ROLE ? columns.find((name) => !ACCOUNT_COLUMNS.includes(name)) : null;
		if (denied) return json({ code: '42501', message: `permission denied for column ${denied}` }, 403);
		const owner = claims?.role === ACCOUNT_ROLE ? claims.sub : null;
		const found = rows.filter((row) => (owner === null || sameText(row.user_id, owner)) && eqFilters(call.params).every(([key, value]) => sameText(row[key], value)));
		found.sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
		const limit = call.params.has('limit') ? Number(call.params.get('limit')) : undefined;
		return json(found.slice(0, limit).map((row) => Object.fromEntries(columns.map((name) => [name, row[name]]))));
	}

	function insert(call, claims) {
		if (claims?.role === ACCOUNT_ROLE) return json({ code: '42501', message: 'permission denied for table osionos_user_keys' }, 403);
		const row = { id: randomUUID(), created_at: new Date().toISOString(), ...call.body };
		if (rows.some((other) => other.user_id === row.user_id && other.kind === row.kind && other.fingerprint === row.fingerprint)) {
			return json({ code: '23505', message: 'duplicate key value violates unique constraint "osionos_user_keys_user_kind_fingerprint_key"' }, 409);
		}
		if (rows.filter((other) => other.user_id === row.user_id).length >= KEY_ROW_LIMIT) {
			return json({ code: 'P0001', message: 'key_limit' }, 400);
		}
		rows.push(row);
		return json([row], 201);
	}

	function remove(call, claims) {
		if (claims?.role === ACCOUNT_ROLE) return json({ code: '42501', message: 'permission denied for table osionos_user_keys' }, 403);
		const filters = eqFilters(call.params);
		const gone = rows.filter((row) => filters.every(([key, value]) => sameText(row[key], value)));
		for (const row of gone) rows.splice(rows.indexOf(row), 1);
		return json(gone);
	}

	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		const table = parsed.pathname.replace('/rest/v1/', '');
		const method = init.method ?? 'GET';
		events.push(`${method} ${table}`);
		if (table !== KEYS_TABLE) return inner.fetchImpl(url, init);
		const claims = roleOf(init.headers);
		const call = { method, params: parsed.searchParams, body: init.body ? JSON.parse(init.body) : undefined, role: claims?.role ?? 'service_role', claims };
		keyCalls.push(call);
		const failure = fail?.({ ...call, table });
		if (failure) return json(failure.body ?? {}, failure.status ?? 500);
		if (method === 'GET') return read(call, claims);
		if (method === 'POST') return insert(call, claims);
		if (method === 'DELETE') return remove(call, claims);
		return json({ message: `keys store: ${method} is not served` }, 405);
	};

	return {
		fetchImpl,
		rows: (name = KEYS_TABLE) => (name === KEYS_TABLE ? rows : inner.rows(name)),
		calls: inner.calls,
		keyCalls,
		events,
		auditRows: () => inner.rows(AUDIT_TABLE),
	};
}
