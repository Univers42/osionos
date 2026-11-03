/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-media.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Page-media uploads (the /image block "upload from computer" path).
 *
 * POST /api/media/uploads?name=&type=  — app-session authed; body = raw file
 *   bytes; stored content-addressed (sha256) in the private storage bucket
 *   under the uploader's prefix; dedup is free (same bytes → same key).
 * GET  /api/media/uploads/:ownerId/:key — capability URL so a plain <img src>
 *   renders it anywhere (editor, read-only previews, shared pages): no
 *   session, secrecy = the unguessable 64-hex sha in the key.
 *   It also opens with a signature (?exp&kid&sig, bridge-media-sign.mjs) or the
 *   owner's own Bearer session; MEDIA_URL_ENFORCE=true refuses the bare form.
 * POST /api/media/uploads/sign {paths, pageId?} — app-session authed; signs the caller's own
 *   paths, and any path in the content or cover of a page the caller can read.
 *
 * Caveat: until MEDIA_URL_ENFORCE is on, a bare URL is still a capability: anyone
 * holding it reads the file (#235). The bare-read log says when it is safe to turn on.
 */

import { createHash } from 'node:crypto';

import { bearerToken, httpError, readJsonBody, safeText, sendJson } from './bridge-social-core.mjs';
import { createBareReadLog, mediaKeysFromEnv, signMediaPath, verifyMediaSignature } from './bridge-media-sign.mjs';
import { readRawBody } from './bridge-chat-media.mjs';
import {
	ensureChatBucket,
	extFromMime,
	servedObjectHeaders,
	storageGet,
	storageObjectKey,
	storagePut,
	typeFromMime,
} from './bridge-storage-core.mjs';
import { takeToken } from './bridge-ratelimit.mjs';

const SERVE_RE = /^\/api\/media\/uploads\/([0-9a-f-]{36})\/([0-9a-f]{64}\.[a-z0-9]{1,8})$/i;
const MAX_SIGN_PATHS = 200;

/** Who is reading: a valid signature, the owner's session, or nobody named (bare). */
function readerOf(deps, url, request, ownerId, requestConfig) {
	if (url.searchParams.has('sig')) {
		if (verifyMediaSignature(deps.keys, url.pathname, url.searchParams)) return 'signed';
		throw httpError('This media link has expired or is not valid.', 403);
	}
	const header = String(request.headers.authorization ?? '');
	const token = /^bearer\s+/i.test(header) ? header.replace(/^bearer\s+/i, '').trim() : '';
	if (token) {
		try {
			if (deps.verifySession(token, requestConfig).userId === ownerId) return 'session';
		} catch {
			// An invalid token reads like no token: the bare rule below decides.
		}
	}
	if (deps.enforce) throw httpError('This media needs a signed link or its owner\'s session.', 403);
	return 'bare';
}

/**
 * The media of `page` (its content and cover), as one string to search. A path is signed for a
 * reader of the page when it appears there: a teammate opening a shared page sees the owner's
 * images without being their owner.
 *
 * Caveat: the stored row, not the live collab state. An image a teammate inserted seconds ago and
 * whose save has not landed yet is not in the row, so its link is not signed until the save lands.
 */
function mediaOfPage(row) {
	return JSON.stringify([row?.content ?? null, row?.cover ?? null]);
}

/** The page `pageId` as the caller may read it, or null (unreadable, missing, or no reader wired). */
async function readableRow(deps, request, pageId, config) {
	if (!deps.readPage || typeof pageId !== 'string' || pageId === '') return null;
	try {
		return await deps.readPage(request, pageId, config);
	} catch {
		return null;
	}
}

/** The caller's own media paths and those of a page they can read, signed; any other is left out. */
async function signPaths(deps, session, request, response, config) {
	if (deps.keys.length === 0) throw httpError('Signed media links are not configured on this bridge.', 503);
	const body = await readJsonBody(request);
	const paths = Array.isArray(body?.paths) ? body.paths.filter((value) => typeof value === 'string') : [];
	if (paths.length > MAX_SIGN_PATHS) throw httpError(`At most ${MAX_SIGN_PATHS} paths per request.`, 413);
	const row = await readableRow(deps, request, body?.pageId, config);
	const pageMedia = row ? mediaOfPage(row) : '';
	const signed = {};
	for (const input of paths) {
		let pathname;
		try {
			pathname = new URL(input, 'http://media.invalid').pathname;
		} catch {
			continue;
		}
		const match = SERVE_RE.exec(pathname);
		if (!match) continue;
		const own = match[1].toLowerCase() === String(session.userId).toLowerCase();
		if (own || (pageMedia !== '' && pageMedia.includes(pathname))) signed[input] = signMediaPath(deps.keys, pathname);
	}
	return sendJson(response, 200, { ok: true, signed }, config);
}

async function upload(deps, session, url, request, response, config) {
	takeToken(`media-upload:${session.userId}`, { capacity: 5, refillPerSec: 0.5 });
	const buf = await readRawBody(request);
	if (buf.length === 0) throw httpError('Upload body is empty.', 422);
	const contentType = safeText(request.headers['content-type'], 160) || 'application/octet-stream';
	const sha256 = createHash('sha256').update(buf).digest('hex');
	const objectKey = storageObjectKey(sha256, extFromMime(contentType));
	await ensureChatBucket(session.userId, deps.fetchImpl, deps.env);
	await storagePut(session.userId, objectKey, contentType, buf, deps.fetchImpl, deps.env);
	return sendJson(response, 201, {
		ok: true,
		media: {
			url: `/api/media/uploads/${session.userId}/${objectKey}`,
			type: typeFromMime(contentType),
			name: safeText(url.searchParams.get('name'), 200) || objectKey,
			mimeType: contentType,
			size: buf.length,
			sha256,
		},
	}, config);
}

async function serveObject(deps, ownerId, key, request, response, config) {
	const sha256 = key.split('.')[0];
	if (safeText(request.headers['if-none-match'], 80).replace(/"/g, '') === sha256) {
		response.writeHead(304, { etag: `"${sha256}"`, 'cache-control': 'private, max-age=86400' });
		response.end();
		return true;
	}
	const object = await storageGet(ownerId, key, deps.fetchImpl, deps.env);
	if (object.status !== 200 || !object.buffer) {
		throw httpError('Stored media is unavailable.', object.status === 404 ? 404 : 502);
	}
	response.writeHead(200, {
		...servedObjectHeaders(object.contentType),
		'content-length': String(object.buffer.length),
		'cache-control': 'private, max-age=86400',
		etag: `"${sha256}"`,
		'access-control-allow-origin': config.allowedOrigin,
		vary: 'Origin',
	});
	response.end(object.buffer);
	return true;
}

export function createMediaHandler({ config, verifySession, fetchImpl = fetch, readPage = null }) {
	const env = process.env;
	const keys = mediaKeysFromEnv(env);
	const enforce = env.MEDIA_URL_ENFORCE === 'true';
	if (enforce && keys.length === 0) throw new Error('MEDIA_URL_ENFORCE=true needs MEDIA_URL_SECRET: without it no media link could be opened.');
	const deps = { fetchImpl, env, keys, enforce, verifySession, readPage, reads: createBareReadLog() };
	return async function handleMediaRoute(url, request, response, requestConfig = config) {
		const pathname = url.pathname;
		// Only the uploads subtree is ours. Claiming all of /api/media/ answered
		// 404 for /api/media/unsplash/search, which bridge-api.mjs serves later in
		// the dispatch order, so the cover photo search was unreachable.
		if (pathname !== '/api/media/uploads' && !pathname.startsWith('/api/media/uploads/')) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const serve = SERVE_RE.exec(pathname);
			if (serve && method === 'GET') {
				deps.reads.count(readerOf(deps, url, request, serve[1], requestConfig));
				return await serveObject(deps, serve[1], serve[2], request, response, requestConfig);
			}
			if (pathname === '/api/media/uploads/sign' && method === 'POST') {
				const session = verifySession(bearerToken(request), requestConfig);
				return await signPaths(deps, session, request, response, requestConfig);
			}
			if (pathname === '/api/media/uploads' && method === 'POST') {
				const session = verifySession(bearerToken(request), requestConfig);
				return await upload(deps, session, url, request, response, requestConfig);
			}
			return sendJson(response, 404, { ok: false, message: 'Media route not found.' }, requestConfig);
		} catch (error) {
			return sendJson(
				response,
				error?.status ?? 500,
				{ ok: false, message: error instanceof Error ? error.message : 'Media request failed.' },
				requestConfig,
			);
		}
	};
}
