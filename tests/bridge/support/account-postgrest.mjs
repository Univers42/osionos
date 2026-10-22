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
 *
 * P1-2b adds the three tables its routes touch: the audit events (the rows a
 * high-risk change must leave behind), the deletion requests (the fourteen-day grace)
 * and the workspaces with their members (the successor check). The username function of
 * P1-2s is served here too, with the hold and the taken name both refused as 23505.
 */

import { randomUUID } from 'node:crypto';

const PROFILES = 'osionos_profiles';
const SETTINGS = 'osionos_user_settings';
const BLOCKS = 'osionos_user_blocks';
const HISTORY = 'osionos_username_history';
const NOTIFICATIONS = 'osionos_notifications';
const IDENTITIES = 'osionos_bridge_identities';
const DELETIONS = 'osionos_account_deletion_requests';
const AUDIT = 'osionos_bridge_audit_events';
const WORKSPACES = 'osionos_workspaces';
const MEMBERS = 'osionos_workspace_members';

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
// The gateway's rule, as P1-1's CHECK states it, and the reserved list of the same
// migration: a name the database refuses is a name the bridge never gets to send.
const USERNAME_SHAPE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{2,31}$/;
const RESERVED_NAMES = new Set([
	'admin', 'administrator', 'api', 'app', 'auth', 'help', 'login', 'logout', 'me', 'new',
	'osionos', 'p', 'root', 'settings', 'signup', 'support', 'system', 'u', 'www',
]);
const GRACE_MS = 14 * 24 * 60 * 60 * 1000;
const HOLD_MS = 90 * 24 * 60 * 60 * 1000;

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
	if (expr.startsWith('in.(') && expr.endsWith(')')) {
		return expr.slice(4, -1).split(',').some((item) => sameText(row[key], item));
	}
	throw new Error(`account store: unsupported filter ${key}=${expr}`);
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

