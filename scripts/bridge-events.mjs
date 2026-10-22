/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-events.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The beacon of "For you": the impressions and the clicks the client reports,
 * written for the recommender's click-through to be measured at all.
 *
 *   POST /api/events/beacon   { slate, events: [{ event, pageId }] }
 *
 * A BRIDGE route, never under /api/ai/ (C49, fact 17): the client keeps the
 * token in the Authorization header and nowhere else.
 *
 * THE CONSENT COMES FIRST (C48)
 *   The beacon is opt-in: `ai_personalization_settings.beacon_consent` of the
 *   SESSION user decides, and no row means no. A user who did not say yes
 *   gets a 204 and NOTHING else is read or written — no page read, no RPC.
 *   A `consent: true` in the body is ignored: the consent lives where the
 *   bridge reads it, never in the request.
 *
 * THE SLATE AND THE READ RULES VOUCH FOR EVERY EVENT (C49)
 *   The slate the client carries is the one the bridge itself signed, for
 *   THIS user, less than an hour ago: the rank of a page is the rank it held
 *   in that slate, never a number the body names. A page that was not in the
 *   slate is dropped. The pages that survive are read in ONE batched query
 *   and filtered by the caller's own read rules (canReadPageRowAsMember with
 *   one membership read): a private page, an archived one, a ghost uuid and a
 *   page the caller owns are all dropped — never an error, never a row.
 *
 * THE WRITE
 *   One call to the database function ai_events_beacon(p_user, p_events): the
 *   database re-checks the consent, the hour bucket, the daily cap and the
 *   rank, and writes one row per page, event, surface and hour. Its refusals
 *   are answers, not crashes: 22023 is a 400, 54000 (the daily cap) a 429,
 *   anything else a 503 — logged once, with no token and no id in the log.
 *
 * THE ROUTE ORDER
 *   The flag first (404 before the session, so a caller without a token cannot
 *   tell a disabled beacon from a missing one), then the session, then the
 *   bucket (429 + Retry-After, charged before any read), then the method, the
 *   body, the consent, the slate, the ACL and the write.
 */

import { takeToken } from './bridge-ratelimit.mjs';
import { recsEnabled } from './bridge-recs.mjs';
import { readablePages, readPages } from './bridge-recs-pages.mjs';
import { verifySlate } from './bridge-recs-slate.mjs';
import { UUID_REGEX, bearerToken, readJsonBody, rest, sendJson } from './bridge-social-core.mjs';

/** The one route of this module. */
const BEACON_PATH = '/api/events/beacon';

/** Twenty calls, then one every five seconds: the beacon is not a firehose. */
const RATE = { capacity: 20, refillPerSec: 0.2 };

/** The body: at most fifty events (the database refuses more) and 16 KB. */
const MAX_EVENTS = 50;

/** The row that holds the user's switch. */
const SETTINGS_TABLE = 'ai_personalization_settings';

/** The two events of the beacon. */
const EVENT_KINDS = new Set(['impression', 'click']);

/** The message of an error, or a word that says nothing about it. */
function messageOf(error) {
	return error instanceof Error ? error.message : 'unknown error';
}

/**
 * The consent of the SESSION user: false means nothing is written for them,
 * and no row means the same — the beacon is opt-in (C48).
 */
async function beaconConsent(deps, config, userId) {
	const rows = await rest(config, deps.fetchImpl, `${SETTINGS_TABLE}?user_id=eq.${userId}&select=beacon_consent&limit=1`);
	const row = Array.isArray(rows) ? rows[0] : null;
	return row && typeof row.beacon_consent === 'boolean' ? row.beacon_consent : false;
}

/**
 * The body: the slate, and the events. Unknown keys are ignored, and a
 * userId/ts/consent in the body is ignored too — the server names the user.
 * A shape that is not the shape is a 400.
 */
function parseBody(body) {
	const source = body && typeof body === 'object' && !Array.isArray(body) ? body : null;
	const slate = typeof source?.slate === 'string' ? source.slate : '';
	const list = Array.isArray(source?.events) ? source.events : [];
	if (slate === '' || list.length < 1 || list.length > MAX_EVENTS) return null;
	const events = [];
	for (const entry of list) {
		const one = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : null;
		const event = String(one?.event ?? '');
		const pageId = String(one?.pageId ?? '').toLowerCase();
		if (!EVENT_KINDS.has(event) || !UUID_REGEX.test(pageId)) return null;
		events.push({ event, pageId });
	}
	return { slate, events };
}

/** The answer of a user who did not consent: nothing, and nothing said. */
function sendNoContent(response, config) {
	response.writeHead(204, {
		'cache-control': 'no-store',
		'access-control-allow-origin': config.allowedOrigin,
		'access-control-allow-credentials': 'true',
		vary: 'Origin',
	});
	response.end();
	return true;
}

/** The 429 of an empty bucket: it says when to come back. */
function sendTooMany(response, config, retryAfterSec) {
	response.writeHead(429, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
		'access-control-allow-origin': config.allowedOrigin,
		'access-control-allow-credentials': 'true',
		'retry-after': String(Math.max(1, Math.ceil(Number(retryAfterSec) || 1))),
		vary: 'Origin',
	});
	response.end(JSON.stringify({ ok: false }));
	return true;
}

