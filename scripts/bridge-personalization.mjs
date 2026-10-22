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
 *   GET    /api/personalization            { ok, captureExplicit, beaconConsent }  (no row → true / false)
 *   PUT    /api/personalization            { captureExplicit?: boolean, beaconConsent?: boolean } → upsert
 *   GET    /api/personalization/activity   { ok, events, derived } — the log + what was made of it
 *   DELETE /api/personalization/activity   { ok, erased }   — the user's own log, gone
 *
 * The log itself is read and erased by the DATABASE, through functions the
 * migration creates: ai_export_user(p_user) and ai_erase_user(p_user). The
 * bridge names the user, never the caller: `p_user` is the session's user.
 *
 * A THIRD function reads what was DERIVED from the user: ai_rec_export_user
 * (p_user) answers the vectors the recommender computed out of that log — a
 * download that leaves out the data derived from the user is not the user's
 * data. The groot slice adds it, so it may not be there yet: a 404
 * (PostgREST's PGRST202 for an RPC that does not exist) is an empty answer,
 * never a broken download.
 *
 * There is NO view beacon here: the capture covers the explicit actions only.
 * The beacon of the recommender has its own switch, `beaconConsent`, and it is
 * OFF by default (C48): no row = no beacon, and the write of the beacon reads
 * this row before anything else.
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

/** The row of the user: the two switches, as they are stored. */
async function readRow(deps, config, userId) {
	const rows = await rest(config, deps.fetchImpl, `${SETTINGS_TABLE}?user_id=eq.${userId}&select=capture_explicit,beacon_consent&limit=1`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** The switch over the explicit actions: the default (on) when there is no row. */
function captureOf(row) {
	return row && typeof row.capture_explicit === 'boolean' ? row.capture_explicit : true;
}

/** The switch over the beacon: OFF when there is no row (C48 — it is opt-in). */
function beaconOf(row) {
	return row && typeof row.beacon_consent === 'boolean' ? row.beacon_consent : false;
}

/**
 * The switch(es), upserted for the SESSION user — never for one the body
 * names — and ONLY the ones the body carried: a row that does not mention
 * the beacon keeps the beacon it had.
 */
async function writeSetting(deps, config, userId, settings) {
	const body = { user_id: userId, updated_at: new Date().toISOString() };
	if (typeof settings.captureExplicit === 'boolean') body.capture_explicit = settings.captureExplicit;
	if (typeof settings.beaconConsent === 'boolean') body.beacon_consent = settings.beaconConsent;
	await rest(config, deps.fetchImpl, `${SETTINGS_TABLE}?on_conflict=user_id`, {
		method: 'POST',
		body,
		prefer: 'resolution=merge-duplicates,return=representation',
	});
	return settings;
}

/** The body keys that never name the row: the session's user does. */
const IGNORED_BODY_KEYS = new Set(['userId', 'user_id']);

/**
 * The body: `captureExplicit` and/or `beaconConsent`, both booleans. A user
 * id may ride along — it is IGNORED, because the row is the session user's and
 * never the body's to name — but any OTHER key is refused: the switches have
 * one shape.
 */
function switchesFromBody(payload) {
	const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
	const keys = body ? Object.keys(body) : [];
	const known = new Set(['captureExplicit', 'beaconConsent']);
	if (!body || keys.some((key) => !known.has(key) && !IGNORED_BODY_KEYS.has(key))) {
		throw httpError('captureExplicit must be a boolean.', 422);
	}
	if ('captureExplicit' in body && typeof body.captureExplicit !== 'boolean') {
		throw httpError('captureExplicit must be a boolean.', 422);
	}
	if ('beaconConsent' in body && typeof body.beaconConsent !== 'boolean') {
		throw httpError('beaconConsent must be a boolean.', 422);
	}
	if (typeof body.captureExplicit !== 'boolean' && typeof body.beaconConsent !== 'boolean') {
		throw httpError('captureExplicit must be a boolean.', 422);
	}
	const switches = {};
	if (typeof body.captureExplicit === 'boolean') switches.captureExplicit = body.captureExplicit;
	if (typeof body.beaconConsent === 'boolean') switches.beaconConsent = body.beaconConsent;
	return switches;
}

/** The user's own log, oldest first, as the database stores it. */
async function exportActivity(deps, config, userId) {
	const rows = await rest(config, deps.fetchImpl, 'rpc/ai_export_user', {
		method: 'POST',
		body: { p_user: userId },
	});
	return Array.isArray(rows) ? rows : [];
}

/**
 * The vectors DERIVED from the user: one per model, and the ones where the
 * user is a suggested person. The database answers them as one JSONB object.
 *
 * A 404 is the function not being deployed yet — the bridge ships before the
 * migration does, and the download must survive that — so it answers null.
 * Every other failure is a real one and propagates, exactly as the log's own
 * read does: a broken vectors read is a broken download, not a silent one.
 */
async function exportDerived(deps, config, userId) {
	try {
		return await rest(config, deps.fetchImpl, 'rpc/ai_rec_export_user', {
			method: 'POST',
			body: { p_user: userId },
		});
	} catch (error) {
		if (error?.status === 404) return null;
		throw error;
	}
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
					// One token, two reads, in parallel: the log itself and the
					// vectors derived from it. Both name the SESSION user.
					const [events, derived] = await Promise.all([
						exportActivity(deps, requestConfig, session.userId),
						exportDerived(deps, requestConfig, session.userId),
					]);
					return sendJson(response, 200, { ok: true, events, derived: { factors: derived } }, requestConfig);
				}
				if (method === 'DELETE') {
					const erased = await eraseActivity(deps, requestConfig, session.userId);
					return sendJson(response, 200, { ok: true, erased }, requestConfig);
				}
				return sendJson(response, 405, { ok: false, message: `Method ${method} is not supported here.` }, requestConfig);
			}
			if (method === 'GET') {
				const row = await readRow(deps, requestConfig, session.userId);
				return sendJson(response, 200, { ok: true, captureExplicit: captureOf(row), beaconConsent: beaconOf(row) }, requestConfig);
			}
			if (method === 'PUT') {
				const switches = switchesFromBody(await readJsonBody(request));
				// The row is read first: the answer is the state the row holds
				// after the write, and only the switches the body carried are
				// written — the other one keeps what it had.
				const row = await readRow(deps, requestConfig, session.userId);
				await writeSetting(deps, requestConfig, session.userId, switches);
				return sendJson(response, 200, {
					ok: true,
					captureExplicit: typeof switches.captureExplicit === 'boolean' ? switches.captureExplicit : captureOf(row),
					beaconConsent: typeof switches.beaconConsent === 'boolean' ? switches.beaconConsent : beaconOf(row),
				}, requestConfig);
			}
			return sendJson(response, 405, { ok: false, message: `Method ${method} is not supported here.` }, requestConfig);
		} catch (error) {
			return sendJson(response, error?.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Personalization request failed.' }, requestConfig);
		}
	};
}
