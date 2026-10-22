/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-avatar.mjs                                  :::      :::    :::   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The avatar plane: the BYTES live in storage, the profile holds the path.
 *
 * An avatar used to be a `data:` URL of up to 200 KB inside the identities blob,
 * and it rode in every list projection — a 200-person directory page carried
 * ~40 MB of base64. Now the client sends three square variants, the bridge
 * checks their bytes, strips their metadata, stores them content-addressed in
 * the `avatars` bucket and writes ONE path into `osionos_profiles.avatar_url`.
 *
 * The served object needs no session: an avatar is shown to other people, and
 * the key is the content address of the bytes.
 *
 * Caveat: the account seam carries no fetch of its own, so the storage calls
 * here use the global client; the tests inject one.
 */

import { createHash } from 'node:crypto';

import { rateLimit } from './bridge-guard.mjs';
import { imageInfo, stripImageMetadata } from './bridge-image-meta.mjs';
import { bearerToken, httpError, readJsonBody, safeText, sendJson } from './bridge-social-core.mjs';
import { ensureBucket, servedObjectHeaders, storageGet, storagePut } from './bridge-storage-core.mjs';

const AVATAR_BUCKET = 'avatars';
const VARIANT_SIZES = [64, 160, 460];
const VARIANT_CAPS = { 64: 24 * 1024, 160: 80 * 1024, 460: 300 * 1024 };
const BODY_LIMIT = 512 * 1024;
const LEGACY_MAX_BYTES = 200 * 1024;
const UPLOAD_LIMIT = 10;
const UPLOAD_WINDOW_MS = 3_600_000;
const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const AVATAR_TYPES = new Set(['image/webp', 'image/jpeg']);
const LEGACY_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const EXT_BY_TYPE = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' };
const TYPE_BY_EXT = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif' };
const SERVE_RE = /^\/api\/media\/avatars\/([0-9a-f-]{36})\/([0-9a-f]{64}(?:-(?:64|160|460))?\.(?:webp|jpg|png|gif))$/i;
const DATA_URL_RE = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/;

let warnedPublicUrl = false;

function avatarError(status, code, message) {
	return Object.assign(new Error(message), { status, code });
}

/**
 * The public origin of the bridge. An unset value leaves the avatar paths
 * relative to the app origin (the app rewrites /api/* to the bridge), and the
 * operator is told once, because an absolute URL is what a consumer needs when
 * the picture is shown outside the app.
 *
 * The value comes from `OSIONOS_BRIDGE_PUBLIC_URL` (the config carries it in
 * the tests, where there is no environment to read).
 */
function publicBase(config) {
	const base = String(config?.publicUrl ?? process.env.OSIONOS_BRIDGE_PUBLIC_URL ?? '').trim().replace(/\/$/, '');
	if (!base && !warnedPublicUrl) {
		warnedPublicUrl = true;
		console.warn('[osionos-bridge] OSIONOS_BRIDGE_PUBLIC_URL is unset — the avatar URLs stay relative to the app origin.');
	}
	return base;
}

/**
 * The ONE projection helper for a user avatar: a `data:` URL never leaves the
 * bridge, a stored path becomes an absolute URL, an `https:` URL is kept, and
 * anything else is no avatar at all.
 */
export function publicAvatar(value, config) {
	if (typeof value !== 'string' || value === '') return null;
	if (value.startsWith('data:')) return null;
	if (value.startsWith('/api/media/')) {
		const base = publicBase(config);
		return base ? `${base}${value}` : value;
	}
	if (value.startsWith('https://')) return value;
	return null;
}

/** The bytes of one base64 variant, or the 422 a malformed body deserves. */
function decodeBase64(value, field) {
	const trimmed = String(value ?? '').trim();
	if (trimmed === '' || trimmed.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
		throw avatarError(422, 'avatar_variant_invalid', `The ${field} variant is not base64.`);
	}
	const bytes = Buffer.from(trimmed, 'base64');
	if (bytes.length === 0) throw avatarError(422, 'avatar_variant_invalid', `The ${field} variant is empty.`);
	return bytes;
}

/** The type and the dimensions of a variant, or the 415 its bytes deserve. */
function describeVariant(bytes, field) {
	let info;
	try {
		info = imageInfo(bytes);
	} catch {
		throw avatarError(415, 'unsupported_media_type', `The ${field} variant is not a readable image.`);
	}
	return info;
}

