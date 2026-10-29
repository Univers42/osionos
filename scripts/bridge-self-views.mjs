/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-self-views.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Saved views of a `sys:` source: /api/account/self-data/views/<source>[/<viewId>].
 *
 *   GET    views/<source>            the caller's map of saved views
 *   PUT    views/<source>/<viewId>   save one view (the body is the view)
 *   DELETE views/<source>/<viewId>   remove one view
 *
 * A view is configuration only — filters, sorts, visible columns, display settings — and
 * never a row's values. It lives in the caller's own `osionos_user_settings` row, in the
 * section `sys-views-<source>`. That section is NOT a settings section: /api/preferences and
 * /api/account/notification-settings serve their own sections and do not widen to this one.
 * The section name is derived from the source id, never from the request.
 *
 * Reads and writes run as the caller (`asUser`): the table's owner-only policy is the
 * scope. The write is the database's merge function, one statement, so two saves of two
 * views both land; a `null` in the patch deletes the key.
 *
 * Caveat: only the top level and one level of `settings` are checked. What lies below a
 * `settings` key is the client's own display config; the 16 KB CHECK on the row bounds it.
 */

import { rateLimit } from './bridge-guard.mjs';
import { bearerToken, readJsonBody, sendJson } from './bridge-social-core.mjs';
import { selfSourceById } from './bridge-self-sources.mjs';

const VIEWS_PATH = /^\/api\/account\/self-data\/views\/([^/]+)(?:\/([^/]+))?$/;
const VIEW_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const POISON_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const BODY_LIMIT = 8 * 1024;
const LIST_LIMIT = 64;
const NAME_LIMIT = 200;
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

const VIEW_TYPES = new Set(['table', 'gallery', 'board', 'list', 'calendar', 'timeline', 'chart', 'dashboard']);
const LIST_KEYS = ['filters', 'sorts', 'visibleProperties'];
const OBJECT_KEYS = ['grouping', 'subGrouping'];
const TOP_KEYS = new Set(['name', 'type', 'filterConjunction', 'settings', ...LIST_KEYS, ...OBJECT_KEYS]);
// The optional keys of the engine's ViewSettings (contract-types/src/index.ts).
const SETTINGS_KEYS = new Set([
	'icon', 'showTitle', 'showPageIcon', 'wrapContent', 'loadLimit', 'openPagesIn', 'showVerticalLines',
	'showRowNumbers', 'manualRowOrder', 'columnWidths', 'columnOrder', 'colorColumns', 'cardPreview',
	'cardSize', 'cardLayout', 'galleryLayout', 'wrapPageTitles', 'showCalendarBy', 'showCalendarAs',
	'showWeekends', 'weekStartsOn', 'showWeekNumbers', 'showTimelineBy', 'timelineEndBy',
	'separateStartEndDates', 'showTable', 'zoomLevel', 'fitMedia', 'chartType', 'xAxisProperty',
	'xAxisSort', 'xAxisOmitZero', 'xAxisTitle', 'yAxisProperty', 'yAxisAggregation', 'yAxisGroupBy',
	'yAxisRange', 'yAxisRangeMin', 'yAxisRangeMax', 'yAxisTitle', 'yAxisCumulative', 'xAxisDateBucket',
	'chartHeight', 'gradientFill', 'donutCenterValue', 'colorByValue', 'hiddenGroups', 'manualGroupOrder',
	'showReferenceLine', 'referenceLineValue', 'colorPalette', 'showLegend', 'showGridLines',
	'showDataLabels', 'roundedBars', 'smoothLine', 'showDataSourceTitle', 'viewIcon', 'calendarMode',
	'wrapProperties', 'showAuthorByline', 'mapBy', 'mapDisplayMode', 'mapSizeBy', 'widgets',
	'formulaAnalytics', 'relationAnalytics', 'dashboardWidgets', 'dashboardRows', 'dashboardFilters',
	'responsiveLayout', 'tabDisplay', 'groupLayout', 'collapsedGroupIds', 'locked', 'conditionalColors',
	'automations',
]);

function viewsError(status, code, message, extra) {
	return Object.assign(new Error(message), { status, code }, extra);
}

const invalidView = (message) => viewsError(422, 'invalid_view', message);
const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

function respondWithError(response, error, config) {
	const status = Number.isInteger(error?.status) ? error.status : 500;
	const code = typeof error?.code === 'string' && /^[a-z][a-z0-9_]*$/.test(error.code)
		? error.code
		: (status === 401 ? 'not_authenticated' : 'self_views_failed');
	const body = { ok: false, message: error instanceof Error ? error.message : 'The request failed.', code };
	if (Number.isFinite(error?.retryAfterSeconds)) {
		body.retryAfterSeconds = error.retryAfterSeconds;
		response.setHeader('retry-after', String(error.retryAfterSeconds));
	}
	return sendJson(response, status, body, config);
}

