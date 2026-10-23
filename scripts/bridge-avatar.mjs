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
 * and it rode in every list projection. Now the client sends three square
 * variants, the bridge checks their bytes, strips their metadata, stores them
 * content-addressed in the `avatars` bucket and writes ONE path into
 * `osionos_profiles.avatar_url`. The served object needs no session: an avatar
 * is shown to other people, and the key is the content address of the bytes.
 *
 * The banner is the same pipeline with ONE 1500x500 variant stored as `<sha>-banner.<ext>`.
 *
 * Caveat: the account seam carries no fetch of its own, so the storage calls
 * here use the global client; the tests inject one.
 */

import { createHash } from 'node:crypto';

import { rateLimit } from './bridge-guard.mjs';
import { imageInfo, stripImageMetadata } from './bridge-image-meta.mjs';
import { bearerToken, httpError, readJsonBody, safeText, sendJson } from './bridge-social-core.mjs';
import { ensureBucket, servedObjectHeaders, storageDelete, storageGet, storagePut } from './bridge-storage-core.mjs';

const AVATAR_BUCKET = 'avatars';
const VARIANT_SIZES = [64, 160, 460];
const VARIANT_CAPS = { 64: 24 * 1024, 160: 80 * 1024, 460: 300 * 1024 };
const BANNER_WIDTH = 1500;
const BANNER_HEIGHT = 500;
const BANNER_CAP = 400 * 1024;
const BANNER_BODY_LIMIT = 640 * 1024;
// The sizes the bridge stores, their caps and the canvas cap: the caps keep
// the three objects small enough to serve.
const MAX_EDGE = 4096;
const BODY_LIMIT = 512 * 1024;
const LEGACY_MAX_BYTES = 200 * 1024;
const UPLOAD_LIMIT = 10;
const UPLOAD_WINDOW_MS = 3_600_000;
const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const AVATAR_TYPES = new Set(['image/webp', 'image/jpeg']);
const LEGACY_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const EXT_BY_TYPE = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' };
const TYPE_BY_EXT = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif' };
const BANNER_ROUTE = '/api/profile/banner';
const AVATAR_PATH_RE = /^\/api\/media\/avatars\/([^/]+)\/([^/]+)$/;
const SERVE_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{64}(?:-(?:64|160|460|banner))?\.(?:webp|jpg|png|gif))$/i;
const DATA_URL_RE = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/;
const HOSTILE_SCHEMES = /^(data|javascript|vbscript|file|blob|http):/i;

let warnedPublicUrl = false;

function avatarError(status, code, message) {
	return Object.assign(new Error(message), { status, code });
}

/** The public origin of the bridge: unset, the avatar paths stay relative to the app origin. */
function publicBase(config) {
	const base = String(config?.publicUrl ?? process.env.OSIONOS_BRIDGE_PUBLIC_URL ?? '').trim().replace(/\/$/, '');
	if (!base && !warnedPublicUrl) {
		warnedPublicUrl = true;
		console.warn('[osionos-bridge] OSIONOS_BRIDGE_PUBLIC_URL is unset — the avatar URLs stay relative to the app origin.');
	}
	return base;
}

/** The ONE projection helper for a user avatar: a `data:` URL never leaves the bridge. */
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

/**
 * The channel and community avatar: an icon value (an emoji, a lucide name, an
 * `img:` URL) or a stored media path. It is NOT a user avatar — the community
 * picker stores an emoji, so the icon value is kept; a `data:`, `javascript:`
 * or `http:` value never survives, for every list response would carry it.
 */
