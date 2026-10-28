/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-whiteboard.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The whiteboard: hydrawn's board API, served to the hydrawn frame from the user's grobase Mongo.
 *
 *   POST /api/whiteboard/token                  app session → whiteboard token (app CORS)
 *   GET|POST /api/whiteboard/v1/boards          list (no scenes) | create, slug minted here
 *   GET|PUT|DELETE /api/whiteboard/v1/boards/:slug
 *   GET|PUT /api/whiteboard/v1/boards/:slug/thumbnail
 *
 * The v1 routes speak hydrawn's contract (packages/contract/src/board.ts): its shapes, its
 * `{error:{code,message}}` envelope, its rev as ETag. They answer only the whiteboard origin
 * (OSIONOS_WHITEBOARD_ORIGIN), with no credentials, and only a whiteboard token (C598, C599);
 * without that origin configured the whole module is off and every path is the bridge's 404.
 *
 * Caveat: the scene check is the envelope and each element's id and isDeleted, not hydrawn's
 * full element schema; a malformed element otherwise is stored as sent and only the hydrawn
 * client that wrote it can misread it, since a board is never read by another user.
 * Caveat: the list pages by offset over updated_at, so a board saved while the gallery pages
 * moves to the front and the next page repeats one board or skips one.
 */

import { randomBytes } from 'node:crypto';
import { readRawBody } from './bridge-chat-media.mjs';
import { writeJsonResponse } from './bridge-json-response.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import { bearerToken, httpError, readJsonBody, safeText, sendJson } from './bridge-social-core.mjs';
import { createWhiteboardStore } from './bridge-whiteboard-store.mjs';
import { signWhiteboardToken, verifyWhiteboardToken } from './bridge-whiteboard-token.mjs';

const V1 = '/api/whiteboard/v1/boards';
const BOARD_PATH = /^\/api\/whiteboard\/v1\/boards\/([^/]+)(\/thumbnail)?$/;
// hydrawn's slug rule (6-32) met with the bridge's minimum (C605); minted at 12.
const SLUG = /^[a-z0-9]{8,32}$/;
const SLUG_LENGTH = 12;
// The grobase WAF parses every board body before Kong checks a key; past 2 MiB a few
// concurrent saves OOM-kill its 256 MiB container (C621, measured 2026-10-28).
const MAX_SCENE_BYTES = 2 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 512 * 1024;
const MAX_ELEMENTS = 20_000;
const MAX_ID_LENGTH = 128;
const MAX_TITLE_LENGTH = 200;
const MAX_BOARDS = 200;
const MAX_OFFSET = 10_000;
const PAGE = { fallback: 24, max: 100 };
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// A board refused when a save would keep under a fifth of its entries (C612). Entries count
// tombstones, which a merge never drops, so only a wipe shrinks them, never a user's delete.
const SHRINK = { minEntries: 20, keptRatio: 0.2 };
// Autosave is one save per 800 ms of drawing, one in flight: 30 absorbs a burst, 0.5/s
// a steady session. The token is asked once per 5 minutes per open frame.
const BUCKETS = {
	any: { capacity: 120, refillPerSec: 2 },
	put: { capacity: 30, refillPerSec: 0.5 },
	token: { capacity: 30, refillPerSec: 0.2 },
};

const fail = (status, code, message) => Object.assign(httpError(message, status), { code });
const CODES = { 400: 'bad_request', 401: 'unauthorized', 404: 'not_found', 409: 'conflict', 413: 'payload_too_large', 429: 'rate_limited' };

function corsHeaders(request, origin) {
	if (request.headers.origin !== origin) return { vary: 'Origin' };
	return { 'access-control-allow-origin': origin, vary: 'Origin' };
}

function reply(response, status, body, cors, extra = {}) {
	writeJsonResponse(response, status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors, ...extra }, body);
	return true;
}

function replyError(response, error, cors) {
	const status = error?.status ?? 500;
	const code = error?.code ?? CODES[status] ?? 'request_failed';
	const extra = Number.isFinite(error?.retryAfterSec) ? { 'retry-after': String(error.retryAfterSec) } : {};
	const message = status >= 500 ? 'Whiteboard storage is unavailable.' : error.message;
	if (status >= 500) console.error(`bridge: whiteboard ${error?.message ?? error}`);
	return reply(response, status, { error: { code, message } }, cors, extra);
}