export function createAccountStore({ profiles = [], settings = [], blocks = [], history = [], notifications = [], identities = [], deletions = [], audit = [], workspaces = [], members = [], fail = null } = {}) {
	const calls = [];
	const tables = new Map([
		[PROFILES, profiles.map((row) => ({ ...row }))],
		[SETTINGS, settings.map((row) => ({ ...row }))],
		[BLOCKS, blocks.map((row) => ({ ...row }))],
		[HISTORY, history.map((row) => ({ ...row }))],
		[NOTIFICATIONS, notifications.map((row) => ({ ...row }))],
		[IDENTITIES, identities.map((row) => ({ ...row }))],
		[DELETIONS, deletions.map((row) => ({ ...row }))],
		[AUDIT, audit.map((row) => ({ ...row }))],
		[WORKSPACES, workspaces.map((row) => ({ ...row }))],
		[MEMBERS, members.map((row) => ({ ...row }))],
	]);
	const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

	/** The rows the caller may see: the owner role sees its own rows, the service role all. */
	function visible(store, claims) {
		const owner = claims?.role === ACCOUNT_ROLE ? String(claims.sub ?? '').toLowerCase() : null;
		return store.filter((row) => owner === null || sameText(row.user_id, owner));
	}

	function selected(store, params, claims) {
		const found = visible(store, claims).filter((row) => [...params].every(([key, expr]) => RESERVED_PARAMS.has(key) || matches(row, key, expr)));
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

	/**
	 * The username function of P1-2s: one call, both tables, one transaction. A name
	 * another profile holds and a name the history still holds are both refused as
	 * 23505 — the bridge answers one body for the two, so the fake must not tell them
	 * apart either.
	 */
	function changeUsername(body, claims) {
		const uid = String(claims?.sub ?? '').toLowerCase();
		const name = String(body?.p_username ?? '');
		if (!USERNAME_SHAPE.test(name)) {
			return json({ code: '22023', message: 'the username does not match the allowed pattern' }, 400);
		}
		if (RESERVED_NAMES.has(name.toLowerCase())) {
			return json({ code: '22023', message: 'the username is reserved' }, 400);
		}
		const taken = tables.get(PROFILES).find((row) => sameText(row.username, name) && !sameText(row.user_id, uid));
		if (taken) {
			return json({ code: '23505', message: 'duplicate key value violates unique constraint "osionos_profiles_username_lower_uidx"' }, 409);
		}
		const held = tables.get(HISTORY).find((row) => sameText(row.username, name)
			&& !sameText(row.user_id, uid)
			&& Date.parse(row.released_at ?? '') > Date.now());
		if (held) {
			return json({ code: '23505', message: 'duplicate key value violates unique constraint "osionos_username_history_username_released_uidx"' }, 409);
		}
		const profile = tables.get(PROFILES).find((row) => sameText(row.user_id, uid));
		if (!profile) return json({ code: 'P0002', message: 'no profile row' }, 404);
		// The identities row is written first (P1-2s), and the profile follows it.
		const identity = tables.get(IDENTITIES).find((row) => sameText(row.user_id, uid));
		if (identity) identity.username = name;
		const before = profile.username;
		profile.username = name;
		if (before !== name) {
			profile.version = Number(profile.version ?? 1) + 1;
			profile.updated_at = new Date().toISOString();
			if (before) {
				const changedAt = new Date().toISOString();
				tables.get(HISTORY).push({
					id: randomUUID(),
					user_id: uid,
					username: before,
					changed_at: changedAt,
					released_at: new Date(Date.parse(changedAt) + HOLD_MS).toISOString(),
				});
			}
		}
		return json(name, 200);
	}

	/** The deletion request: the database sets the schedule, and the CHECK holds it. */
	function insertDeletion(body, claims) {
		const uid = String(body?.user_id ?? claims?.sub ?? '').toLowerCase();
		const requestedAt = body?.requested_at ?? new Date().toISOString();
		const scheduledFor = body?.scheduled_for ?? new Date(Date.parse(requestedAt) + GRACE_MS).toISOString();
		if (Date.parse(scheduledFor) < Date.parse(requestedAt) + GRACE_MS) {
			return json({ code: '23514', message: 'new row for relation "osionos_account_deletion_requests" violates check constraint "osionos_account_deletion_requests_scheduled_for_check"' }, 400);
		}
		const successor = body?.successor_user_id ?? null;
		if (successor && sameText(successor, uid)) {
			return json({ code: '23514', message: 'new row for relation "osionos_account_deletion_requests" violates check constraint "osionos_account_deletion_requests_successor_user_id_check"' }, 400);
		}
		const store = tables.get(DELETIONS);
		if (store.some((row) => sameText(row.user_id, uid))) {
			return json({ code: '23505', message: 'duplicate key value violates unique constraint "osionos_account_deletion_requests_pkey"' }, 409);
		}
		const row = { user_id: uid, requested_at: requestedAt, scheduled_for: scheduledFor, successor_user_id: successor };
		store.push(row);
		// PostgREST answers an insert with the rows it wrote, as an array.
		return json([row], 200);
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
			if (table === 'rpc/osionos_user_settings_merge') return json(mergeSettings(body, claims), 200);
			if (table === 'rpc/osionos_account_change_username') return changeUsername(body, claims);
			return json({ message: `account store: ${table} is not served` }, 404);
		}
		const store = tables.get(table);
		if (!store) return json({ message: `account store: ${table} is not served` }, 404);
		if (method === 'GET') {
			const rows = selected(store, params, claims).map((row) => project(row, params.get('select')));
			return json(rows, 200);
		}
		if (method === 'POST') {
			if (table === DELETIONS) {
				const answer = insertDeletion(body, claims);
				if (answer.status !== 200) return answer;
				return prefer.includes('return=representation') ? answer : new Response(null, { status: 204 });
			}
			if (table === AUDIT) {
				store.push({ ...body });
				return prefer.includes('return=representation') ? json(body, 200) : new Response(null, { status: 204 });
			}
			return json({ message: `account store: ${method} ${table} is not served` }, 405);
		}
		if (method === 'DELETE') {
			for (const row of selected(store, params, claims)) {
				store.splice(store.indexOf(row), 1);
			}
			return new Response(null, { status: 204 });
		}
		if (method === 'PATCH') {
			const hits = selected(store, params, claims);
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