export function publicIconAvatar(value, config) {
	if (typeof value !== 'string' || value === '') return null;
	if (HOSTILE_SCHEMES.test(value)) return null;
	return publicAvatar(value, config) ?? value;
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

/**
 * The type, the dimensions and the bytes of one variant: the bytes without
 * their metadata (a GPS block never leaves the bridge) and a canvas no bigger
 * than an avatar may be (the shared parser caps nothing: page media may be
 * legitimately larger).
 */
function readVariant(bytes, field, types) {
	let info;
	try {
		info = imageInfo(bytes);
	} catch {
		throw avatarError(415, 'unsupported_media_type', `The ${field} variant is not a readable image.`);
	}
	if (!types.has(info.type)) throw avatarError(415, 'unsupported_media_type', `The ${field} variant is not one of the types the bridge stores.`);
	if (info.width > MAX_EDGE || info.height > MAX_EDGE) throw avatarError(422, 'invalid_image', `The ${field} variant is larger than ${MAX_EDGE} pixels.`);
	try {
		return { bytes: stripImageMetadata(bytes), type: info.type, width: info.width, height: info.height };
	} catch {
		throw avatarError(415, 'unsupported_media_type', `The ${field} variant is not a readable image.`);
	}
}

/**
 * The three variants of a body: `variants: { "64": b64, "160": b64, "460": b64 }`,
 * each a WebP or a JPEG, exactly square at its size and under its own cap.
 */
function readVariants(payload) {
	const raw = payload?.variants;
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw avatarError(422, 'avatar_variants_missing', 'The avatar body must carry the three variants.');
	for (const key of Object.keys(raw)) {
		if (!VARIANT_SIZES.includes(Number(key))) {
			throw avatarError(422, 'avatar_variant_unknown', `The ${key}px variant is not one of the three the bridge stores.`);
		}
	}
	const variants = new Map();
	for (const size of VARIANT_SIZES) {
		const bytes = decodeBase64(raw[String(size)], `${size}px`);
		if (bytes.length > VARIANT_CAPS[size]) throw avatarError(422, 'avatar_variant_too_large', `The ${size}px variant is over its ${Math.round(VARIANT_CAPS[size] / 1024)}KB cap.`);
		const variant = readVariant(bytes, `${size}px`, AVATAR_TYPES);
		if (variant.width !== size || variant.height !== size) {
			throw avatarError(422, 'avatar_variant_not_square', `The ${size}px variant is ${variant.width}x${variant.height}, not square.`);
		}
		variants.set(size, variant);
	}
	return variants;
}

/** The legacy body of a cached client: one `data:` URL, stored once. */
function readLegacyAvatar(payload) {
	const match = DATA_URL_RE.exec(String(payload?.dataUrl ?? ''));
	if (!match) throw avatarError(422, 'avatar_data_url_invalid', 'The avatar body must carry a base64 image data URL.');
	const bytes = Buffer.from(match[2], 'base64');
	if (bytes.length === 0 || bytes.length > LEGACY_MAX_BYTES) throw avatarError(422, 'avatar_data_url_invalid', 'The avatar data URL is empty or over the 200KB limit.');
	return readVariant(bytes, 'avatar', LEGACY_TYPES);
}

/**
 * The stored objects of a deleted avatar: the three variants of a path, or the
 * one legacy object.
 *
 * Caveat: a browser or a CDN that cached the immutable URL may keep serving it
 * until its cache expires, and a delete that fails leaves the object in the
 * bucket until the bucket's own lifecycle removes it. The request still
 * succeeds: the profile no longer points at it.
 */
async function removeStoredVariants(deps, userId, path) {
	const key = String(path ?? '').split('/').pop() ?? '';
	const match = /^([0-9a-f]{64})(?:-(\d+|banner))?\.(webp|jpg|png|gif)$/.exec(key);
	if (!match) return;
	const [, sha, size, ext] = match;
	let keys = [`${sha}.${ext}`];
	if (size === 'banner') keys = [key];
	else if (size) keys = VARIANT_SIZES.map((candidate) => `${sha}-${candidate}.${ext}`);
	for (const stored of keys) {
		try {
			await storageDelete(userId, stored, deps.fetchImpl, deps.env, AVATAR_BUCKET);
		} catch (error) {
			console.warn(`[osionos-bridge] avatar object ${stored.slice(0, 8)} could not be deleted (${error?.status ?? 'unknown'}).`);
		}
	}
}

/** POST /api/profile/avatar — the three variants, or the legacy data URL. */
async function postAvatar(deps, session, request, response, config) {
	await rateLimit(deps.kv, ['avatar', session.userId], { limit: UPLOAD_LIMIT, windowMs: UPLOAD_WINDOW_MS });
	const payload = await readJsonBody(request, BODY_LIMIT);
	const legacy = payload?.dataUrl ? readLegacyAvatar(payload) : null;
	const variants = legacy ? null : readVariants(payload);
	const items = legacy ? [{ size: null, ...legacy }] : [...variants].map(([size, variant]) => ({ size, ...variant }));
	// One content address for the three: the sha of the 460 variant names them all.
	const largest = items.find((item) => item.size === 460) ?? items[0];
	const sha = createHash('sha256').update(largest.bytes).digest('hex');
	await ensureBucket(session.userId, AVATAR_BUCKET, deps.fetchImpl, deps.env);
	let mainKey = '';
	for (const item of items) {
		const key = item.size === null ? `${sha}.${EXT_BY_TYPE[item.type]}` : `${sha}-${item.size}.${EXT_BY_TYPE[item.type]}`;
		await storagePut(session.userId, key, item.type, item.bytes, deps.fetchImpl, deps.env, AVATAR_BUCKET);
		if (item.size === null || item.size === 160) mainKey = key;
	}
	const path = `/api/media/avatars/${session.userId}/${mainKey}`;
	const written = await deps.pg.asService().patch(
		`osionos_profiles?user_id=eq.${session.userId}`,
		{ avatar_url: path },
		{ prefer: 'return=representation' },
	);
	if (!(Array.isArray(written) && written.length > 0)) {
		throw avatarError(404, 'profile_missing', 'The account has no profile row to hold the avatar.');
	}
	return sendJson(response, 201, { ok: true, userId: session.userId, avatar: publicAvatar(path, config) ?? path, avatarPath: path }, config);
}

/** The one banner variant of a body: `{ banner: b64 }`, a WebP or JPEG, exactly 1500x500, under 400 KB. */
function readBanner(payload) {
	const bytes = decodeBase64(payload?.banner, 'banner');
	if (bytes.length > BANNER_CAP) throw avatarError(422, 'banner_too_large', `The banner is over its ${BANNER_CAP / 1024}KB cap.`);
	const banner = readVariant(bytes, 'banner', AVATAR_TYPES);
	if (banner.width !== BANNER_WIDTH || banner.height !== BANNER_HEIGHT) {
		throw avatarError(422, 'banner_wrong_size', `The banner is ${banner.width}x${banner.height}, not ${BANNER_WIDTH}x${BANNER_HEIGHT}.`);
	}
	return banner;
}

/** POST /api/profile/banner — the avatar pipeline with one variant; the owner is the session, never the body. */
async function postBanner(deps, session, request, response, config) {
	await rateLimit(deps.kv, ['banner', session.userId], { limit: UPLOAD_LIMIT, windowMs: UPLOAD_WINDOW_MS });
	const banner = readBanner(await readJsonBody(request, BANNER_BODY_LIMIT));
	const sha = createHash('sha256').update(banner.bytes).digest('hex');
	const key = `${sha}-banner.${EXT_BY_TYPE[banner.type]}`;
	await ensureBucket(session.userId, AVATAR_BUCKET, deps.fetchImpl, deps.env);
	await storagePut(session.userId, key, banner.type, banner.bytes, deps.fetchImpl, deps.env, AVATAR_BUCKET);
	const path = `/api/media/avatars/${session.userId}/${key}`;
	const written = await deps.pg.asService().patch(
		`osionos_profiles?user_id=eq.${session.userId}`,
		{ banner_url: path },
		{ prefer: 'return=representation' },
	);
	if (!(Array.isArray(written) && written.length > 0)) {
		throw avatarError(404, 'profile_missing', 'The account has no profile row to hold the banner.');
	}
	return sendJson(response, 201, { ok: true, userId: session.userId, banner: publicAvatar(path, config) ?? path, bannerPath: path }, config);
}

/** DELETE /api/profile/banner — the column first, then the stored object (see removeStoredVariants' caveat). */
async function deleteBanner(deps, session, response, config) {
	const rows = await deps.pg.asService().get(`osionos_profiles?user_id=eq.${session.userId}&select=banner_url&limit=1`);
	const path = Array.isArray(rows) && typeof rows[0]?.banner_url === 'string' && rows[0].banner_url ? rows[0].banner_url : null;
	await deps.pg.asService().patch(`osionos_profiles?user_id=eq.${session.userId}`, { banner_url: null }, { prefer: 'return=minimal' });
	if (path) await removeStoredVariants(deps, session.userId, path);
	response.writeHead(204, { 'cache-control': 'no-store', 'access-control-allow-origin': config.allowedOrigin, 'access-control-allow-credentials': 'true', vary: 'Origin' });
	response.end();
	return true;
}

/**
 * DELETE /api/profile/avatar — the profile column, the legacy blob and the
 * stored objects. Without the blob write a later migration run finds the old
 * `data:` avatar in the identities and restores what the user just deleted.
 */
async function deleteAvatar(deps, session, response, config) {
	const rows = await deps.pg.asService().get(`osionos_profiles?user_id=eq.${session.userId}&select=avatar_url&limit=1`);
	const profileRow = Array.isArray(rows) ? rows[0] ?? null : null;
	const path = typeof profileRow?.avatar_url === 'string' && profileRow.avatar_url ? profileRow.avatar_url : null;
	await deps.pg.asService().patch(`osionos_profiles?user_id=eq.${session.userId}`, { avatar_url: null }, { prefer: 'return=minimal' });
	const identityRows = await deps.pg.asService().get(`osionos_bridge_identities?user_id=eq.${session.userId}&select=profile&limit=1`);
	const row = Array.isArray(identityRows) ? identityRows[0] ?? null : null;
	const profile = row?.profile && typeof row.profile === 'object' && !Array.isArray(row.profile) ? row.profile : {};
	if (row && Object.hasOwn(profile, 'avatar')) {
		const next = { ...profile };
		delete next.avatar;
		await deps.pg.asService().patch(`osionos_bridge_identities?user_id=eq.${session.userId}`, {
			profile: next,
			updated_at: new Date().toISOString(),
		}, { prefer: 'return=minimal' });
	}
	if (path) await removeStoredVariants(deps, session.userId, path);
	response.writeHead(204, { 'cache-control': 'no-store', 'access-control-allow-origin': config.allowedOrigin, 'access-control-allow-credentials': 'true', vary: 'Origin' });
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

/** The avatar routes answer their own errors: a body a browser must not sniff. */
function sendRouteError(response, config, status, code, message) {
	response.setHeader('x-content-type-options', 'nosniff');
	response.setHeader('content-security-policy', "default-src 'none'; sandbox");
	return sendJson(response, status, { ok: false, code, message }, config);
}

/** The avatar routes of the account plane: the upload, the delete and the capability URL. */
export function createAvatarRoutes({ config, pg, kv, verifySession, fetchImpl = fetch, env = process.env }) {
	const deps = { pg, kv, fetchImpl, env };
	return async function handleAvatarRoute(url, request, response) {
		const pathname = url.pathname;
		const method = (request.method || 'GET').toUpperCase();
		const isAvatar = pathname === '/api/profile/avatar';
		const isBanner = pathname === BANNER_ROUTE;
		const serve = AVATAR_PATH_RE.exec(pathname);
		if (!isAvatar && !isBanner && !serve) return false;
		try {
			if (serve && method === 'GET') {
				const match = SERVE_RE.exec(`${serve[1]}/${serve[2]}`);
				if (!match) return sendRouteError(response, config, 404, 'avatar_not_found', 'That avatar does not exist.');
				// `await` on purpose: a returned promise would escape this catch.
				return await serveAvatar(deps, match[1].toLowerCase(), match[2].toLowerCase(), request, response, config);
			}
			if (isAvatar && (method === 'POST' || method === 'DELETE')) {
				const session = verifySession(bearerToken(request), config);
				if (method === 'POST') return await postAvatar(deps, session, request, response, config);
				return await deleteAvatar(deps, session, response, config);
			}
			if (isBanner && (method === 'POST' || method === 'DELETE')) {
				const session = verifySession(bearerToken(request), config);
				if (method === 'POST') return await postBanner(deps, session, request, response, config);
				return await deleteBanner(deps, session, response, config);
			}
			throw httpError(`Method ${method} is not supported here.`, 405);
		} catch (error) {
			return sendRouteError(response, config, error?.status ?? 500, error?.code ?? 'avatar_error', error instanceof Error ? error.message : 'Avatar request failed.');
		}
	};
}
