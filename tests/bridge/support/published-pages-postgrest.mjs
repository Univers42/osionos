/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   published-pages-postgrest.mjs                       +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The published pages as a PostgREST: the snapshot rows the account role reads, the page
 * rows the service role reads beside them, and the filters the route sends actually
 * applied. A fake that ignored the owner scope would answer another user's row, so the
 * scope of the account role is the point of this file — it mirrors the policy the P5-5-a
 * migration installs (`owner_id = osionos_account_uid()`).
 *
 * The account role is the bearer whose claims carry `role = osionos_account_user`; the
 * service role is the bearer that is the service key. The calls keep the two apart, so a
 * route that read the snapshots with the service key shows up here instead of hiding.
 *
 * Caveat: the `in.()` list is capped at 90 values, the way a long URI breaks in practice.
 * A list over the ceiling is refused instead of silently truncated, so a route that asks
 * for too many ids fails loudly.
 */

const PUBLISHED = 'osionos_published_pages';
const PAGES = 'osionos_pages';
const SESSIONS = 'osionos_sessions';
const AUDIT = 'osionos_bridge_audit_events';

export const IN_LIST_CEILING = 90;

const RESERVED_PARAMS = new Set(['select', 'order', 'limit']);

function sameText(value, text) {
	return value != null && String(value).toLowerCase() === String(text).toLowerCase();
}

/** The values of an `in.(a,b,c)` filter. */
function inListValues(expr) {
	return expr.slice(4, -1).split(',').map((value) => value.trim()).filter((value) => value !== '');
}

function matches(row, key, expr) {
	if (expr === 'is.null') return row[key] == null;
	if (expr === 'not.is.null') return row[key] != null;
	if (expr.startsWith('eq.')) return sameText(row[key], expr.slice(3));
	if (expr.startsWith('gt.')) return String(row[key] ?? '') > expr.slice(3);
	if (expr.startsWith('in.(') && expr.endsWith(')')) return inListValues(expr).some((value) => sameText(row[key], value));
	throw new Error(`published-pages store: unsupported filter ${key}=${expr}`);
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

export function createPublishedPagesStore({ published = [], pages = [], fail = null } = {}) {
	const calls = [];
	const tables = new Map([
		[PUBLISHED, published.map((row) => ({ ...row }))],
		[PAGES, pages.map((row) => ({ ...row }))],
		[SESSIONS, []],
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
		const authorization = String(init.headers?.Authorization ?? init.headers?.authorization ?? '');
		const claims = claimsOf(init.headers);
		const call = { method, table, params, body, prefer, claims, authorization };
		calls.push(call);
		const failure = fail?.(call);
		if (failure) return json(failure.body ?? {}, failure.status ?? 500);
		const store = tables.get(table) ?? [];
		if (method === 'GET') {
			for (const [key, expr] of params) {
				if (RESERVED_PARAMS.has(key)) continue;
				if (expr.startsWith('in.(') && inListValues(expr).length > IN_LIST_CEILING) {
					return json({ code: '400', message: `the in.() list of ${key} is over the ceiling` }, 400);
				}
			}
			// The scope of the published table: the account role sees the rows whose owner is
			// the subject of its token. The service role sees every row.
			const accountRole = claims?.role === 'osionos_account_user';
			const scoped = accountRole && table === PUBLISHED
				? store.filter((row) => sameText(row.owner_id, claims.sub))
				: store;
			const found = scoped.filter((row) => [...params].every(([key, expr]) => RESERVED_PARAMS.has(key) || matches(row, key, expr)));
			const ordered = orderRows(found, params.get('order'));
			const limit = params.has('limit') ? Number(params.get('limit')) : undefined;
			const rows = ordered.slice(0, limit).map((row) => project(row, params.get('select')));
			const range = rows.length === 0 ? '*/0' : `0-${rows.length - 1}/${found.length}`;
			return json(rows, 200, prefer.includes('count=exact') ? { 'content-range': range } : {});
		}
		if (method === 'POST') {
			const row = { ...body };
			store.push(row);
			tables.set(table, store);
			return prefer.includes('return=representation') ? json([project(row, params.get('select'))], 201) : new Response(null, { status: 204 });
		}
		return json({ message: `published-pages store: ${method} ${table} is not served` }, 405);
	};

	return {
		fetchImpl,
		calls,
		rows: (name = PUBLISHED) => tables.get(name) ?? [],
		/** The calls the bridge made to one table, in order. */
		callsTo: (name) => calls.filter((call) => call.table === name),
	};
}
