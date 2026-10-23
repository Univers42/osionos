/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   keyset-postgrest.mjs                                +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * A table-driven PostgREST for the routes that page by keyset: it applies the `or=(...)` page
 * filter (with its nested `and(...)`), the order, the limit, the select projection and the
 * `Prefer` header. The house harness cannot serve these routes: it lists the reserved params
 * and `or=` is not among them, so it throws on the page filter.
 *
 * It THROWS on a filter it does not know. A fake that ignored an unknown operator would match
 * every row and let a new query shape pass for the wrong reason.
 *
 * Caveat: ordering is a plain code-unit string compare, not a Postgres collation, so a test
 * must seed ASCII names that sort the same way in both.
 */

const RESERVED = new Set(['select', 'order', 'limit', 'on_conflict']);
const SERVICE_KEY = 'service-role-test-key';

function unquote(text) {
	if (!text.startsWith('"')) return text;
	return text.slice(1, -1).replace(/\\(["\\])/g, '$1');
}

/** Split on the commas that sit outside quotes and parentheses. */
function topLevel(text) {
	const parts = [];
	let depth = 0;
	let quoted = false;
	let start = 0;
	for (let at = 0; at < text.length; at += 1) {
		const char = text[at];
		if (quoted) {
			if (char === '\\') at += 1;
			else if (char === '"') quoted = false;
		} else if (char === '"') quoted = true;
		else if (char === '(') depth += 1;
		else if (char === ')') depth -= 1;
		else if (char === ',' && depth === 0) {
			parts.push(text.slice(start, at));
			start = at + 1;
		}
	}
	parts.push(text.slice(start));
	return parts;
}

function same(left, right) {
	return left != null && String(left).toLowerCase() === String(right).toLowerCase();
}

function matches(row, column, expr) {
	if (expr === 'is.null') return row[column] == null;
	if (expr === 'not.is.null') return row[column] != null;
	if (expr.startsWith('eq.')) return same(row[column], unquote(expr.slice(3)));
	if (expr.startsWith('gt.')) return row[column] != null && String(row[column]) > unquote(expr.slice(3));
	if (expr.startsWith('lt.')) return row[column] != null && String(row[column]) < unquote(expr.slice(3));
	if (expr.startsWith('in.(') && expr.endsWith(')')) return topLevel(expr.slice(4, -1)).some((value) => same(row[column], unquote(value)));
	throw new Error(`keyset store: unsupported filter ${column}=${expr}`);
}

function matchesTerm(row, term) {
	if (term.startsWith('and(') && term.endsWith(')')) return topLevel(term.slice(4, -1)).every((part) => matchesTerm(row, part));
	const dot = term.indexOf('.');
	if (dot < 1) throw new Error(`keyset store: unsupported or term ${term}`);
	return matches(row, term.slice(0, dot), term.slice(dot + 1));
}

function matchesParam(row, key, value) {
	if (key !== 'or') return matches(row, key, value);
	if (!value.startsWith('(') || !value.endsWith(')')) throw new Error(`keyset store: unsupported or ${value}`);
	return topLevel(value.slice(1, -1)).some((term) => matchesTerm(row, term));
}

function project(row, select) {
	if (!select || select === '*') return { ...row };
	return Object.fromEntries(select.split(',').filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]]));
}

function ordered(rows, order) {
	if (!order) return rows;
	const keys = order.split(',').map((entry) => entry.split('.'));
	return [...rows].sort((left, right) => {
		for (const [column, direction] of keys) {
			const a = String(left[column] ?? '');
			const b = String(right[column] ?? '');
			if (a !== b) return (a < b ? -1 : 1) * (direction === 'desc' ? -1 : 1);
		}
		return 0;
	});
}

/** `refuse` names the tables whose writes answer 500, so a test can break the audit log. */
export function createKeysetStore({ tables = {}, refuse = [] } = {}) {
	const data = new Map(Object.entries(tables).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
	const calls = [];
	const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		const table = parsed.pathname.replace('/rest/v1/', '');
		const method = init.method ?? 'GET';
		const params = parsed.searchParams;
		const prefer = String(init.headers?.Prefer ?? '');
		const body = init.body ? JSON.parse(init.body) : undefined;
		calls.push({ method, table, params, body, prefer, authorization: String(init.headers?.Authorization ?? ''), apikey: String(init.headers?.apikey ?? '') });
		if (method !== 'GET' && refuse.includes(table)) return json({ message: 'refused' }, 500);
		const rows = data.get(table) ?? [];
		const filtered = () => rows.filter((row) => [...params].every(([key, value]) => RESERVED.has(key) || matchesParam(row, key, value)));
		if (method === 'GET') {
			const found = ordered(filtered(), params.get('order'));
			const limit = params.has('limit') ? Number(params.get('limit')) : undefined;
			return json(found.slice(0, limit).map((row) => project(row, params.get('select'))));
		}
		if (method === 'POST') {
			const keys = (params.get('on_conflict') ?? '').split(',').filter(Boolean);
			const hit = keys.length > 0 ? rows.find((row) => keys.every((key) => same(row[key], body[key]))) : undefined;
			if (hit && prefer.includes('merge-duplicates')) Object.assign(hit, body);
			else if (hit) return json({ code: '23505' }, 409);
			else rows.push({ ...body });
			data.set(table, rows);
			return prefer.includes('return=representation') ? json([body], 201) : new Response(null, { status: 204 });
		}
		if (method === 'PATCH') {
			const hits = filtered();
			for (const row of hits) Object.assign(row, body);
			return prefer.includes('return=representation') ? json(hits.map((row) => project(row, params.get('select'))), 200) : new Response(null, { status: 204 });
		}
		if (method === 'DELETE') {
			const gone = new Set(filtered());
			data.set(table, rows.filter((row) => !gone.has(row)));
			return new Response(null, { status: 204 });
		}
		return json({ message: `keyset store: ${method} ${table} is not served` }, 405);
	};

	return {
		fetchImpl,
		calls,
		rows: (name) => data.get(name) ?? [],
		callsTo: (name) => calls.filter((call) => call.table === name),
		SERVICE_KEY,
	};
}
