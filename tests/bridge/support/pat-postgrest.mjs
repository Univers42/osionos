/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pat-postgrest.mjs                                   +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The personal access token table as a PostgREST: the token rows, the audit rows and the
 * session rows, with the filters the bridge sends actually applied.
 *
 * The point of this file is the boundary it draws. The account role may select eleven
 * columns of the token table and never `token_hash` (P5-1-a's column grant), it may write
 * nothing at all (the bridge writes through the service role), and it sees only the rows
 * whose `user_id` is the subject of its token (the owner policy). A fake that ignored one
 * of the three would let a route leak a hash, mint a token with the account key or show
 * another user's token — so the fake refuses them the way Postgres does.
 *
 * The service role sees every row: it is the only writer, and it is the only role that may
 * read the hash (the middleware's lookup by hash needs it).
 *
 * Caveat: the fake models the P5-1-a table, not the whole database: the CHECK constraints
 * of the migration are not evaluated here, so a row the database would refuse (a token that
 * grants nothing, a half-revoked row) is accepted by the fake. The bridge validates the
 * same rules before it writes, which is what its own cases pin.
 */

const PATS = 'osionos_personal_access_tokens';
const SESSIONS = 'osionos_sessions';
const AUDIT = 'osionos_bridge_audit_events';

const ACCOUNT_ROLE = 'osionos_account_user';
const RESERVED_PARAMS = new Set(['select', 'order', 'limit', 'offset']);

// P5-1-a's column grant for the account role: eleven columns, and never token_hash.
const ACCOUNT_COLUMNS = [
	'id', 'user_id', 'name', 'kind', 'scopes', 'grants',
	'created_at', 'expires_at', 'last_used_at', 'revoked_at', 'revoked_reason',
];

function sameText(value, text) {
	return value != null && String(value).toLowerCase() === String(text).toLowerCase();
}

/** The values of an `in.(a,b,c)` filter. */
function inListValues(expr) {
	return expr.slice(4, -1).split(',').map((value) => value.trim()).filter((value) => value !== '');
}

/** `or=(col.op.value,col.op.value)`: the row matches when any member does (members hold no commas). */
function matchesAny(row, expr) {
	if (!expr.startsWith('(') || !expr.endsWith(')')) throw new Error(`pat store: unsupported or group ${expr}`);
	return expr.slice(1, -1).split(',').some((member) => {
		const dot = member.indexOf('.');
		return matches(row, member.slice(0, dot), member.slice(dot + 1));
	});
}

function matches(row, key, expr) {
	if (key === 'or') return matchesAny(row, expr);
	if (expr === 'is.null') return row[key] == null;
	if (expr === 'not.is.null') return row[key] != null;
	if (expr.startsWith('eq.')) return sameText(row[key], expr.slice(3));
	if (expr.startsWith('gt.')) return String(row[key] ?? '') > expr.slice(3);
	// SQL: a NULL is never less than anything, so an unset column does not match.
	if (expr.startsWith('lt.')) return row[key] != null && String(row[key]) < expr.slice(3);
	if (expr.startsWith('in.(') && expr.endsWith(')')) return inListValues(expr).some((value) => sameText(row[key], value));
	throw new Error(`pat store: unsupported filter ${key}=${expr}`);
}

function project(row, select) {
	if (!select || select === '*') return { ...row };
	const keys = String(select).split(',').map((key) => key.trim()).filter((key) => key !== '');
	return Object.fromEntries(keys.filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]]));
}

function orderRows(rows, order) {
	if (!order) return rows;
	const [column, direction] = String(order).split('.');
	const sign = direction === 'desc' ? -1 : 1;
	return [...rows].sort((left, right) => sign * String(left[column] ?? '').localeCompare(String(right[column] ?? '')));
}

