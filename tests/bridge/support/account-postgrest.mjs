/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   account-postgrest.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The account plane as a PostgREST: the typed profile rows, the settings sections, the
 * block list, the username history and the notification inbox — with the filters the
 * bridge sends actually applied.
 *
 * A fake that ignored `version=eq.` would answer a stale write with 200, and one that
 * ignored the row-level security would hand another user's row to a caller, so the
 * filters and the owner scope are the point of this file. The rules of P1-1's migration
 * are here too: the CHECK constraints refuse a value and name their column, and the
 * version moves by one on every row that really changed.
 */

const PROFILES = 'osionos_profiles';
const SETTINGS = 'osionos_user_settings';
const BLOCKS = 'osionos_user_blocks';
const HISTORY = 'osionos_username_history';
const NOTIFICATIONS = 'osionos_notifications';
const IDENTITIES = 'osionos_bridge_identities';
// The tables of the self sources: the four legacy ones the service role reads, the two
// account-plane ones the account role reads, and the directory the peer card is built on.
const PAGES = 'osionos_pages';
const TASKS = 'osionos_tasks';
const PUBLISHED = 'osionos_published_pages';
const CONNECTIONS = 'osionos_connections';
const WORKSHOPS = 'osionos_workspaces';
const MEMBERS = 'osionos_workspace_members';
const SESSIONS = 'osionos_sessions';
const DIRECTORY = 'osionos_people_directory';

// The self-source tables answer the WHOLE row, not the projection: a route that spreads
// a row must leak here, so the test sees the leak instead of trusting the select.
const WHOLE_ROW_TABLES = new Set([PAGES, TASKS, PUBLISHED, CONNECTIONS, WORKSHOPS, MEMBERS, SESSIONS, DIRECTORY]);

// The column that holds the owner of a row: the account role reads its own rows only,
// and the two account-plane tables name their owner differently.
const OWNER_COLUMN = { [PUBLISHED]: 'owner_id' };

const ACCOUNT_ROLE = 'osionos_account_user';
const RESERVED_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict']);

// The columns P1-1's migration may UPDATE, with the rule that refuses a value. The
// control characters are the ones the CHECK forbids; the bio may hold a newline.
const TEXT_RULES = {
	display_name: { min: 1, max: 100 },
	pronouns: { max: 40 },
	headline: { max: 200 },
	bio: { max: 2000, newline: true },
	location: { max: 120 },
	company: { max: 100 },
};
const PATTERN_RULES = {
	website: /^https?:\/\/\S{1,250}$/,
	timezone: /^[A-Za-z]+(\/[A-Za-z0-9_+-]+){0,2}$/,
	patreon: /^[A-Za-z0-9_-]{1,64}$/,
	avatar_url: /^(https:\/\/|\/)/,
	banner_url: /^(https:\/\/|\/)/,
};
const CONTROL = /[\u0000-\u001f\u007f]/;
const CONTROL_WITH_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f]/;
const LINK = /^https:\/\/\S{1,250}$/;
const ORCID_SHAPE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

function sameText(value, text) {
	return value != null && String(value).toLowerCase() === String(text).toLowerCase();
}

function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The LIKE pattern of PostgREST's `ilike`: `%` and `_` are wildcards, `\` escapes. */
function likeMatches(value, pattern) {
	let source = '^';
	for (let index = 0; index < pattern.length; index += 1) {
		const char = pattern[index];
		if (char === '\\') {
			const next = pattern[index + 1];
			if (next === undefined) break;
			source += escapeRegExp(next);
			index += 1;
			continue;
		}
		if (char === '%') { source += '[\\s\\S]*'; continue; }
		if (char === '_') { source += '[\\s\\S]'; continue; }
		source += escapeRegExp(char);
	}
	return new RegExp(`${source}$`, 'i').test(String(value ?? ''));
}

