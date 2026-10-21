/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-chat-media.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Rich-media routes for the osionos messenger (split out of bridge-chat.mjs to
 * honour the ≤200-line/≤5-fn convention). Upload (raw bytes), serve (stream
 * back, membership-gated), gallery (per-channel media list) and SSRF-guarded
 * link previews. Storage round-trips through bridge-storage-core.mjs; the
 * attachments fan-out at send time lives in bridge-chat.mjs (postMessage).
 *
 * `requireChannelAccess` is injected by the caller so the membership gate stays
 * in one place.
 */

import { createHash } from 'node:crypto';
import { httpError, rest, safeText, sendJson } from './bridge-social-core.mjs';
import { extFromMime, storageGet, storageObjectKey, storagePut, typeFromMime, ensureChatBucket } from './bridge-storage-core.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import { assertPublicHttpUrl } from './bridge-url-guard.mjs';
import { fetchPublicHtml } from './bridge-url-fetch.mjs';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const LINK_PREVIEW_BYTES = 512 * 1024;
const LINK_PREVIEW_TIMEOUT_MS = 6_000;
const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'file', 'url']);
const META_TEXT_KEYS = ['title', 'description', 'image'];
const META_INT_CAPS = { width: 16384, height: 16384, durationMs: 86_400_000 };

/**
 * Whitelist + cap attachment metadata before it is persisted from untrusted
 * client input: width/height/durationMs/waveform for media, title/description/
 * image for url cards. Drops unknown keys, clamps ints, bounds the waveform to
 * 256 samples in [0,1] rounded to 2 dp, and hard-caps the serialized size. Keeps
 * the voice-message round-trip (durationMs + waveform) intact.
 */
export function sanitizeAttachmentMetadata(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	const out = {};
	for (const key of Object.keys(META_INT_CAPS)) {
		const n = Number(raw[key]);
		if (Number.isFinite(n) && n >= 0) out[key] = Math.min(Math.trunc(n), META_INT_CAPS[key]);
	}
	if (Array.isArray(raw.waveform)) {
		out.waveform = raw.waveform.slice(0, 256).map((v) => {
			const n = Number(v);
			return Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0, n)) * 100) / 100 : 0;
		});
	}
	for (const key of META_TEXT_KEYS) {
		if (typeof raw[key] === 'string') out[key] = safeText(raw[key], 1024);
	}
	if (JSON.stringify(out).length > 4096) return { width: out.width, height: out.height, durationMs: out.durationMs };
	return out;
}

/** Read the request stream into a Buffer with a hard byte cap (413 on overflow). */
export async function readRawBody(request, maxBytes = MAX_UPLOAD_BYTES) {
	// Reject up front when the declared size is over the cap, draining the body so
	// the socket closes cleanly — a mid-stream throw resets the connection, which
	// the browser reports as an opaque CORS/ERR_FAILED instead of a readable 413.
	const declared = Number(request.headers['content-length']);
	if (Number.isFinite(declared) && declared > maxBytes) {
		request.resume();
		throw httpError('Upload exceeds the 50MB limit.', 413);
	}
	const chunks = [];
	let size = 0;
	for await (const chunk of request) {
		size += chunk.length;
		if (size > maxBytes) {
			request.resume();
			throw httpError('Upload exceeds the 50MB limit.', 413);
		}
		chunks.push(chunk);
	}
	return Buffer.concat(chunks, size);
}

/** Map an attachment row → the compact client descriptor with a resolvable url. */
export function attachmentEntry(row) {
	const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {};
	return {
		id: row.id,
		type: row.type,
		url: row.type === 'url' ? (row.url ?? null) : `/api/chat/uploads/${row.id}`,
		name: row.display_name ?? '',
		mimeType: row.content_type ?? 'application/octet-stream',
		size: Number(row.size ?? 0),
		width: metadata.width ?? undefined,
		height: metadata.height ?? undefined,
		durationMs: metadata.durationMs ?? undefined,
		metadata,
		createdAt: row.created_at ?? null,
	};
}

/** POST /api/chat/uploads?channelId=&name=&type= — body = raw file bytes. */
export async function handleUpload(deps, session, url, request, response, config, requireChannelAccess) {
	const channelId = safeText(url.searchParams.get('channelId'), 80);
	await requireChannelAccess(config, deps.fetchImpl, session.userId, channelId);
	takeToken(`upload:${session.userId}`, { capacity: 5, refillPerSec: 0.5 });
	const buf = await readRawBody(request);
	if (buf.length === 0) throw httpError('Upload body is empty.', 422);
	const contentType = safeText(request.headers['content-type'], 160) || 'application/octet-stream';
	const requestedType = safeText(url.searchParams.get('type'), 16);
	const type = MEDIA_TYPES.has(requestedType) && requestedType !== 'url' ? requestedType : typeFromMime(contentType);
	const sha256 = createHash('sha256').update(buf).digest('hex');
	const objectKey = storageObjectKey(sha256, extFromMime(contentType));
	const existing = await rest(config, deps.fetchImpl, `osionos_message_attachments?owner_id=eq.${session.userId}&sha256=eq.${sha256}&select=object_key&limit=1`);
	if (!(Array.isArray(existing) && existing[0]?.object_key)) {
		await ensureChatBucket(session.userId, deps.fetchImpl, deps.env);
		await storagePut(session.userId, objectKey, contentType, buf, deps.fetchImpl, deps.env);
	}
	return sendJson(response, 201, {
		ok: true,
		attachment: {
			type, bucket: 'chat', objectKey, sha256,
			name: safeText(url.searchParams.get('name'), 200) || objectKey,
			mimeType: contentType, size: buf.length, metadata: {},
		},
	}, config);
}

