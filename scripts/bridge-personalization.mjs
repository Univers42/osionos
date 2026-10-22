/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-personalization.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The user's switch over the recommender's log, and their activity to clear
 * or download (C48, C54).
 *
 * The state lives where the server reads it: `ai_personalization_settings`
 * (models/osionos-user-events-migration.sql), never in the request body. A
 * `userId` in the body is IGNORED — the row is written for the verified
 * session's user, always. The capture triggers read that row, so one request
 * after the switch stops the collection.
 *
 * Routes (every one of them needs a verified session and spends one token of
 * the caller's bucket BEFORE any read or write):
 *   GET    /api/personalization            { ok, captureExplicit }  (no row → true)
 *   PUT    /api/personalization            { captureExplicit: boolean } → upsert
 *   GET    /api/personalization/activity   { ok, events }   — the user's own log
 *   DELETE /api/personalization/activity   { ok, erased }   — the user's own log, gone
 *
 * The log itself is read and erased by the DATABASE, through two functions the
 * migration creates: ai_export_user(p_user) and ai_erase_user(p_user). The
 * bridge names the user, never the caller: `p_user` is the session's user.
 *
 * There is NO view beacon here, and no consent toggle for one: the capture
 * covers the explicit actions only.
 */

import { takeToken } from './bridge-ratelimit.mjs';
import {
	bearerToken,
	httpError,
	readJsonBody,
	rest,
	sendJson,
} from './bridge-social-core.mjs';

const SETTINGS_TABLE = 'ai_personalization_settings';

/** Twenty calls a minute, per user, burst included. */
const RATE = { capacity: 20, refillPerSec: 1 };

/** The switch the row holds: the default (on) when there is no row yet. */
async function readSetting(deps, config, userId) {
	const rows = await rest(config, deps.fetchImpl, `${SETTINGS_TABLE}?user_id=eq.${userId}&select=capture_explicit&limit=1`);
	const row = Array.isArray(rows) ? rows[0] : null;
	// No row = the defaults = capture on. A row that does not say a boolean is
	// no answer either, so it reads as the default too.
	return row && typeof row.capture_explicit === 'boolean' ? row.capture_explicit : true;
}

/** The switch, upserted for the SESSION user — never for one the body names. */
async function writeSetting(deps, config, userId, captureExplicit) {
	await rest(config, deps.fetchImpl, `${SETTINGS_TABLE}?on_conflict=user_id`, {
		method: 'POST',
		body: {
			user_id: userId,
			capture_explicit: captureExplicit,
			updated_at: new Date().toISOString(),
		},
		prefer: 'resolution=merge-duplicates,return=representation',
	});
	return captureExplicit;
}

/** The body keys that never name the row: the session's user does. */
const IGNORED_BODY_KEYS = new Set(['userId', 'user_id']);

/**
 * The body: `captureExplicit`, and a boolean. A user id may ride along — it is
 * IGNORED, because the row is the session user's and never the body's to name
 * — but any OTHER key is refused: the switch has one shape.
 */
function captureFromBody(payload) {
	const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
	const keys = body ? Object.keys(body) : [];
	if (!body || keys.some((key) => key !== 'captureExplicit' && !IGNORED_BODY_KEYS.has(key))) {
		throw httpError('captureExplicit must be a boolean.', 422);
	}
	if (typeof body.captureExplicit !== 'boolean') {
		throw httpError('captureExplicit must be a boolean.', 422);
	}
	return body.captureExplicit;
}

/** The user's own log, oldest first, as the database stores it. */
async function exportActivity(deps, config, userId) {
	const rows = await rest(config, deps.fetchImpl, 'rpc/ai_export_user', {
		method: 'POST',
		body: { p_user: userId },
	});
	return Array.isArray(rows) ? rows : [];
}

/** The erasure: the database drops the rows and answers how many it dropped. */
async function eraseActivity(deps, config, userId) {
	const count = await rest(config, deps.fetchImpl, 'rpc/ai_erase_user', {
		method: 'POST',
		body: { p_user: userId },
	});
	const erased = Number(count);
	return Number.isFinite(erased) ? erased : 0;
}

/**
 * Build the /api/personalization dispatcher: `await handler(url, request, response)`
 * → true when handled. deps: { config, verifySession, fetchImpl? }.
 */
export function createPersonalizationHandler({ config, verifySession, fetchImpl = fetch }) {
	const deps = { fetchImpl };
	return async function handlePersonalizationRoute(url, request, response, requestConfig = config) {
		const pathname = url.pathname;
		const isActivity = pathname === '/api/personalization/activity';
		if (pathname !== '/api/personalization' && !isActivity) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			// The limit is charged before ANY read: a caller must not be able to
			// read the log for free, and a burst of reads is the one thing the
			// export route must not be.
			takeToken(`personalization:${session.userId}`, RATE);
			if (isActivity) {
				if (method === 'GET') {
					const events = await exportActivity(deps, requestConfig, session.userId);
					return sendJson(response, 200, { ok: true, events }, requestConfig);
				}
				if (method === 'DELETE') {
					const erased = await eraseActivity(deps, requestConfig, session.userId);
					return sendJson(response, 200, { ok: true, erased }, requestConfig);
				}
				return sendJson(response, 405, { ok: false, message: `Method ${method} is not supported here.` }, requestConfig);
			}
			if (method === 'GET') {
				const captureExplicit = await readSetting(deps, requestConfig, session.userId);
				return sendJson(response, 200, { ok: true, captureExplicit }, requestConfig);
			}
			if (method === 'PUT') {
				const captureExplicit = captureFromBody(await readJsonBody(request));
				await writeSetting(deps, requestConfig, session.userId, captureExplicit);
				return sendJson(response, 200, { ok: true, captureExplicit }, requestConfig);
			}
			return sendJson(response, 405, { ok: false, message: `Method ${method} is not supported here.` }, requestConfig);
		} catch (error) {
			return sendJson(response, error?.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Personalization request failed.' }, requestConfig);
		}
	};
}