/** The claims of a minted account token; the service key is not a token and reads null. */
function claimsOf(headers) {
	const raw = String(headers?.Authorization ?? headers?.authorization ?? '');
	if (!raw.startsWith('Bearer ')) return null;
	const payload = raw.slice('Bearer '.length).split('.')[1];
	if (!payload) return null;
	try {
		return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
}

export function createPatStore({ tokens = [], sessions = [], fail = null } = {}) {
	const calls = [];
	const tables = new Map([
		[PATS, tokens.map((row) => ({ ...row }))],
		[SESSIONS, sessions.map((row) => ({ ...row }))],
		[AUDIT, []],
	]);
	const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

	/** The rows the caller may see: a table with a user_id column is owner-scoped. */
	function visible(store, claims) {
		const owner = claims?.role === ACCOUNT_ROLE ? String(claims?.sub ?? '').toLowerCase() : null;
		if (owner === null) return store;
		return store.filter((row) => !Object.hasOwn(row, 'user_id') || sameText(row.user_id, owner));
	}

	/**
	 * The columns the account role may read, and the refusal when it names another one.
	 * `select=*` expands to the granted columns, the way a column grant does.
	 */
	function selectFor(table, params, claims) {
		const accountRole = claims?.role === ACCOUNT_ROLE && table === PATS;
		if (!accountRole) return params.get('select');
		const named = String(params.get('select') ?? '*').split(',').map((key) => key.trim()).filter((key) => key !== '');
		if (named.includes('*')) return ACCOUNT_COLUMNS.join(',');
		const denied = named.find((column) => !ACCOUNT_COLUMNS.includes(column));
		if (!denied) return params.get('select');
		return { denied };
	}

	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		const table = parsed.pathname.replace('/rest/v1/', '');
		const method = init.method ?? 'GET';
		const params = parsed.searchParams;
		const prefer = String(init.headers?.Prefer ?? '');
		const body = init.body ? JSON.parse(init.body) : undefined;
		const claims = claimsOf(init.headers);
		const call = { method, table, params, body, prefer, claims, authorization: String(init.headers?.Authorization ?? init.headers?.authorization ?? '') };
		calls.push(call);
		const failure = fail?.(call);
		if (failure) return json(failure.body ?? {}, failure.status ?? 500);
		const store = tables.get(table) ?? [];
		if (method === 'GET') {
			const select = selectFor(table, params, claims);
			if (typeof select === 'object') {
				return json({ code: '42501', message: `permission denied for column ${select.denied}` }, 403);
			}
			const found = visible(store, claims).filter((row) => [...params].every(([key, expr]) => RESERVED_PARAMS.has(key) || matches(row, key, expr)));
			const ordered = orderRows(found, params.get('order'));
			const limit = params.has('limit') ? Number(params.get('limit')) : undefined;
			const rows = ordered.slice(0, limit).map((row) => project(row, select));
			// The count of the match travels in the header when the caller asks for it.
			const range = rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${found.length}`;
			return json(rows, 200, prefer.includes('count=exact') ? { 'content-range': range } : {});
		}
		if (method === 'POST') {
			// The account role has no INSERT on the token table: the bridge writes the hash
			// through the service role (ADR 0003).
			if (table === PATS && claims?.role === ACCOUNT_ROLE) {
				return json({ code: '42501', message: 'permission denied for table osionos_personal_access_tokens' }, 403);
			}
			const row = { ...body };
			// The columns the migration gives a default, the way Postgres fills them.
			if (table === PATS) {
				row.created_at = row.created_at ?? new Date().toISOString();
				row.last_used_at = row.last_used_at ?? null;
				row.revoked_at = row.revoked_at ?? null;
				row.revoked_reason = row.revoked_reason ?? null;
			}
			// The unique index on the hash is the database's business, not a comparison of a
			// credential: a second row with the same hash is a conflict, not an ambiguity.
			if (table === PATS && row.token_hash && store.some((candidate) => sameText(candidate.token_hash, row.token_hash))) {
				return json({ code: '23505', message: 'duplicate key value violates unique constraint "osionos_personal_access_tokens_hash_uidx"' }, 409);
			}
			store.push(row);
			tables.set(table, store);
			return prefer.includes('return=representation') ? json([project(row, params.get('select'))], 201) : new Response(null, { status: 204 });
		}
		if (method === 'PATCH') {
			if (table === PATS && claims?.role === ACCOUNT_ROLE) {
				return json({ code: '42501', message: 'permission denied for table osionos_personal_access_tokens' }, 403);
			}
			const hits = visible(store, claims).filter((row) => [...params].every(([key, expr]) => RESERVED_PARAMS.has(key) || matches(row, key, expr)));
			for (const row of hits) Object.assign(row, body);
			return prefer.includes('return=representation') ? json(hits.map((row) => project(row, params.get('select'))), 200) : new Response(null, { status: 204 });
		}
		return json({ message: `pat store: ${method} ${table} is not served` }, 405);
	};

	return {
		fetchImpl,
		calls,
		rows: (name = PATS) => tables.get(name) ?? [],
		/** The calls the bridge made to one table, in order. */
		callsTo: (name) => calls.filter((call) => call.table === name),
	};
}

export const PAT_TABLE = PATS;
export const AUDIT_TABLE = AUDIT;
