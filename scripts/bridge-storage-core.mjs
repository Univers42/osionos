/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-storage-core.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Grobase storage-router client for the osionos messenger media plane.
 *
 * The bridge proxies the raw bytes — browser-direct upload is impossible
 * (S3_PUBLIC_ENDPOINT is empty, no presign). Auth is compat-mode: a single
 * `x-user-id: <ownerId>` header (NO JWT, NO Kong). The router AUTO-PREFIXES the
 * object key with `{ownerId}/`, so callers pass key=`{sha256}.{ext}` and the
 * stored key becomes `{ownerId}/{sha256}.{ext}` — same owner + same content =
 * same object (idempotent overwrite → content dedup).
 *
 * Node built-ins only. Best-effort with clear errors (httpError 502/timeout).
 */

import { httpError } from './bridge-social-core.mjs';

const STORAGE_TIMEOUT_MS = 15_000;
const BUCKET = 'chat';

const EXT_BY_MIME = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/svg+xml': 'svg',
	'image/avif': 'avif',
	'video/mp4': 'mp4',
	'video/webm': 'webm',
	'video/quicktime': 'mov',
	'audio/webm': 'webm',
	'audio/ogg': 'ogg',
	'audio/mpeg': 'mp3',
	'audio/mp4': 'm4a',
	'audio/wav': 'wav',
	'application/pdf': 'pdf',
	'text/plain': 'txt',
};

export function storageBase(env = process.env) {
	return (env.STORAGE_ROUTER_URL ?? 'http://mini-baas-storage-router:3040/storage/v1').replace(/\/$/, '');
}

/** Pick a safe lowercase extension from a content type (fallback 'bin'). */
export function extFromMime(contentType) {
	const mime = String(contentType ?? '').split(';')[0].trim().toLowerCase();
	if (EXT_BY_MIME[mime]) return EXT_BY_MIME[mime];
	const tail = mime.split('/')[1] ?? '';
	const safe = tail.replace(/[^a-z0-9]/g, '');
	return safe.slice(0, 8) || 'bin';
}

/** Coarse media type bucket from a content type (image|video|audio|file). */
export function typeFromMime(contentType) {
	const mime = String(contentType ?? '').split(';')[0].trim().toLowerCase();
	if (mime.startsWith('image/')) return 'image';
	if (mime.startsWith('video/')) return 'video';
	if (mime.startsWith('audio/')) return 'audio';
	return 'file';
}

/** Object key under the bucket — the router prefixes `{ownerId}/` itself. */
export function storageObjectKey(sha256, ext) {
	return `${sha256}.${ext}`;
}

/** Ensure the private 'chat' bucket exists (idempotent — 'created:false' is OK). */
export async function ensureChatBucket(ownerId, fetchImpl = fetch, env = process.env) {
	try {
		await fetchImpl(`${storageBase(env)}/bucket/${BUCKET}`, {
			method: 'POST',
			headers: { 'x-user-id': ownerId, 'content-type': 'application/json' },
			body: JSON.stringify({ public: false }),
			signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
		});
	} catch (error) {
		console.warn(`[osionos-bridge] storage bucket ensure skipped: ${error instanceof Error ? error.message : 'unreachable'}`);
	}
}

/** PUT raw bytes under bucket 'chat' as the owner. Returns the router JSON. */
export async function storagePut(ownerId, key, contentType, bodyBuffer, fetchImpl = fetch, env = process.env) {
	const response = await fetchImpl(`${storageBase(env)}/object/${BUCKET}/${encodeURIComponent(key)}`, {
		method: 'PUT',
		headers: { 'x-user-id': ownerId, 'content-type': contentType || 'application/octet-stream' },
		body: bodyBuffer,
		signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
	}).catch((error) => {
		throw httpError(`Storage upload failed: ${error instanceof Error ? error.message : 'unreachable'}`, 502);
	});
	const text = await response.text().catch(() => '');
	if (!response.ok) throw httpError(`Storage upload rejected (${response.status}): ${text.slice(0, 160)}`, 502);
	try {
		return JSON.parse(text);
	} catch {
		return { bucket: BUCKET, key };
	}
}

/** GET bytes for an object as the owner. Returns {status, buffer, contentType}. */
export async function storageGet(ownerId, key, fetchImpl = fetch, env = process.env) {
	const response = await fetchImpl(`${storageBase(env)}/object/${BUCKET}/${encodeURIComponent(key)}`, {
		method: 'GET',
		headers: { 'x-user-id': ownerId },
		signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
	}).catch((error) => {
		throw httpError(`Storage fetch failed: ${error instanceof Error ? error.message : 'unreachable'}`, 502);
	});
	if (!response.ok) {
		return { status: response.status === 404 ? 404 : 502, buffer: null, contentType: null };
	}
	const arrayBuffer = await response.arrayBuffer();
	return {
		status: 200,
		buffer: Buffer.from(arrayBuffer),
		contentType: response.headers.get('content-type') || 'application/octet-stream',
	};
}
