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
 *   ponytail: capability-URL access, upgrade path = signed expiring URLs.
 */

import { createHash } from 'node:crypto';

import { bearerToken, httpError, safeText, sendJson } from './bridge-social-core.mjs';
import { readRawBody } from './bridge-chat-media.mjs';
import {
	ensureChatBucket,
	extFromMime,
	storageGet,
	storageObjectKey,
	storagePut,
	typeFromMime,
} from './bridge-storage-core.mjs';
import { takeToken } from './bridge-ratelimit.mjs';

const SERVE_RE = /^\/api\/media\/uploads\/([0-9a-f-]{36})\/([0-9a-f]{64}\.[a-z0-9]{1,8})$/i;

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
		'content-type': object.contentType || 'application/octet-stream',
		'content-length': String(object.buffer.length),
		'cache-control': 'private, max-age=86400',
		etag: `"${sha256}"`,
		'access-control-allow-origin': config.allowedOrigin,
		vary: 'Origin',
	});
	response.end(object.buffer);
	return true;
}

export function createMediaHandler({ config, verifySession, fetchImpl = fetch }) {
	const deps = { fetchImpl, env: process.env };
	return async function handleMediaRoute(url, request, response, requestConfig = config) {
		const pathname = url.pathname;
		if (!pathname.startsWith('/api/media/')) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const serve = SERVE_RE.exec(pathname);
			if (serve && method === 'GET') {
				return await serveObject(deps, serve[1], serve[2], request, response, requestConfig);
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