/**
 * The three variants of a body: `variants: { "64": b64, "160": b64, "460": b64 }`.
 * Each one must be a WebP or a JPEG, exactly square at its size, and under its
 * own cap — the caps are what keep the three objects small enough to serve.
 */
function readVariants(payload) {
	const raw = payload?.variants;
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		throw avatarError(422, 'avatar_variants_missing', 'The avatar body must carry the three variants.');
	}
	for (const key of Object.keys(raw)) {
		if (!VARIANT_SIZES.includes(Number(key))) {
			throw avatarError(422, 'avatar_variant_unknown', `The ${key}px variant is not one of the three the bridge stores.`);
		}
	}
	const variants = new Map();
	for (const size of VARIANT_SIZES) {
		const bytes = decodeBase64(raw[String(size)], `${size}px`);
		if (bytes.length > VARIANT_CAPS[size]) {
			throw avatarError(422, 'avatar_variant_too_large', `The ${size}px variant is over its ${Math.round(VARIANT_CAPS[size] / 1024)}KB cap.`);
		}
		const info = describeVariant(bytes, `${size}px`);
		if (!AVATAR_TYPES.has(info.type)) {
			throw avatarError(415, 'unsupported_media_type', `The ${size}px variant is not a WebP or a JPEG.`);
		}
		if (info.width !== size || info.height !== size) {
			throw avatarError(422, 'avatar_variant_not_square', `The ${size}px variant is ${info.width}x${info.height}, not square.`);
		}
		variants.set(size, { bytes, type: info.type });
	}
	return variants;
}

/** The legacy body of a cached client: one `data:` URL, stored once. */
function readLegacyAvatar(payload) {
	const match = DATA_URL_RE.exec(String(payload?.dataUrl ?? ''));
	if (!match) throw avatarError(422, 'avatar_data_url_invalid', 'The avatar body must carry a base64 image data URL.');
	const bytes = Buffer.from(match[2], 'base64');
	if (bytes.length === 0 || bytes.length > LEGACY_MAX_BYTES) {
		throw avatarError(422, 'avatar_data_url_invalid', 'The avatar data URL is empty or over the 200KB limit.');
	}
	const info = describeVariant(bytes, 'avatar');
	if (!LEGACY_TYPES.has(info.type)) {
		throw avatarError(415, 'unsupported_media_type', 'The avatar data URL is not a PNG, a JPEG, a WebP or a GIF.');
	}
	return { bytes, type: info.type };
}

/** The bytes without their metadata: a GPS block never leaves the bridge. */
function strip(bytes) {
	try {
		return stripImageMetadata(bytes);
	} catch {
		throw avatarError(415, 'unsupported_media_type', 'The avatar bytes are not a readable image.');
	}
}

/** The object key of a variant: the content address of the 460 variant, then the size. */
function objectKey(sha, size, type) {
	return `${sha}-${size}.${EXT_BY_TYPE[type]}`;
}

/** The path the profile holds: the 160px variant, the one a card shows. */
function avatarPath(userId, key) {
	return `/api/media/avatars/${userId}/${key}`;
}

/** POST /api/profile/avatar — the three variants, or the legacy data URL. */
async function postAvatar(deps, session, request, response, config) {
	await rateLimit(deps.kv, ['avatar', session.userId], { limit: UPLOAD_LIMIT, windowMs: UPLOAD_WINDOW_MS });
	const payload = await readJsonBody(request, BODY_LIMIT);
	const legacy = payload?.dataUrl ? readLegacyAvatar(payload) : null;
	const variants = legacy ? null : readVariants(payload);

	// The stripped bytes: the metadata (a GPS block) never leaves the bridge.
	const items = legacy
		? [{ size: null, bytes: strip(legacy.bytes), type: legacy.type }]
		: [...variants].map(([size, variant]) => ({ size, bytes: strip(variant.bytes), type: variant.type }));
	// One content address for the three: the sha of the 460 variant names them all.
	const largest = items.find((item) => item.size === 460) ?? items[0];
	const sha = createHash('sha256').update(largest.bytes).digest('hex');

	await ensureBucket(session.userId, AVATAR_BUCKET, deps.fetchImpl, deps.env);
	let mainKey = '';
	for (const item of items) {
		const key = item.size === null ? `${sha}.${EXT_BY_TYPE[item.type]}` : objectKey(sha, item.size, item.type);
		await storagePut(session.userId, key, item.type, item.bytes, deps.fetchImpl, deps.env, AVATAR_BUCKET);
		if (item.size === null || item.size === 160) mainKey = key;
	}
	const path = avatarPath(session.userId, mainKey);
	await deps.pg.asService().patch(`osionos_profiles?user_id=eq.${session.userId}`, { avatar_url: path }, { prefer: 'return=minimal' });
	return sendJson(response, 201, { ok: true, userId: session.userId, avatar: publicAvatar(path, config) ?? path, avatarPath: path }, config);
}