/** The view, or a 422: every key must be on the allowlist, and `id`/`databaseId` never are. */
function checkedView(body) {
	if (!isPlainObject(body)) throw invalidView('A view must be a JSON object.');
	for (const key of Object.keys(body)) {
		if (!TOP_KEYS.has(key)) throw invalidView(`The view key "${key}" is not allowed.`);
	}
	if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > NAME_LIMIT)) {
		throw invalidView(`The view name must be a string of at most ${NAME_LIMIT} characters.`);
	}
	if (body.type !== undefined && !VIEW_TYPES.has(body.type)) throw invalidView('The view type is not known.');
	if (body.filterConjunction !== undefined && body.filterConjunction !== 'and' && body.filterConjunction !== 'or') {
		throw invalidView('The filter conjunction must be "and" or "or".');
	}
	for (const key of LIST_KEYS) {
		if (body[key] !== undefined && (!Array.isArray(body[key]) || body[key].length > LIST_LIMIT)) {
			throw invalidView(`"${key}" must be an array of at most ${LIST_LIMIT} entries.`);
		}
	}
	for (const key of OBJECT_KEYS) {
		if (body[key] !== undefined && !isPlainObject(body[key])) throw invalidView(`"${key}" must be an object.`);
	}
	if (body.settings !== undefined) {
		if (!isPlainObject(body.settings)) throw invalidView('"settings" must be an object.');
		for (const key of Object.keys(body.settings)) {
			if (!SETTINGS_KEYS.has(key)) throw invalidView(`The view setting "${key}" is not allowed.`);
		}
	}
	return body;
}

function checkedViewId(id) {
	if (!VIEW_ID.test(id) || POISON_IDS.has(id)) throw viewsError(422, 'invalid_view_id', 'The view id is not valid.');
	return id;
}

async function readViewBody(request) {
	let payload;
	try {
		payload = await readJsonBody(request, BODY_LIMIT);
	} catch (error) {
		if (error?.status === 413) throw invalidView('A view is at most 8 KB.');
		throw invalidView('The request body must be JSON.');
	}
	return checkedView(payload);
}

/** The caller's map. A store failure is a 503: "none saved" and "store down" differ. */
async function readViews(pg, session, section) {
	let rows;
	try {
		const params = new URLSearchParams({ section: `eq.${section}`, select: 'value', limit: '1' });
		rows = await pg.asUser(session).get(`osionos_user_settings?${params}`);
	} catch (error) {
		console.warn(`[osionos-bridge] saved views read failed: ${error?.code ?? error?.status ?? 'unknown'}`);
		throw viewsError(503, 'self_views_unavailable', 'Your saved views could not be read; try again shortly.');
	}
	const value = Array.isArray(rows) && rows.length > 0 ? rows[0]?.value : null;
	return isPlainObject(value) ? value : {};
}

async function mergeView(pg, session, section, patch) {
	try {
		const merged = await pg.asUser(session).rpc('osionos_user_settings_merge', { p_section: section, p_patch: patch });
		return isPlainObject(merged) ? merged : {};
	} catch (error) {
		// The row's 16 KB CHECK: the view fits the bridge but not the section.
		if (String(error?.upstreamCode ?? '') === '23514') throw viewsError(413, 'view_too_large', 'Your saved views are over their size limit.');
		console.warn(`[osionos-bridge] saved views write failed: ${error?.code ?? error?.status ?? 'unknown'}`);
		throw viewsError(503, 'self_views_unavailable', 'Your view could not be saved; try again shortly.');
	}
}

async function handleViews({ pg, session, section, method, viewId, request }) {
	if (method === 'GET' && viewId === undefined) return readViews(pg, session, section);
	if (method === 'PUT' && viewId !== undefined) {
		const view = await readViewBody(request);
		return mergeView(pg, session, section, { [viewId]: view });
	}
	if (method === 'DELETE' && viewId !== undefined) return mergeView(pg, session, section, { [viewId]: null });
	throw viewsError(405, 'method_not_allowed', `Method ${method} is not supported on this route.`);
}

/**
 * The saved-views route. It answers true when it handled the request and false when the
 * path is not its own.
 */
export function createSelfViewsRoutes({ config, pg, kv, verifySession }) {
	return async function handleSelfViews(url, request, response) {
		const match = VIEWS_PATH.exec(url.pathname);
		if (!match) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), config);
			const source = selfSourceById(match[1]);
			if (!source) throw viewsError(404, 'unknown_self_source', 'This data source does not exist.');
			await rateLimit(kv, ['self-views', session.userId], { limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS });
			const viewId = match[2] === undefined ? undefined : checkedViewId(match[2]);
			const section = `sys-views-${source.id}`;
			const views = await handleViews({ pg, session, section, method, viewId, request });
			return sendJson(response, 200, { ok: true, source: source.id, views }, config);
		} catch (error) {
			return respondWithError(response, error, config);
		}
	};
}