function preflight(request, response, origin) {
	if (request.headers.origin !== origin) {
		response.writeHead(403, { vary: 'Origin' });
		response.end();
		return true;
	}
	response.writeHead(204, {
		'access-control-allow-origin': origin,
		'access-control-allow-methods': 'GET, POST, PUT, DELETE',
		'access-control-allow-headers': 'authorization, content-type, if-match',
		'access-control-expose-headers': 'etag',
		'access-control-max-age': '600',
		vary: 'Origin',
	});
	response.end();
	return true;
}

function mintSlug() {
	let slug = '';
	while (slug.length < SLUG_LENGTH) slug += randomBytes(16).toString('base64url').toLowerCase().replaceAll(/[^a-z0-9]/g, '');
	return slug.slice(0, SLUG_LENGTH);
}

function boundedInt(raw, { fallback, min, max }, name) {
	if (raw === null) return fallback;
	if (!/^\d{1,6}$/.test(raw)) throw fail(400, 'bad_request', `${name} must be a whole number.`);
	return Math.min(max, Math.max(min, Number(raw)));
}

function titleOf(value) {
	const title = safeText(value, MAX_TITLE_LENGTH);
	if (!title) throw fail(400, 'bad_request', 'A board needs a title.');
	return title;
}

/** hydrawn's BoardSummary from a stored row. */
function summaryOf(row) {
	return {
		slug: row.slug,
		title: row.title,
		elementCount: Number(row.element_count ?? 0),
		bounds: row.bounds ?? null,
		rev: Number(row.rev ?? 0),
		createdAt: String(row.created_at),
		updatedAt: String(row.updated_at),
		thumbnailAt: row.thumbnail_at ?? null,
	};
}

/**
 * hydrawn's sceneBounds (packages/contract/src/bounds.ts), denormalised on save as its own API
 * does, so the gallery can frame a board without reading its scene.
 * Caveat: an element whose x, y, width or height is not a finite number is left out rather than
 * refused, so a malformed element can make the extent smaller than what the engine draws.
 */
function sceneBounds(elements) {
	let bounds = null;
	for (const { x, y, width, height, isDeleted } of elements) {
		if (isDeleted || ![x, y, width, height].every(Number.isFinite)) continue;
		const minX = width < 0 ? x + width : x;
		const minY = height < 0 ? y + height : y;
		const maxX = minX + Math.abs(width);
		const maxY = minY + Math.abs(height);
		bounds = bounds === null
			? { minX, minY, maxX, maxY }
			: { minX: Math.min(bounds.minX, minX), minY: Math.min(bounds.minY, minY), maxX: Math.max(bounds.maxX, maxX), maxY: Math.max(bounds.maxY, maxY) };
	}
	return bounds;
}

function sceneOf(row, withTombstones) {
	const scene = JSON.parse(row.scene);
	return withTombstones ? scene : { ...scene, elements: scene.elements.filter((element) => !element.isDeleted) };
}

/** The fields hydrawn's replace accepts, and nothing else (C606). */
function parseScene(buffer) {
	let body;
	try {
		body = JSON.parse(buffer.toString('utf8'));
	} catch {
		throw fail(400, 'bad_request', 'The board must be JSON.');
	}
	const elements = body?.elements;
	if (body?.type !== 'osidraw' || body.version !== 1 || !Array.isArray(elements) || elements.length > MAX_ELEMENTS) {
		throw fail(400, 'bad_request', 'The board is not an osidraw scene this server accepts.');
	}
	for (const element of elements) {
		const id = element?.id;
		if (typeof id !== 'string' || !id || id.length > MAX_ID_LENGTH || typeof element.isDeleted !== 'boolean') {
			throw fail(400, 'bad_request', 'Every element needs an id and isDeleted.');
		}
	}
	const scene = { type: 'osidraw', version: 1, elements };
	return { scene, title: body.title === undefined ? undefined : titleOf(body.title) };
}

