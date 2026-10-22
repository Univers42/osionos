/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-profile.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The typed profile of the account plane: the caller's own row, the write that carries an
 * If-Match, and the public card of a person looked up by handle.
 *
 * The rows live in public.osionos_profiles (P1-1). The owner reads and writes them through
 * `pg.asUser(session)` — ADR 0001: the account role's row-level security is
 * `user_id = osionos_account_uid()`, so a route that forgets its filter still cannot read
 * another user's row. The public card is read through the service role, because another
 * person's row is not the caller's.
 *
 * The write carries an If-Match: the row has a version, the write filters on it, and a row
 * that moved answers 412 with the row as it is now, so two devices never overwrite each
 * other in silence. The answers are the resource itself — the profile is the row, the card
 * is the card — and an error never carries a word of the database's.
 *
 * The legacy `PATCH /api/profile/me` and `GET /api/profile/:uuid` keep answering as they
 * did; P2-1 (the public profile) or P1-6 (the account UI) is what retires them.
 *
 * Caveat: the profile row is created by a trigger on public.users, so a user who
 * registered before that trigger existed has no row: the route answers 404
 * `profile_missing` and the next boot's backfill heals it.
 */

import { rateLimit } from './bridge-guard.mjs';
import { bearerToken, blockedViewerBy, readJsonBody, safeText, sendJson } from './bridge-social-core.mjs';

const PROFILE_PATH = '/api/account/profile';
const USERS_PREFIX = '/api/users/';
const PROFILE_LIMIT = 60;
const PROFILE_WINDOW_MS = 60_000;
const PROFILE_BODY_LIMIT = 16 * 1024;
const USERNAME_SHAPE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{2,31}$/;

const accountError = (status, code, message, extra) => Object.assign(new Error(message), { status, code }, extra);

