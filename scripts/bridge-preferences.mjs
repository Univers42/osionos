/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-preferences.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The settings sections of the account plane: `/api/preferences` is the `preferences`
 * section, `/api/account/notification-settings` is the `notifications` one and
 * `/api/account/moderation-settings` is the `moderation` one (interaction limits: GET and
 * PATCH only, the bridge turns a duration into an absolute `until` on its own clock, and a
 * PATCH to an interaction replaces its whole entry). Nothing else is exposed — a path under one of them that is not the section answers 404.
 *
 * The write goes through the database's merge function (`osionos_user_settings_merge`),
 * which the caller runs as itself: the merge is one statement, so two writes to one section
 * both land, where a read-modify-write in the bridge would lose one of them. A `null` in
 * the patch deletes a key.
 *
 * PUT replaces the section: the object the client sends, plus a `null` for every key it
 * dropped. Neither store sends a full object with PUT today — `useUserPreferencesStore`
 * reads and patches `/api/preferences` (and posts to `/api/preferences/reset`),
 * `useNotificationSettingsStore` reads and patches its own section and puts a single page
 * override — so the replace shape is here for the contract, not for a caller.
 *
 * Caveat: the database holds a section in 16 KB and the body limit is the same number, so
 * a body that fits the bridge may still be refused by the CHECK once the keys grow.
 */

import { rateLimit } from './bridge-guard.mjs';
import { bearerToken, readJsonBody, sendJson } from './bridge-social-core.mjs';
import { MODERATION_SECTION, normaliseModerationPatch } from './bridge-moderation-core.mjs';

const ALL_METHODS = ['GET', 'PATCH', 'PUT'];
const SECTIONS = new Map([
	['/api/preferences', { section: 'preferences', prepare: normaliseVigilantMode }],
	['/api/account/notification-settings', { section: 'notifications' }],
	['/api/account/moderation-settings', { section: MODERATION_SECTION, methods: ['GET', 'PATCH'], prepare: normaliseModerationPatch }],
]);
const SECTION_BODY_LIMIT = 16 * 1024;
const SETTINGS_LIMIT = 120;
const SETTINGS_WINDOW_MS = 60_000;

/** `vigilantMode` is the only preferences key this checks (boolean or null to clear); every other key passes untouched. */
function normaliseVigilantMode(body) {
	const value = body.vigilantMode;
	if (value !== undefined && value !== null && typeof value !== 'boolean') {
		throw accountError(422, 'invalid_body', 'vigilantMode must be true or false.');
	}
	return body;
}

function accountError(status, code, message, extra) {
	return Object.assign(new Error(message), { status, code }, extra);
}

function respondWithError(response, error, config) {
	const status = Number.isInteger(error?.status) ? error.status : 500;
	const code = typeof error?.code === 'string' && /^[a-z][a-z0-9_]*$/.test(error.code) ? error.code : 'settings_request_failed';
	const body = { ok: false, message: error instanceof Error ? error.message : 'The settings request failed.', code };
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

async function readSectionBody(request) {
	let payload;
	try {
		payload = await readJsonBody(request, SECTION_BODY_LIMIT);
	} catch (error) {
		if (error?.status === 413) throw accountError(413, 'payload_too_large', 'The settings body is larger than 16 KB.');
		if (error?.status === 400) throw accountError(400, 'invalid_json', 'The request body must be JSON.');
		throw error;
	}
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		throw accountError(422, 'invalid_body', 'The settings body must be a JSON object.');
	}
	return payload;
}

async function readSection(pg, session, section) {
	const params = new URLSearchParams({ section: `eq.${section}`, select: 'value', limit: '1' });
	const rows = await pg.asUser(session).get(`osionos_user_settings?${params}`);
	const value = Array.isArray(rows) && rows.length > 0 ? rows[0]?.value : null;
	return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function mergeSection(pg, session, section, patch) {
	const merged = await pg.asUser(session).rpc('osionos_user_settings_merge', { p_section: section, p_patch: patch });
	return merged && typeof merged === 'object' && !Array.isArray(merged) ? merged : {};
}

async function getSection(pg, session, section, response, config) {
	return sendJson(response, 200, await readSection(pg, session, section), config);
}

async function patchSection(pg, session, { section, prepare }, request, response, config) {
	const body = await readSectionBody(request);
	const patch = prepare ? prepare(body) : body;
	return sendJson(response, 200, await mergeSection(pg, session, section, patch), config);
}

async function putSection(pg, session, { section, prepare }, request, response, config) {
	const sent = await readSectionBody(request);
	const body = prepare ? prepare(sent) : sent;
	const current = await readSection(pg, session, section);
	const patch = { ...body };
	for (const key of Object.keys(current)) if (!Object.hasOwn(patch, key)) patch[key] = null;
	return sendJson(response, 200, await mergeSection(pg, session, section, patch), config);
}

/**
 * The settings routes of this module: GET, PATCH and PUT on the section paths (PUT not on the moderation one). It
 * answers true when it handled the request and false when the path is not its own.
 */
export function createPreferencesRoutes({ config, pg, kv, verifySession }) {
	return async function handlePreferences(url, request, response) {
		const pathname = url.pathname;
		const method = (request.method || 'GET').toUpperCase();
		const entry = SECTIONS.get(pathname);
		const underSection = [...SECTIONS.keys()].some((base) => pathname.startsWith(`${base}/`));
		if (!entry && !underSection) return false;
		try {
			const session = callerSession(request, config, verifySession);
			if (!entry) throw accountError(404, 'section_not_found', 'There is no settings section on that path.');
			await rateLimit(kv, ['settings', session.userId], { limit: SETTINGS_LIMIT, windowMs: SETTINGS_WINDOW_MS });
			const { section } = entry;
			if (!(entry.methods ?? ALL_METHODS).includes(method)) throw accountError(405, 'method_not_allowed', `Method ${method} is not supported on this route.`);
			if (method === 'GET') return await getSection(pg, session, section, response, config);
			if (method === 'PATCH') return await patchSection(pg, session, entry, request, response, config);
			if (method === 'PUT') return await putSection(pg, session, entry, request, response, config);
			throw accountError(405, 'method_not_allowed', `Method ${method} is not supported on this route.`);
		} catch (error) {
			return respondWithError(response, error, config);
		}
	};
}