function expectedRev(request) {
	const header = String(request.headers['if-match'] ?? '').trim();
	if (!header) throw fail(428, 'precondition_required', 'If-Match is required: send the ETag from your last GET.');
	const match = /^(?:W\/)?"?(\d{1,15})"?$/.exec(header);
	if (!match) throw fail(400, 'bad_if_match', 'If-Match must be an ETag from a prior GET.');
	return Number(match[1]);
}

async function requireBoard(store, userId, slug, options) {
	const row = await store.findBoard(userId, slug, options);
	if (!row) throw fail(404, 'not_found', 'No such board.');
	return row;
}

function createRoutes(store) {
	async function list(ctx) {
		const limit = boundedInt(ctx.url.searchParams.get('limit'), { fallback: PAGE.fallback, min: 1, max: PAGE.max }, 'limit');
		const offset = boundedInt(ctx.url.searchParams.get('cursor'), { fallback: 0, min: 0, max: MAX_OFFSET }, 'cursor');
		const { rows, total } = await store.list(ctx.userId, { limit, offset });
		const next = offset + rows.length;
		return reply(ctx.response, 200, { boards: rows.map(summaryOf), nextCursor: rows.length > 0 && next < total ? String(next) : null }, ctx.cors);
	}

	async function create(ctx) {
		const title = titleOf((await readJsonBody(ctx.request, 4096))?.title);
		if (await store.countLive(ctx.userId) >= MAX_BOARDS) throw fail(403, 'board_limit', `A whiteboard account keeps at most ${MAX_BOARDS} boards.`);
		const empty = JSON.stringify({ type: 'osidraw', version: 1, elements: [] });
		const row = await store.createBoard(ctx.userId, { slug: mintSlug(), title, scene: empty, element_count: 0, entry_count: 0, rev: 0, thumbnail_at: null });
		return reply(ctx.response, 201, summaryOf(row), ctx.cors);
	}

	async function read(ctx, slug) {
		const row = await requireBoard(store, ctx.userId, slug, { withScene: true });
		const board = { ...summaryOf(row), scene: sceneOf(row, ctx.url.searchParams.get('include') === 'tombstones') };
		return reply(ctx.response, 200, board, ctx.cors, { etag: `"${board.rev}"` });
	}

	async function replace(ctx, slug) {
		takeToken(`whiteboard-put:${ctx.userId}`, BUCKETS.put);
		const rev = expectedRev(ctx.request);
		const { scene, title } = parseScene(await readRawBody(ctx.request, MAX_SCENE_BYTES));
		const row = await requireBoard(store, ctx.userId, slug);
		if (Number(row.rev) !== rev) throw fail(409, 'conflict', 'The board changed since it was read.');
		const entries = scene.elements.length;
		const forced = ctx.url.searchParams.get('force') === '1';
		if (!forced && row.entry_count >= SHRINK.minEntries && entries < row.entry_count * SHRINK.keptRatio) {
			throw fail(422, 'shrink_refused', 'This save would drop most of the board; it was not stored.');
		}
		const elementCount = scene.elements.filter((element) => !element.isDeleted).length;
		const patch = { scene: JSON.stringify(scene), element_count: elementCount, entry_count: entries, bounds: sceneBounds(scene.elements), rev: rev + 1, ...(title ? { title } : {}) };
		const saved = await store.patchBoardAt(ctx.userId, row.id, rev, patch);
		const board = { ...summaryOf({ ...row, ...saved, ...patch }), scene: sceneOf({ scene: patch.scene }, true) };
		return reply(ctx.response, 200, board, ctx.cors, { etag: `"${board.rev}"` });
	}

	async function remove(ctx, slug) {
		const row = await requireBoard(store, ctx.userId, slug);
		await store.patchBoard(ctx.userId, row.id, { deleted_at: new Date().toISOString() });
		ctx.response.writeHead(204, { ...ctx.cors, 'cache-control': 'no-store' });
		ctx.response.end();
		return true;
	}

	async function putThumbnail(ctx, slug) {
		if (!String(ctx.request.headers['content-type'] ?? '').startsWith('image/png')) throw fail(415, 'unsupported_media_type', 'A thumbnail is a PNG.');
		const png = await readRawBody(ctx.request, MAX_THUMBNAIL_BYTES);
		if (!png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) throw fail(415, 'unsupported_media_type', 'A thumbnail is a PNG.');
		const row = await requireBoard(store, ctx.userId, slug);
		const stored = await store.findThumbnail(ctx.userId, slug);
		if (stored) await store.patchThumbnail(ctx.userId, stored.id, png.toString('base64'));
		else await store.createThumbnail(ctx.userId, slug, png.toString('base64'));
		await store.patchBoard(ctx.userId, row.id, { thumbnail_at: new Date().toISOString() });
		ctx.response.writeHead(204, { ...ctx.cors, 'cache-control': 'no-store' });
		ctx.response.end();
		return true;
	}

	async function readThumbnail(ctx, slug) {
		await requireBoard(store, ctx.userId, slug);
		const stored = await store.findThumbnail(ctx.userId, slug);
		if (!stored?.png) throw fail(404, 'not_found', 'This board has no picture yet.');
		const png = Buffer.from(stored.png, 'base64');
		ctx.response.writeHead(200, { ...ctx.cors, 'content-type': 'image/png', 'content-length': String(png.length), 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' });
		ctx.response.end(png);
		return true;
	}

	return { list, create, read, replace, remove, putThumbnail, readThumbnail };
}

function route(routes, ctx) {
	const method = (ctx.request.method || 'GET').toUpperCase();
	if (ctx.url.pathname === V1) {
		if (method === 'GET') return routes.list(ctx);
		if (method === 'POST') return routes.create(ctx);
		throw fail(405, 'method_not_allowed', 'Method not supported here.');
	}
	const match = BOARD_PATH.exec(ctx.url.pathname);
	if (!match) throw fail(404, 'not_found', 'No such route.');
	const [, slug, thumbnail] = match;
	if (!SLUG.test(slug)) throw fail(400, 'bad_slug', 'That is not a board slug.');
	if (thumbnail && method === 'GET') return routes.readThumbnail(ctx, slug);
	if (thumbnail && method === 'PUT') return routes.putThumbnail(ctx, slug);
	if (!thumbnail && method === 'GET') return routes.read(ctx, slug);
	if (!thumbnail && method === 'PUT') return routes.replace(ctx, slug);
	if (!thumbnail && method === 'DELETE') return routes.remove(ctx, slug);
	throw fail(405, 'method_not_allowed', 'Method not supported here.');
}

async function issueToken(request, response, config, verifySession) {
	try {
		if ((request.method || 'GET').toUpperCase() !== 'POST') return sendJson(response, 405, { ok: false, message: 'Method not supported here.' }, config);
		const session = verifySession(bearerToken(request), config);
		takeToken(`whiteboard-token:${session.userId}`, BUCKETS.token);
		const { token, exp } = signWhiteboardToken(session, config);
		return sendJson(response, 200, { ok: true, token, exp }, config);
	} catch (error) {
		return sendJson(response, error?.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Whiteboard token request failed.' }, config);
	}
}

/**
 * Build the dispatcher: `await handler(url, request, response, config)` → true when handled.
 * It runs before the bridge's own OPTIONS answer, since the v1 preflight names another origin.
 * `store` is injectable for tests; by default it is grobase mongo-api through Kong.
 */
export function createWhiteboardHandler({ config, verifySession, fetchImpl = fetch, env = process.env, store }) {
	const origin = String(env.OSIONOS_WHITEBOARD_ORIGIN ?? '').trim().replace(/\/$/, '');
	const routes = createRoutes(store ?? createWhiteboardStore({ fetchImpl, env }));
	return async function handleWhiteboardRoute(url, request, response, requestConfig = config) {
		if (!origin || !url.pathname.startsWith('/api/whiteboard/')) return false;
		if (url.pathname === '/api/whiteboard/token') {
			return request.method === 'OPTIONS' ? false : issueToken(request, response, requestConfig, verifySession);
		}
		if (!url.pathname.startsWith(V1)) return false;
		if (request.method === 'OPTIONS') return preflight(request, response, origin);
		const cors = corsHeaders(request, origin);
		try {
			const { userId } = verifyWhiteboardToken(bearerToken(request), requestConfig);
			takeToken(`whiteboard:${userId}`, BUCKETS.any);
			return await route(routes, { url, request, response, cors, userId });
		} catch (error) {
			if (response.headersSent) throw error;
			return replyError(response, error, cors);
		}
	};
}
