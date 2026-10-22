/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-recs-not-interested.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * "Not interested": the user refuses a page of the slate they were shown, and
 * the next slate honours it.
 *
 *   POST /api/recs/not-interested   { slate, pageId }
 *
 * THE SIGNED SLATE IS THE PROOF (C49)
 *   The body carries the slate the server itself issued. The signature is
 *   checked against the SESSION's user: a slate of another user, a tampered
 *   one and one older than an hour are all refused (400 invalid_slate). Then
 *   the page must be one of THAT slate's pages (400 not_in_slate): a user may
 *   refuse only what we showed THEM, never a page of somebody else's list and
 *   never a page nobody was shown.
 *
 * THE OPT-OUT STOPS THE WRITE (C48)
 *   `capture_explicit = false` means the user refused to be tracked. Then
 *   NOTHING is written: the answer is 200 { recorded: false }, and the refusal
 *   itself is not a row. The opt-out stops the use of the recommender, not
 *   only its capture.
 *
 * THE ROW
 *   One insert in ai_events: who refused, which page, on which surface, at
 *   which rank of which recommendation. The row is for the SESSION's user —
 *   a user id in the body is ignored, exactly like everywhere else.
 */

import { readJsonBody, rest, sendJson } from './bridge-social-core.mjs';
import { verifySlate } from './bridge-recs-slate.mjs';

/** The log of the recommender, and the table that holds the user's switch. */
const EVENTS_TABLE = 'ai_events';
const SETTINGS_TABLE = 'ai_personalization_settings';

/** Thirty calls, then one every two seconds: a refusal is rarer than a slate. */
export const NOT_INTERESTED_RATE = { capacity: 30, refillPerSec: 0.5 };

/**
 * The user's switch: false means "do not track me", and then nothing is
 * written for them. No row = the defaults = capture on.
 */
async function captureExplicit(deps, config, userId) {
	const rows = await rest(config, deps.fetchImpl, `${SETTINGS_TABLE}?user_id=eq.${userId}&select=capture_explicit&limit=1`);
	const row = Array.isArray(rows) ? rows[0] : null;
	return row && typeof row.capture_explicit === 'boolean' ? row.capture_explicit : true;
}

/**
 * The answer of a refusal the server accepts.
 *
 * @param {{ fetchImpl?: typeof fetch }} deps the transport of the bridge
 * @param {object} config the bridge config (appSessionSecret, baasUrl, serviceKey)
 * @param {{ userId: string }} session the verified session
 * @param {object} request the request, whose body is read here
 * @param {object} response the response to answer
 */
export async function answerNotInterested(deps, config, session, request, response) {
	let body;
	try {
		body = await readJsonBody(request);
	} catch (error) {
		const status = Number(error?.status) === 413 ? 413 : 400;
		return sendJson(response, status, { ok: false, code: 'invalid_request' }, config);
	}
	const slate = String(body?.slate ?? '');
	const pageId = String(body?.pageId ?? '');
	try {
		// The slate proves that WE served this list to THIS user.
		const verified = verifySlate(config.appSessionSecret, slate, session.userId, Date.now());
		if (!verified) return sendJson(response, 400, { ok: false, code: 'invalid_slate' }, config);
		// The page must be one of that slate's pages: the refusal of a page
		// nobody was shown is not a refusal, it is a guess (C49).
		const rank = verified.items.indexOf(pageId) + 1;
		if (rank === 0) return sendJson(response, 400, { ok: false, code: 'not_in_slate' }, config);
		// The opt-out ends the request: the row is not written, and the answer
		// says that nothing was recorded (C48).
		if (!(await captureExplicit(deps, config, session.userId))) {
			return sendJson(response, 200, { ok: true, recorded: false }, config);
		}
		await rest(config, deps.fetchImpl, EVENTS_TABLE, {
			method: 'POST',
			body: {
				user_id: session.userId,
				item_kind: 'page',
				item_id: pageId,
				workspace_id: null,
				event: 'not_interested',
				weight: 0,
				surface: 'home',
				rec_id: verified.recId,
				rank,
			},
		});
	} catch (error) {
		// A backend failure is a 503 and NEVER a refusal the user believes
		// was recorded. The message is logged once, and it carries no token.
		console.warn(`[osionos-bridge] the "not interested" write failed: ${error instanceof Error ? error.message : 'unknown error'}`);
		return sendJson(response, 503, { ok: false }, config);
	}
	return sendJson(response, 200, { ok: true, recorded: true }, config);
}