/**
 * The SQLSTATE the database refused with: PostgREST's `"code"` field only, so a
 * message that merely contains the digits is not a refusal.
 */
function sqlStateOf(error) {
	return /"code"\s*:\s*"(\w{5})"/.exec(String(error?.message ?? ''))?.[1] ?? '';
}

/**
 * Build the /api/events dispatcher: `await handler(url, request, response)` →
 * true when handled. deps: { config, verifySession, fetchImpl?, env? }.
 */
export function createEventsHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
	const deps = { fetchImpl, env };
	return async function handleEventsRoute(url, request, response, requestConfig = config) {
		if (url.pathname !== BEACON_PATH) return false;
		const method = (request.method || 'GET').toUpperCase();
		// The flag off: the route does not exist, exactly like an unknown path —
		// checked BEFORE the session, so a caller without a token cannot tell a
		// disabled beacon (401) from a missing one.
		if (!recsEnabled(deps.env)) return sendJson(response, 404, { ok: false }, requestConfig);
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			// The bucket is charged BEFORE any read: the beacon must not be free,
			// and a burst is the one thing this route must not be.
			takeToken(`beacon:${session.userId}`, RATE);
			if (method !== 'POST') {
				return sendJson(response, 405, { ok: false, message: `Method ${method} is not supported here.` }, requestConfig);
			}
			let body;
			try {
				body = await readJsonBody(request);
			} catch (error) {
				const status = Number(error?.status) === 413 ? 413 : 400;
				return sendJson(response, status, { ok: false, code: 'invalid_request' }, requestConfig);
			}
			const parsed = parseBody(body);
			if (!parsed) return sendJson(response, 400, { ok: false, code: 'invalid_request' }, requestConfig);
			// The consent comes FIRST (C48): a user who did not say yes gets a
			// 204, and nothing else is read or written for them.
			let consent;
			try {
				consent = await beaconConsent(deps, requestConfig, session.userId);
			} catch (error) {
				console.warn(`[osionos-bridge] the beacon consent read failed: ${messageOf(error)}`);
				return sendJson(response, 503, { ok: false }, requestConfig);
			}
			if (!consent) return sendNoContent(response, requestConfig);
			// The slate is the proof: only a list WE issued to THIS user.
			const verified = verifySlate(requestConfig.appSessionSecret, parsed.slate, session.userId, Date.now());
			if (!verified) return sendJson(response, 400, { ok: false, code: 'invalid_slate' }, requestConfig);
			// The rank is the slate's, never the body's (C49): a page that was
			// not in the slate is dropped, not an error.
			const kept = [];
			for (const event of parsed.events) {
				const rank = verified.items.findIndex((id) => String(id).toLowerCase() === event.pageId) + 1;
				if (rank === 0) continue;
				kept.push({ ...event, rank });
			}
			if (kept.length === 0) return sendJson(response, 200, { ok: true }, requestConfig);
			// The ACL in ONE batched read: a page the caller may not read NOW
			// is dropped — unreadable, archived, a ghost, their own.
			const rows = await readPages(deps, requestConfig, kept.map((event) => event.pageId));
			const readable = await readablePages(deps, requestConfig, session, rows);
			const events = [];
			for (const event of kept) {
				const row = readable.get(event.pageId);
				if (!row) continue;
				events.push({
					item_id: event.pageId,
					workspace_id: row.workspace_id ?? null,
					event: event.event,
					surface: verified.surface,
					rec_id: verified.recId,
					rank: event.rank,
				});
			}
			if (events.length === 0) return sendJson(response, 200, { ok: true }, requestConfig);
			try {
				await rest(requestConfig, deps.fetchImpl, 'rpc/ai_events_beacon', {
					method: 'POST',
					body: { p_user: session.userId, p_events: events },
				});
			} catch (error) {
				const state = sqlStateOf(error);
				if (state === '22023') return sendJson(response, 400, { ok: false, code: 'invalid_request' }, requestConfig);
				if (state === '54000') return sendJson(response, 429, { ok: false, code: 'daily_cap' }, requestConfig);
				console.warn(`[osionos-bridge] the beacon write failed: ${messageOf(error)}`);
				return sendJson(response, 503, { ok: false }, requestConfig);
			}
			// No count: a count would tell which slate pages turned unreadable.
			return sendJson(response, 200, { ok: true }, requestConfig);
		} catch (error) {
			const status = Number(error?.status);
			if (status === 401) return sendJson(response, 401, { ok: false, message: messageOf(error) }, requestConfig);
			if (status === 429) return sendTooMany(response, requestConfig, Number(error?.retryAfterSec ?? 1));
			// A backend failure is a 503 and never a beacon the user believes was
			// recorded. The message is logged once, and it carries no token.
			console.warn(`[osionos-bridge] the beacon failed: ${messageOf(error)}`);
			return sendJson(response, 503, { ok: false }, requestConfig);
		}
	};
}