/**
 * DELETE /api/profile/avatar — the profile column AND the legacy blob.
 *
 * Without the second write a later migration run finds `avatar_url` NULL and the
 * old `data:` avatar still in the identities, and restores the avatar the user
 * just deleted.
 */
async function deleteAvatar(deps, session, response, config) {
	await deps.pg.asService().patch(`osionos_profiles?user_id=eq.${session.userId}`, { avatar_url: null }, { prefer: 'return=minimal' });
	const rows = await deps.pg.asService().get(`osionos_bridge_identities?user_id=eq.${session.userId}&select=profile&limit=1`);
	const row = Array.isArray(rows) ? rows[0] ?? null : null;
	const profile = row?.profile && typeof row.profile === 'object' && !Array.isArray(row.profile) ? row.profile : {};
	if (row && Object.hasOwn(profile, 'avatar')) {
		const next = { ...profile };
		delete next.avatar;
		await deps.pg.asService().patch(`osionos_bridge_identities?user_id=eq.${session.userId}`, {
			profile: next,
			updated_at: new Date().toISOString(),
		}, { prefer: 'return=minimal' });
	}
	response.writeHead(204, {
		'cache-control': 'no-store',
		'access-control-allow-origin': config.allowedOrigin,
		'access-control-allow-credentials': 'true',
		vary: 'Origin',
	});
	response.end();
	return true;
}

/** GET /api/media/avatars/:userId/:key — the bytes, with no session. */
async function serveAvatar(deps, userId, key, request, response, config) {
	const etag = `"${key}"`;
	if (safeText(request.headers['if-none-match'], 80).replace(/"/g, '') === key) {
		response.writeHead(304, { etag, 'cache-control': CACHE_CONTROL, vary: 'Origin' });
		response.end();
		return true;
	}
	const object = await storageGet(userId, key, deps.fetchImpl, deps.env, AVATAR_BUCKET);
	if (object.status !== 200 || !object.buffer) {
		throw httpError('Stored avatar is unavailable.', object.status === 404 ? 404 : 502);
	}
	const type = TYPE_BY_EXT[key.split('.').pop().toLowerCase()] ?? 'application/octet-stream';
	response.writeHead(200, {
		...servedObjectHeaders(type),
		'content-length': String(object.buffer.length),
		'cache-control': CACHE_CONTROL,
		etag,
		'access-control-allow-origin': config.allowedOrigin,
		vary: 'Origin',
	});
	response.end(object.buffer);
	return true;
}

/**
 * The avatar routes of the account plane: the upload, the delete and the
 * capability URL. A path that is not theirs is not claimed.
 */
export function createAvatarRoutes({ config, pg, kv, verifySession, fetchImpl = fetch, env = process.env }) {
	const deps = { pg, kv, fetchImpl, env };
	return async function handleAvatarRoute(url, request, response) {
		const pathname = url.pathname;
		const method = (request.method || 'GET').toUpperCase();
		const isAvatar = pathname === '/api/profile/avatar';
		const serve = SERVE_RE.exec(pathname);
		if (!isAvatar && !serve) return false;
		if (serve && method === 'GET') return serveAvatar(deps, serve[1].toLowerCase(), serve[2].toLowerCase(), request, response, config);
		if (isAvatar && (method === 'POST' || method === 'DELETE')) {
			const session = verifySession(bearerToken(request), config);
			if (method === 'POST') return postAvatar(deps, session, request, response, config);
			return deleteAvatar(deps, session, response, config);
		}
		throw httpError(`Method ${method} is not supported here.`, 405);
	};
}
