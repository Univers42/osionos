/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-recs-health.mjs                             :+:      :+:    :+:   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * THE RECS HEALTH — the numbers of the "Recs health" admin chart (M3): the
 * offline quality of every trained model over time, and the daily click-through
 * of the served recommendations.
 *
 * It is the PROOF that the recommender "improves over time", so it reads only
 * what was measured: the registry's own metrics (ndcg10, recall20) and the
 * beacon's impression and click events. Both come from ONE function of the
 * database, `ai_rec_health(p_days)`, which is service_role only and returns
 * AGGREGATES: no user id and no item id ever leaves it. Synthetic and real
 * events are counted apart, so a chart never mixes a simulation with use.
 *
 * The checks, in this order — the admin gate first, so nothing else is even
 * computed for a caller that may not have it:
 *   - a session (the token is read, an invalid one is a 401);
 *   - C91: the claim, then the row — the database decides (see
 *     bridge-admin-check.mjs);
 *   - the rate limit of the console (a burst must not be free);
 *   - the method: only a GET reads the numbers;
 *   - the window: an integer number of days in 1..180, the default month.
 *
 * Routes (each one: a session, an admin gate, a token of the caller's bucket,
 * and the database's own answer):
 *   GET /api/admin/recs/health   { since, models, daily }
 */

import { requireAdmin } from './bridge-admin-check.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import { bearerToken, rest, sendJson } from './bridge-social-core.mjs';

/** The one route this module owns, and the method it answers. */
const ROUTE = '/api/admin/recs/health';

// Sixty calls a minute, per admin, burst included — the console's own rate.
const RATE = { capacity: 60, refillPerSec: 1 };

// The window the chart asks for: a month by default, at most half a year.
const DEFAULT_DAYS = 30;
const MIN_DAYS = 1;
const MAX_DAYS = 180;

/** An error the route answers itself: a status and a code the client reads. */
const healthError = (message, status, code) => Object.assign(new Error(message), { status, code });

/**
 * The days the caller asks for: an integer in 1..180, a month when the query
 * says nothing. Anything else is a refusal — the window is not the database's
 * to guess.
 */
function readDays(url) {
	const raw = url.searchParams.get('days');
	if (raw === null || raw === '') return DEFAULT_DAYS;
	if (!/^\d+$/.test(raw)) throw healthError('days must be an integer between 1 and 180.', 400, 'invalid_days');
	const days = Number.parseInt(raw, 10);
	if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS) {
		throw healthError('days must be an integer between 1 and 180.', 400, 'invalid_days');
	}
	return days;
}

/**
 * Build the /api/admin/recs/health dispatcher: `await handler(url, request,
 * response)` → true when handled. deps: { config, verifySession, fetchImpl?, env? }.
 */
export function createRecsHealthHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
	const deps = { fetchImpl, env };
	return async function handleRecsHealthRoute(url, request, response, requestConfig = config) {
		if (url.pathname !== ROUTE) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			// C91: the claim first (no row is read without it), then the row.
			await requireAdmin(deps, requestConfig, session);
			// The limit is charged before the read: a burst must not be free.
			takeToken(`recshealth:${session.userId}`, RATE);
			if (method !== 'GET') {
				return sendJson(response, 405, { ok: false, code: 'method_not_allowed', message: `Method ${method} is not supported here.` }, requestConfig);
			}
			const days = readDays(url);
			let answer;
			try {
				// The one function of the database that holds the numbers. It is
				// service_role only, and it answers with aggregates alone.
				answer = await rest(requestConfig, deps.fetchImpl, 'rpc/ai_rec_health', {
					method: 'POST',
					body: { p_days: days },
				});
			} catch {
				throw healthError('The recs health could not be read.', 503, 'recs_health_unavailable');
			}
			return sendJson(response, 200, answer, requestConfig);
		} catch (error) {
			const status = error?.status ?? 500;
			const code = error?.code ?? 'recs_health_failed';
			const message = error instanceof Error ? error.message : 'The recs health failed.';
			return sendJson(response, status, { ok: false, code, message }, requestConfig);
		}
	};
}
