/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-published-pages.mjs                  +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The pages the caller published to the web: GET /api/account/published-pages.
 *
 * The snapshots are read through the ACCOUNT role, never through the service role: the
 * owner scope of the rows is the RLS policy of the table, so the route adds no owner
 * filter of its own and a mistake in it cannot widen the answer. The pages behind the
 * snapshots are read through the service role, because the account role has no grant on
 * them — and only over the ids the account role just returned.
 *
 * The snapshot body never reaches this route: the account role has no grant on the
 * content column, so the select names the five columns the panel needs.
 *
 * Caveat: the page's `updated_at` is client-supplied up to five minutes in the future
 * (bridge-api.mjs:845-851), so a page can be made to look current; the status is an
 * advisory signal, not a guarantee.
 * Caveat: the list has no paging — a caller with more than 50 published pages sees the
 * newest 50 and the rest are not reachable. The cap also keeps the id list of the second
 * read under the `in.()` ceiling, which breaks around 90 values.
 */

import { rateLimit } from './bridge-guard.mjs';
import { pgError } from './bridge-pg.mjs';
import { bearerToken, sendJson } from './bridge-social-core.mjs';

const PUBLISHED_PATH = '/api/account/published-pages';
const PUBLISHED_COLUMNS = 'token,page_id,title,icon,published_at';
const PAGE_COLUMNS = 'id,title,icon,updated_at';
const LIST_LIMIT = 50;
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ids of the pages behind the snapshots: the database's own uuids, nothing else. */
function publishedIds(rows) {
	const ids = [];
	for (const row of rows) {
		const id = String(row?.page_id ?? '').toLowerCase();
		if (UUID_PATTERN.test(id) && !ids.includes(id)) ids.push(id);
	}
	return ids;
}

/**
 * The status of one copy: live while the page has not moved since the snapshot, out of
 * date after. A page that is gone is out of date too — the public link still serves the
 * older copy, and that is what a republish is for.
 */
function statusFor(publishedAt, page) {
	if (!page) return 'outdated';
	const published = Date.parse(publishedAt ?? '');
	const updated = Date.parse(page.updated_at ?? '');
	// An unreadable stamp cannot prove the copy is current.
	if (!Number.isFinite(published) || !Number.isFinite(updated)) return 'outdated';
	return updated <= published ? 'live' : 'outdated';
}

/** One entry of the list: the six keys of the contract, and nothing else. */
function pageEntry(row, page) {
	return {
		pageId: row.page_id,
		token: row.token,
		title: page ? (page.title ?? row.title ?? '') : (row.title ?? ''),
		icon: page ? (page.icon ?? null) : (row.icon ?? null),
		publishedAt: row.published_at,
		status: statusFor(row.published_at, page),
	};
}

/** The pages of the ids the account role just returned, read with the service key. */
async function readCurrentPages(pg, ids) {
	const rows = await pg.asService().get(`osionos_pages?id=in.(${ids.join(',')})&select=${PAGE_COLUMNS}`);
	const pages = new Map();
	for (const row of Array.isArray(rows) ? rows : []) {
		const id = String(row?.id ?? '').toLowerCase();
		if (id) pages.set(id, row);
	}
	return pages;
}

/**
 * The snapshots of the caller, and the status of each one. The account plane being
 * unavailable is a 503 and never an empty list: a silent empty list would read as "you
 * published nothing" and hide the outage.
 */
async function listPublishedPages(pg, session) {
	let rows;
	try {
		rows = await pg.asUser(session).get(`osionos_published_pages?select=${PUBLISHED_COLUMNS}&order=published_at.desc&limit=${LIST_LIMIT}`);
	} catch (error) {
		// A missing account role (22023) and a refused grant (42501) are the same outage
		// for the caller: the account plane cannot answer.
		const upstream = String(error?.upstreamCode ?? '');
		if (upstream === '22023' || upstream === '42501') throw pgError(503, 'account_plane_unavailable');
		throw error;
	}
	const snapshots = Array.isArray(rows) ? rows : [];
	const ids = publishedIds(snapshots);
	const pages = ids.length === 0 ? new Map() : await readCurrentPages(pg, ids);
	return snapshots.map((row) => pageEntry(row, pages.get(String(row.page_id ?? '').toLowerCase())));
}

/** The throttle: the window is told to the caller in the body and in the header. */
function rateLimited(response, error, config) {
	const retryAfterSeconds = Number.isFinite(error?.retryAfterSeconds) ? error.retryAfterSeconds : Math.ceil(RATE_WINDOW_MS / 1_000);
	response.setHeader('retry-after', String(retryAfterSeconds));
	const message = error instanceof Error ? error.message : 'Too many requests.';
	return sendJson(response, 429, { ok: false, message, code: 'rate_limited', retryAfterSeconds }, config);
}

/**
 * The account route of this module: GET /api/account/published-pages. The feature flag
 * comes first: the whole publish feature is inert unless it is on, so the route is a 404
 * and no table is read.
 */
export function createPublishedPagesRoutes({ config, pg, kv, verifySession, env = process.env }) {
	return async function handleAccountPublishedPages(url, request, response) {
		if (request.method !== 'GET' || url.pathname !== PUBLISHED_PATH) return false;
		if (env.OSIONOS_PUBLISH_ENABLED !== '1') {
			return sendJson(response, 404, { ok: false, message: 'Not found.', code: 'publish_disabled' }, config);
		}
		const session = verifySession(bearerToken(request), config);
		try {
			await rateLimit(kv, ['published-pages', session.userId], { limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS });
		} catch (error) {
			if (error?.status === 429) return rateLimited(response, error, config);
			throw error;
		}
		const pages = await listPublishedPages(pg, session);
		return sendJson(response, 200, { ok: true, pages }, config);
	};
}