/** The wire name of a database column. */
function camelCase(column) {
	return column.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// The columns the account role may select (P1-1's grant), camelCased for the wire.
const OWNER_COLUMNS = [
	'user_id', 'display_name', 'username', 'pronouns', 'headline', 'bio', 'location', 'company',
	'website', 'links', 'timezone', 'orcid', 'patreon', 'avatar_url', 'banner_url', 'directory_opt_out',
	'version', 'created_at', 'updated_at', 'search_doc',
];

// The public card: the allowlist. The email, the settings, the deletion state, the
// directory opt-out and the version never leave through it.
const CARD_COLUMNS = [
	'user_id', 'username', 'display_name', 'pronouns', 'headline', 'bio', 'location', 'company',
	'website', 'links', 'timezone', 'orcid', 'patreon', 'avatar_url', 'banner_url',
];

// The reduced card: what a viewer who may not see the whole profile gets.
const REDUCED_CARD_COLUMNS = ['user_id', 'username', 'display_name', 'avatar_url'];

// The columns the account role may UPDATE, minus `username` (P1-2b owns the rename).
const EDITABLE_COLUMNS = [
	'display_name', 'pronouns', 'headline', 'bio', 'location', 'company', 'website', 'links',
	'timezone', 'orcid', 'patreon', 'directory_opt_out',
];
const EDITABLE = new Map(EDITABLE_COLUMNS.map((column) => [camelCase(column), column]));
const FIELD_BY_COLUMN = new Map(EDITABLE_COLUMNS.map((column) => [column, camelCase(column)]));
const OWNER_SELECT = OWNER_COLUMNS.join(',');
const CARD_SELECT = `${CARD_COLUMNS.join(',')},directory_opt_out`;

function camelRow(row, columns) {
	const out = {};
	for (const column of columns) out[camelCase(column)] = row?.[column] ?? null;
	return out;
}

function respondWithError(response, error, config) {
	const status = Number.isInteger(error?.status) ? error.status : 500;
	const code = typeof error?.code === 'string' && /^[a-z][a-z0-9_]*$/.test(error.code) ? error.code : 'profile_request_failed';
	const body = { ok: false, message: error instanceof Error ? error.message : 'The profile request failed.', code };
	for (const key of ['field', 'version', 'profile']) if (error?.[key] !== undefined) body[key] = error[key];
	if (Number.isFinite(error?.retryAfterSeconds)) {
		body.retryAfterSeconds = error.retryAfterSeconds;
		response.setHeader('retry-after', String(error.retryAfterSeconds));
	}
	return sendJson(response, status, body, config);
}

function callerSession(request, config, verifySession) {
	try {
		return verifySession(bearerToken(request), config);
	} catch (error) {
		if (error?.status === 401 && !error?.code) throw accountError(401, 'not_authenticated', error?.message ?? 'An app session is required.');
		throw error;
	}
}

async function readProfileBody(request) {
	try {
		return await readJsonBody(request, PROFILE_BODY_LIMIT);
	} catch (error) {
		if (error?.status === 413) throw accountError(413, 'payload_too_large', 'The profile body is larger than 16 KB.');
		if (error?.status === 400) throw accountError(400, 'invalid_json', 'The request body must be JSON.');
		throw error;
	}
}

/** The version the client says it holds; a write without one is refused. */
function ifMatchVersion(request) {
	const raw = String(request.headers['if-match'] ?? request.headers['If-Match'] ?? '').trim();
	if (raw === '') throw accountError(428, 'precondition_required', 'An If-Match header with the profile version is required.');
	const version = raw.replace(/^W\//i, '').replace(/^"(.*)"$/, '$1').trim();
	if (!/^\d+$/.test(version)) throw accountError(400, 'invalid_if_match', 'The If-Match header must hold the profile version.');
	return Number(version);
}

function editableUpdate(payload) {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		throw accountError(422, 'invalid_body', 'The profile update must be a JSON object.');
	}
	const update = {};
	for (const [key, value] of Object.entries(payload)) {
		const column = EDITABLE.get(key);
		if (!column) throw accountError(422, 'field_not_editable', `The field "${key}" cannot be edited through this route.`, { field: key });
		update[column] = value;
	}
	return update;
}

// The CHECK constraints of P1-1 are named after their column, so the column is read out of
// the constraint name and never out of the database's own message. The upstream body is
// JSON, so the quote around the name is escaped there.
const CONSTRAINT_NAME = /check constraint \\?"([a-z0-9_]*)/;

function fieldOfConstraint(text) {
	const match = CONSTRAINT_NAME.exec(String(text ?? ''));
	if (!match) return null;
	const name = match[1].replace(/^osionos_profiles_/, '');
	const column = name.replace(/_check\d*$/, '');
	if (FIELD_BY_COLUMN.has(column)) return FIELD_BY_COLUMN.get(column);
	// The upstream body is cut short, so the name may be a prefix: the column whose
	// constraint name starts with what is left of it is the one the database refused.
	for (const [field, candidate] of EDITABLE) {
		if (`${candidate}_check`.startsWith(name)) return field;
	}
	return null;
}

function writeFailure(error) {
	const upstream = String(error?.upstreamCode ?? '');
	if (upstream === '23514') {
		const field = fieldOfConstraint(error?.upstreamText);
		return accountError(422, 'invalid_field', field ? `The field "${field}" is not valid.` : 'One of the values is not valid.', { field });
	}
	if (upstream === '23505') return accountError(409, 'profile_conflict', 'That value conflicts with another profile.');
	return error;
}

async function readOwnRow(pg, session) {
	const params = new URLSearchParams({ user_id: `eq.${session.userId}`, select: OWNER_SELECT, limit: '1' });
	const rows = await pg.asUser(session).get(`osionos_profiles?${params}`);
	return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function getOwnProfile(pg, session, response, config) {
	const row = await readOwnRow(pg, session);
	if (!row) throw accountError(404, 'profile_missing', 'This account has no profile row yet.');
	const profile = camelRow(row, OWNER_COLUMNS);
	response.setHeader('ETag', `"${Number(profile.version ?? 0)}"`);
	return sendJson(response, 200, profile, config);
}

async function patchOwnProfile({ pg, kv }, session, request, response, config) {
	await rateLimit(kv, ['profile', session.userId], { limit: PROFILE_LIMIT, windowMs: PROFILE_WINDOW_MS });
	const expected = ifMatchVersion(request);
	const update = editableUpdate(await readProfileBody(request));
	const params = new URLSearchParams({ user_id: `eq.${session.userId}`, version: `eq.${expected}` });
	let rows;
	try {
		rows = await pg.asUser(session).patch(`osionos_profiles?${params}`, update, { prefer: 'return=representation' });
	} catch (error) {
		throw writeFailure(error);
	}
	if (!Array.isArray(rows) || rows.length === 0) {
		const current = await readOwnRow(pg, session);
		if (!current) throw accountError(404, 'profile_missing', 'This account has no profile row yet.');
		throw accountError(412, 'version_mismatch', 'The profile changed since you loaded it.', {
			version: Number(current.version ?? 0),
			profile: camelRow(current, OWNER_COLUMNS),
		});
	}
	const profile = camelRow(rows[0], OWNER_COLUMNS);
	response.setHeader('ETag', `"${Number(profile.version ?? 0)}"`);
	return sendJson(response, 200, profile, config);
}

/**
 * The service-role fetch the shared helpers expect, backed by the account plane's service
 * client. `blockedViewerBy` builds its own URL and headers, so this replays that request
 * through `pg.asService()`: the bridge's injected transport answers it, and the block
 * semantics stay in the one place that owns them.
 */
function serviceFetch(pg) {
	return async (url) => {
		const raw = String(url);
		const at = raw.indexOf('/rest/v1/');
		const path = at === -1 ? raw : raw.slice(at + '/rest/v1/'.length);
		try {
			const data = await pg.asService().get(path);
			return new Response(data === null ? '' : JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
		} catch (error) {
			return new Response(String(error?.upstreamText ?? ''), { status: Number(error?.upstreamStatus ?? 502) });
		}
	};
}

async function hiddenFromViewer(config, pg, viewerId, subjectId) {
	try {
		const hidden = await blockedViewerBy(config, serviceFetch(pg), viewerId);
		return hidden.has(subjectId);
	} catch {
		// The block list is the one thing that hides a person from a viewer, so a failure
		// fails the request: the full card would hand out what a block hides.
		throw accountError(503, 'account_plane_unavailable', 'The account plane is unavailable.');
	}
}

/** The username may hold `_`, and `_` is a wildcard in LIKE, so the name is escaped: an
 *  unescaped `_` would match any character and answer for a name nobody asked for. The
 *  `ilike` is the case-insensitive match P1-1's `lower(username)` index serves. */
function escapeLike(name) {
	return name.replace(/([\\%_])/g, '\\$1');
}

function decodeName(pathname) {
	try {
		return decodeURIComponent(pathname.slice(USERS_PREFIX.length));
	} catch {
		return '';
	}
}

async function lookupUser({ config, pg, session }, rawName, response) {
	const name = safeText(rawName, 64);
	// A name the migration would refuse is a name nobody holds, and it answers like one.
	if (!USERNAME_SHAPE.test(name)) throw accountError(404, 'user_not_found', 'No user carries that name.');
	const params = new URLSearchParams({ username: `ilike.${escapeLike(name)}`, select: CARD_SELECT, limit: '5' });
	const rows = await pg.asService().get(`osionos_profiles?${params}`);
	const row = (Array.isArray(rows) ? rows : [])
		.find((candidate) => safeText(candidate?.username, 64).toLowerCase() === name.toLowerCase());
	if (!row) {
		// A name held in the username history misses this lookup exactly like a name
		// nobody ever took, and it answers like one: the route never reads the history,
		// so there is no "this name was taken" oracle to leak.
		throw accountError(404, 'user_not_found', 'No user carries that name.');
	}
	const subject = safeText(row.user_id, 80).toLowerCase();
	const reduced = subject !== session.userId
		&& (row.directory_opt_out === true || await hiddenFromViewer(config, pg, session.userId, subject));
	return sendJson(response, 200, camelRow(row, reduced ? REDUCED_CARD_COLUMNS : CARD_COLUMNS), config);
}

/**
 * The account routes of this module: GET and PATCH /api/account/profile, and
 * GET /api/users/:username. It answers true when it handled the request and false when the
 * path is not its own.
 */
export function createAccountProfileRoutes({ config, pg, kv, verifySession }) {
	return async function handleAccountProfile(url, request, response) {
		const pathname = url.pathname;
		const method = (request.method || 'GET').toUpperCase();
		const isProfile = pathname === PROFILE_PATH;
		const isUser = pathname.startsWith(USERS_PREFIX);
		if (!isProfile && !isUser) return false;
		try {
			const session = callerSession(request, config, verifySession);
			if (isProfile) {
				if (method === 'GET') return await getOwnProfile(pg, session, response, config);
				if (method === 'PATCH') return await patchOwnProfile({ pg, kv }, session, request, response, config);
			} else if (method === 'GET') {
				return await lookupUser({ config, pg, session }, decodeName(pathname), response);
			}
			throw accountError(405, 'method_not_allowed', `Method ${method} is not supported on this route.`);
		} catch (error) {
			return respondWithError(response, error, config);
		}
	};
}