/** GET /api/chat/uploads/:id — membership-gated byte stream (ETag/304). */
export async function handleServe(deps, session, attachmentId, request, response, config, requireChannelAccess) {
	const rows = await rest(config, deps.fetchImpl, `osionos_message_attachments?id=eq.${attachmentId}&select=*&limit=1`);
	const row = Array.isArray(rows) ? rows[0] : null;
	if (!row) throw httpError('Attachment not found.', 404);
	await requireChannelAccess(config, deps.fetchImpl, session.userId, row.channel_id);
	if (row.type === 'url' || !row.object_key) throw httpError('No stored object for this attachment.', 404);
	if (safeText(request.headers['if-none-match'], 80).replace(/"/g, '') === row.sha256 && row.sha256) {
		response.writeHead(304, { etag: `"${row.sha256}"`, 'cache-control': 'private, max-age=86400' });
		response.end();
		return true;
	}
	const object = await storageGet(row.owner_id, row.object_key, deps.fetchImpl, deps.env);
	if (object.status !== 200 || !object.buffer) throw httpError('Stored object is unavailable.', object.status === 404 ? 404 : 502);
	// Build headers without an `etag: undefined` entry — Node's writeHead throws on
	// an undefined header value, which surfaced as a 500 when sha256 was missing.
	const headers = {
		'content-type': row.content_type || object.contentType || 'application/octet-stream',
		'content-length': String(object.buffer.length),
		'cache-control': 'private, max-age=86400',
		'access-control-allow-origin': config.allowedOrigin,
		'access-control-allow-credentials': 'true',
		vary: 'Origin',
	};
	if (row.sha256) headers.etag = `"${row.sha256}"`;
	response.writeHead(200, headers);
	response.end(object.buffer);
	return true;
}

/** GET /api/chat/channels/:id/media?type= — per-channel gallery (≤200, desc). */
export async function handleGallery(deps, session, url, channelId, response, config, requireChannelAccess) {
	const { channel } = await requireChannelAccess(config, deps.fetchImpl, session.userId, channelId);
	const filter = safeText(url.searchParams.get('type'), 16);
	let path = `osionos_message_attachments?channel_id=eq.${channel.id}&select=*&order=created_at.desc&limit=200`;
	if (MEDIA_TYPES.has(filter)) path += `&type=eq.${filter}`;
	const rows = await rest(config, deps.fetchImpl, path);
	const media = (Array.isArray(rows) ? rows : []).map(attachmentEntry);
	return sendJson(response, 200, { ok: true, media }, config);
}

function metaTag(html, ...names) {
	for (const name of names) {
		const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i');
		const alt = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i');
		const m = re.exec(html) ?? alt.exec(html);
		if (m && m[1]) return safeText(m[1], 500);
	}
	return '';
}

/**
 * POST /api/chat/link-preview {url} — SSRF-guarded OG/title scrape.
 *
 * The fetch goes through bridge-url-guard (the address blocklist) and
 * bridge-url-fetch (the socket + the hand-followed redirects): the address is
 * checked against the blocklist AND against the address the socket really
 * connects to, and every redirect hop is re-validated.
 * `deps.linkPreviewTransport` and `deps.resolveHost` are the injection seams
 * the tests drive.
 */
export async function handleLinkPreview(deps, session, payload, response, config) {
	void session;
	const parsed = await assertPublicHttpUrl(safeText(payload.url, 2048), { resolve: deps.resolveHost });
	let upstream;
	try {
		upstream = await fetchPublicHtml(parsed.toString(), {
			transport: deps.linkPreviewTransport,
			resolve: deps.resolveHost,
			headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'osionos-link-preview/1.0' },
			timeoutMs: LINK_PREVIEW_TIMEOUT_MS,
			maxBytes: LINK_PREVIEW_BYTES,
		});
	} catch (error) {
		if (error?.status) throw error;
		throw httpError('Could not fetch the link.', 502);
	}
	if (!upstream?.ok) throw httpError('Could not fetch the link.', 502);
	const html = upstream.text().slice(0, LINK_PREVIEW_BYTES);
	const titleTag = /<title[^>]*>([^<]{0,500})<\/title>/i.exec(html);
	return sendJson(response, 200, {
		ok: true,
		preview: {
			title: metaTag(html, 'og:title', 'twitter:title') || safeText(titleTag?.[1], 300),
			description: metaTag(html, 'og:description', 'twitter:description', 'description'),
			image: metaTag(html, 'og:image', 'twitter:image'),
			url: parsed.toString(),
		},
	}, config);
}
