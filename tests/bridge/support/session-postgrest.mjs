/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   session-postgrest.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The account plane as a PostgREST: the session rows and the audit rows, with the filters
 * the bridge sends actually applied. A fake that ignores `user_id=eq.` would answer a
 * revoke of another user's session, so the filters are the point of this file.
 *
 * The owner read (asUser) is filtered by the RLS policy the migration installs: the role
 * sees the rows whose user_id is the token's subject. The service role sees everything.
 */

const SESSIONS = 'osionos_sessions';
const AUDIT = 'osionos_bridge_audit_events';

function sameText(value, text) {
	return value != null && String(value).toLowerCase() === String(text).toLowerCase();
}

function matches(row, key, expr) {
	if (expr === 'is.null') return row[key] == null;
	if (expr === 'not.is.null') return row[key] != null;
	if (expr.startsWith('eq.')) return sameText(row[key], expr.slice(3));
	if (expr.startsWith('gt.')) return String(row[key] ?? '') > expr.slice(3);
	if (expr.startsWith('lt.')) return String(row[key] ?? '') < expr.slice(3);
	throw new Error(`session store: unsupported filter ${key}=${expr}`);
}

function project(row, select) {
	if (!select || select === '*') return { ...row };
	return Object.fromEntries(select.split(',').filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]]));
}

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

export function createSessionStore({ rows = [], fail = null } = {}) {
	const calls = [];
	const tables = new Map([
		[SESSIONS, rows.map((row) => ({ ...row }))],
		[AUDIT, []],
	]);
	const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		const table = parsed.pathname.replace('/rest/v1/', '');
		const method = init.method ?? 'GET';
		const params = parsed.searchParams;
		const prefer = String(init.headers?.Prefer ?? '');
		const body = init.body ? JSON.parse(init.body) : undefined;
		const claims = claimsOf(init.headers);
		const call = { method, table, params, body, prefer, claims };
		calls.push(call);
		const failure = fail?.(call);
		if (failure) return json(failure.body ?? {}, failure.status ?? 500);
		const store = tables.get(table) ?? [];
		if (method === 'GET') {
			const owner = claims?.role === 'osionos_account_user' ? String(claims.sub ?? '').toLowerCase() : null;
			const found = store.filter((row) => (owner === null || sameText(row.user_id, owner))
				&& [...params].every(([key, expr]) => ['select', 'order', 'limit'].includes(key) || matches(row, key, expr)));
			const ordered = params.get('order') === 'created_at.desc'
				? [...found].sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
				: params.get('order') === 'id.asc'
					? [...found].sort((left, right) => String(left.id).localeCompare(String(right.id)))
					: found;
			const rows = ordered.slice(0, params.has('limit') ? Number(params.get('limit')) : undefined).map((row) => project(row, params.get('select')));
			const range = rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${found.length}`;
			return json(rows, 200, prefer.includes('count=exact') ? { 'content-range': range } : {});
		}
		if (method === 'POST') {
			const id = body?.id;
			if (id !== undefined && store.some((row) => sameText(row.id, id))) {
				return json({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409);
			}
			// The partial unique index on parent_id: one child per row, however the requests interleave.
			if (body?.parent_id != null && store.some((row) => sameText(row.parent_id, body.parent_id))) {
				return json({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409);
			}
			const row = { ...body };
			store.push(row);
			tables.set(table, store);
			return prefer.includes('return=representation') ? json([project(row, params.get('select'))], 201) : new Response(null, { status: 204 });
		}
		if (method === 'PATCH') {
			const hits = store.filter((row) => [...params].every(([key, expr]) => ['select', 'order', 'limit'].includes(key) || matches(row, key, expr)));
			for (const row of hits) Object.assign(row, body);
			return prefer.includes('return=representation') ? json(hits.map((row) => project(row, params.get('select'))), 200) : new Response(null, { status: 204 });
		}
		return json({ message: `session store: ${method} ${table} is not served` }, 405);
	};

	return {
		fetchImpl,
		calls,
		rows: (name = SESSIONS) => tables.get(name) ?? [],
		/** The calls the bridge made to one table, in order. */
		callsTo: (name) => calls.filter((call) => call.table === name),
	};
}
