/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-insights.mjs                         +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * GET /api/account/admin/insights: the platform-wide daily rollup (`osionos_activity_daily`),
 * the only activity data an admin can reach. There is no route, view or grant from an admin
 * session to the raw `osionos_activity_events`, and the rollup has no user column.
 *
 * Gates, in order: the OSIONOS_ACTIVITY flag (off answers as an unknown path), the session,
 * the platform role RE-READ on every request (a token claim never grants), a rate limit, the
 * query allowlist, then one audit row per read holding a hash of the filter and no raw value.
 *
 * Accepted query: `days` (7 to 90, default 30; the last N closed UTC days ending yesterday),
 * `granularity=day`, `event`, `surface`. Anything else, `workspace_id` included, is 400 bad_query.
 *
 * Suppression happened when the rollup was written: a cell under 5 people is unstorable. The
 * route filters `users >= 5` again as a second wall, returns exact `events` and `users` per
 * cell, and a `totalOfShownCells` that is the sum of the cells it shows, never a separate total.
 *
 * Caveat: k is a floor on cell size per day, not differential privacy. It does not stop
 * differencing across overlapping day windows (a day with 5 users next to one with 6) nor
 * dominance (one person making 99 percent of a cell's events). Day grain, the closed event set
 * and the absence of per-user rows reduce both; they do not remove them. A cell stored while
 * 5 people were in it is not re-evaluated after one of them is erased.
 * Caveat: PostgREST may cap rows below the 5,040 cells a 90-day window can hold (90 days x 8
 * events x 7 surfaces); a capped read under-reports, and the total still equals the shown cells.
 */

import { createHash } from 'node:crypto';
import { rateLimit, writeAudit } from './bridge-guard.mjs';
import { ACTIVITY_EVENTS, ACTIVITY_SURFACES, isActivityEvent, isActivitySurface } from './bridge-activity-vocab.mjs';
import { isPlatformRole, readPlatformRole, roleAtLeast } from './bridge-roles.mjs';
import { bearerToken, sendJson } from './bridge-social-core.mjs';
import { clientMetaOf } from './bridge-account-sudo.mjs';

const INSIGHTS_PATH = '/api/account/admin/insights';
const MIN_USERS = 5;
const MIN_DAYS = 7;
const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;
const MAX_CELLS = MAX_DAYS * ACTIVITY_EVENTS.length * ACTIVITY_SURFACES.length;
const READ_LIMIT = 30;
const WINDOW_MS = 60_000;
const DAY_MS = 86_400_000;
const ALLOWED_KEYS = new Set(['days', 'granularity', 'event', 'surface']);
const SELECT = 'day,event,surface,events,distinct_users';

const insightsError = (status, code, message) => Object.assign(new Error(message), { status, code });
const badQuery = (message) => insightsError(400, 'bad_query', message);

/** The validated filter; every key is checked against an allowlist and a closed vocabulary. */
export function parseInsightsQuery(url) {
	for (const key of url.searchParams.keys()) if (!ALLOWED_KEYS.has(key)) throw badQuery('This query parameter is not accepted.');
	const rawDays = url.searchParams.get('days');
	const days = rawDays === null ? DEFAULT_DAYS : Number(rawDays);
	if (!/^\d{1,3}$/.test(rawDays ?? '30') || days < MIN_DAYS || days > MAX_DAYS) throw badQuery(`days must be a whole number from ${MIN_DAYS} to ${MAX_DAYS}.`);
	const granularity = url.searchParams.get('granularity');
	if (granularity !== null && granularity !== 'day') throw badQuery('Only the day granularity is available.');
	const event = url.searchParams.get('event');
	if (event !== null && !isActivityEvent(event)) throw badQuery('This event is not in the activity vocabulary.');
	const surface = url.searchParams.get('surface');
	if (surface !== null && !isActivitySurface(surface)) throw badQuery('This surface is not in the activity vocabulary.');
	return { days, event, surface };
}

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** PostgREST terms for the window: strictly after the day before the first day, strictly before today (UTC). */
function windowTerms(filter, nowMs) {
	const today = Math.floor(nowMs / DAY_MS) * DAY_MS;
	const terms = [`day=gt.${isoDay(today - (filter.days + 1) * DAY_MS)}`, `day=lt.${isoDay(today)}`];
	if (filter.event) terms.push(`event=eq.${filter.event}`);
	if (filter.surface) terms.push(`surface=eq.${filter.surface}`);
	return terms;
}

const isShownCell = (row) => Number.isInteger(row?.distinct_users) && row.distinct_users >= MIN_USERS && Number.isFinite(row?.events);

function cellOf(row) {
	return { day: String(row.day).slice(0, 10), event: row.event, surface: row.surface, events: Number(row.events), users: row.distinct_users };
}

const filterHash = (filter) => createHash('sha256').update(JSON.stringify({ days: filter.days, event: filter.event, surface: filter.surface })).digest('hex');

async function throttled({ kv, config }, userId, response) {
	try {
		await rateLimit(kv, ['insights', userId], { limit: READ_LIMIT, windowMs: WINDOW_MS });
	} catch (error) {
		if (error?.status !== 429) throw error;
		response.setHeader('retry-after', String(error.retryAfterSeconds ?? WINDOW_MS / 1_000));
		sendJson(response, 429, { ok: false, message: 'Too many requests.', code: 'rate_limited' }, config);
		return true;
	}
	return false;
}

async function readCells(client, filter, nowMs) {
	const query = [`select=${SELECT}`, ...windowTerms(filter, nowMs), 'order=day.asc,event.asc,surface.asc', `limit=${MAX_CELLS}`].join('&');
	const rows = await client.get(`osionos_activity_daily?${query}`);
	return (Array.isArray(rows) ? rows : []).filter(isShownCell).map(cellOf);
}

export function createAdminInsightsRoutes({ config, pg, kv, verifySession, env = process.env, now = Date.now }) {
	return async function handleAdminInsights(url, request, response) {
		if (url.pathname !== INSIGHTS_PATH || request.method !== 'GET' || env.OSIONOS_ACTIVITY !== '1') return false;
		const session = verifySession(bearerToken(request), config);
		const client = pg.asService();
		const { role } = await readPlatformRole(client, session.userId);
		if (!isPlatformRole(role) || !roleAtLeast(role, 'admin')) throw insightsError(403, 'admin_required', 'This action needs the admin role.');
		if (await throttled({ kv, config }, session.userId, response)) return true;
		const filter = parseInsightsQuery(url);
		const cells = await readCells(client, filter, now());
		await writeAudit(pg, { session, meta: clientMetaOf(request, config), eventType: 'admin.insights_read', details: { filterHash: filterHash(filter) } });
		const totalOfShownCells = cells.reduce((sum, cell) => sum + cell.events, 0);
		return sendJson(response, 200, { ok: true, cells, totalOfShownCells }, config);
	};
}