function matches(row, key, expr) {
	if (key === 'or') {
		const inner = expr.replace(/^\(|\)$/g, '');
		return inner.split(',').some((clause) => matchesClause(row, clause));
	}
	if (expr === 'is.null') return row[key] == null;
	if (expr === 'not.is.null') return row[key] != null;
	if (expr.startsWith('eq.')) return sameText(row[key], expr.slice(3));
	if (expr.startsWith('ilike.')) return likeMatches(row[key], expr.slice(6));
	if (expr.startsWith('gt.')) return String(row[key] ?? '') > expr.slice(3);
	if (expr.startsWith('in.(') && expr.endsWith(')')) {
		// `inFilter` quotes its values, so the quotes are stripped before the comparison.
		return expr.slice(4, -1).split(',').some((item) => sameText(row[key], unquote(item)));
	}
	throw new Error(`account store: unsupported filter ${key}=${expr}`);
}

/** The value of an `in.(…)` entry, without the quotes `inFilter` puts around it. */
function unquote(value) {
	return String(value).trim().replace(/^"(.*)"$/, '$1');
}

function matchesClause(row, clause) {
	const keyAt = clause.indexOf('.');
	const key = clause.slice(0, keyAt);
	const rest = clause.slice(keyAt + 1);
	const opAt = rest.indexOf('.');
	return matches(row, key, `${rest.slice(0, opAt)}.${rest.slice(opAt + 1)}`);
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

/** The column whose CHECK refuses the row, or null. The names are P1-1's constraint names. */
function checkViolation(row) {
	for (const [column, rule] of Object.entries(TEXT_RULES)) {
		const value = row[column];
		if (value === null || value === undefined) continue;
		const text = String(value);
		if (text.length < (rule.min ?? 0) || text.length > rule.max) return column;
		if ((rule.newline ? CONTROL_WITH_NEWLINE : CONTROL).test(text)) return column;
	}
	for (const [column, pattern] of Object.entries(PATTERN_RULES)) {
		const value = row[column];
		if (value === null || value === undefined) continue;
		if (!pattern.test(String(value))) return column;
	}
	if (Array.isArray(row.links)) {
		if (row.links.length > 4) return 'links';
		if (row.links.some((link) => !LINK.test(String(link)))) return 'links';
	}
	// Caveat: the shape only — the ISO 7064 check digit of a real ORCID is not recomputed.
	if (row.orcid !== null && row.orcid !== undefined && !ORCID_SHAPE.test(String(row.orcid))) return 'orcid';
	return null;
}

/** `jsonb_strip_nulls`: the keys whose value is null go away, the rest stay. */
function stripNulls(value) {
	if (Array.isArray(value)) return value.map(stripNulls);
	if (!value || typeof value !== 'object') return value;
	const out = {};
	for (const [key, item] of Object.entries(value)) {
		if (item === null) continue;
		out[key] = stripNulls(item);
	}
	return out;
}

export function createAccountStore({ profiles = [], settings = [], blocks = [], history = [], notifications = [], identities = [], pages = [], tasks = [], published = [], connections = [], workspaces = [], members = [], sessions = [], directory = [], fail = null } = {}) {
	const calls = [];
	const tables = new Map([
		[PROFILES, profiles.map((row) => ({ ...row }))],
		[SETTINGS, settings.map((row) => ({ ...row }))],
		[BLOCKS, blocks.map((row) => ({ ...row }))],
		[HISTORY, history.map((row) => ({ ...row }))],
		[NOTIFICATIONS, notifications.map((row) => ({ ...row }))],
		[IDENTITIES, identities.map((row) => ({ ...row }))],
		[PAGES, pages.map((row) => ({ ...row }))],
		[TASKS, tasks.map((row) => ({ ...row }))],
		[PUBLISHED, published.map((row) => ({ ...row }))],
		[CONNECTIONS, connections.map((row) => ({ ...row }))],
		[WORKSHOPS, workspaces.map((row) => ({ ...row }))],
		[MEMBERS, members.map((row) => ({ ...row }))],
		[SESSIONS, sessions.map((row) => ({ ...row }))],
		[DIRECTORY, directory.map((row) => ({ ...row }))],
	]);
	const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

	/** The rows the caller may see: the owner role sees its own rows, the service role all. */
	function visible(store, claims, table) {
		const owner = claims?.role === ACCOUNT_ROLE ? String(claims.sub ?? '').toLowerCase() : null;
		if (owner === null) return store;
		const column = OWNER_COLUMN[table] ?? 'user_id';
		return store.filter((row) => sameText(row[column], owner));
	}

	function selected(store, params, claims, table) {
		const found = visible(store, claims, table).filter((row) => [...params].every(([key, expr]) => RESERVED_PARAMS.has(key) || matches(row, key, expr)));
		const limit = params.has('limit') ? Number(params.get('limit')) : found.length;
		return found.slice(0, limit);
	}

	function mergeSettings(body, claims) {
		const section = String(body?.p_section ?? '');
		const patch = body?.p_patch && typeof body.p_patch === 'object' && !Array.isArray(body.p_patch) ? body.p_patch : {};
		const uid = String(claims?.sub ?? '').toLowerCase();
		const store = tables.get(SETTINGS);
		const row = store.find((candidate) => sameText(candidate.user_id, uid) && candidate.section === section);
		const current = row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {};
		const merged = stripNulls({ ...current, ...patch });
		if (row) {
			row.value = merged;
			row.version = Number(row.version ?? 1) + 1;
			row.updated_at = new Date().toISOString();
		} else {
			store.push({ user_id: uid, section, value: merged, version: 1, updated_at: new Date().toISOString() });
		}
		return merged;
	}

	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		const table = parsed.pathname.replace('/rest/v1/', '');
		const method = init.method ?? 'GET';
		const params = parsed.searchParams;
		const prefer = String(init.headers?.Prefer ?? '');
		const body = init.body ? JSON.parse(init.body) : undefined;
		const claims = claimsOf(init.headers);
		const call = { method, table, params, body, prefer, claims, authorization: String(init.headers?.Authorization ?? '') };
		calls.push(call);
		const failure = fail?.(call);
		if (failure) return json(failure.body ?? {}, failure.status ?? 500);
		if (table.startsWith('rpc/')) {
			if (table !== 'rpc/osionos_user_settings_merge') return json({ message: `account store: ${table} is not served` }, 404);
			return json(mergeSettings(body, claims), 200);
		}
		const store = tables.get(table);
		if (!store) return json({ message: `account store: ${table} is not served` }, 404);
		if (method === 'GET') {
			const rows = selected(store, params, claims, table)
				.map((row) => (WHOLE_ROW_TABLES.has(table) ? { ...row } : project(row, params.get('select'))));
			return json(rows, 200);
		}
		if (method === 'PATCH') {
			const hits = selected(store, params, claims, table);
			for (const row of hits) {
				const violation = checkViolation({ ...row, ...body });
				if (!violation) continue;
				// The message comes before the detail: the bridge reads the constraint name
				// out of the upstream body, and that body is truncated.
				return json({
					code: '23514',
					message: `new row for relation "osionos_profiles" violates check constraint "osionos_profiles_${violation}_check"`,
					details: 'Failing row contains (...)',
					hint: null,
				}, 400);
			}
			for (const row of hits) {
				const before = { ...row };
				Object.assign(row, body);
				// The trigger bumps the version only when the row really changed.
				if (JSON.stringify({ ...before, search_doc: null }) !== JSON.stringify({ ...row, search_doc: null })) {
					row.version = Number(before.version ?? 1) + 1;
					row.updated_at = new Date().toISOString();
				}
			}
			return prefer.includes('return=representation')
				? json(hits.map((row) => project(row, params.get('select'))), 200)
				: new Response(null, { status: 204 });
		}
		return json({ message: `account store: ${method} ${table} is not served` }, 405);
	};

	return {
		fetchImpl,
		calls,
		rows: (name) => tables.get(name) ?? [],
		callsTo: (name) => calls.filter((call) => call.table === name),
	};
}
