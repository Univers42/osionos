import { createHash } from 'node:crypto';
import { config } from '../config.ts';
import { readImageHeader } from '../vision/imageHeader.ts';
import { stripMetadata } from '../vision/stripMetadata.ts';

/**
 * The bytes of a generated image: checked, stripped, and stored through the
 * bridge (devil C76).
 *
 * Whatever the engine answered is untrusted until its own bytes say it is a
 * png, jpeg or webp of a sane size. The metadata goes: sd-server writes the
 * prompt into a `tEXt` chunk (A1 finding 3), and the stored file sits behind
 * a capability URL. The upload carries the caller's token of THIS request to
 * the operator-configured bridge; the service never holds a storage URL.
 */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 4096;
const UPLOAD_TIMEOUT_MS = 30_000;
/** The answer of the bridge's upload: its own capability path, nothing else. */
const MEDIA_PATH = /^\/api\/media\/uploads\/[0-9a-f-]{36}\/[0-9a-f]{64}\.[a-z0-9]{1,8}$/;

export interface CheckedImage {
	bytes: Uint8Array;
	width: number;
	height: number;
	mediaType: string;
}

export interface StoredImage {
	url: string;
	sha256: string;
	width: number;
	height: number;
	mediaType: string;
}

function imageError(code: string): Error {
	return Object.assign(new Error(code), { code });
}

/** The bytes of the engine, as an image the service will store, or a refusal. */
export function checkImage(bytes: Uint8Array): CheckedImage {
	if (bytes.byteLength > MAX_IMAGE_BYTES) throw imageError('image_too_large');
	const header = readImageHeader(bytes);
	if (header.width > MAX_IMAGE_SIDE || header.height > MAX_IMAGE_SIDE) throw imageError('image_too_large');
	return {
		bytes: stripMetadata(bytes),
		width: header.width,
		height: header.height,
		mediaType: `image/${header.format}`,
	};
}

/**
 * The upload of the image to the bridge, as the caller.
 *
 * A redirect is never followed: it would carry the token elsewhere. The answer
 * must name the bytes that were sent — the same sha256 — or the image is not
 * stored as far as the run knows.
 */
export async function uploadImage(
	image: CheckedImage,
	{ runId, token, signal }: { runId: string; token: string; signal: AbortSignal },
): Promise<StoredImage> {
	const base = (config.bridgeUrl ?? '').replace(/\/+$/, '');
	const name = `ai-image-${runId}.${image.mediaType.slice('image/'.length)}`;
	let response: Response;
	try {
		response = await fetch(`${base}/api/media/uploads?name=${encodeURIComponent(name)}`, {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': image.mediaType },
			body: image.bytes,
			redirect: 'manual',
			signal: AbortSignal.any([signal, AbortSignal.timeout(UPLOAD_TIMEOUT_MS)]),
		});
	} catch (error) {
		if (signal.aborted) throw error;
		throw imageError('storage_failed');
	}
	const body = (await response.json().catch(() => null)) as { media?: { url?: unknown; sha256?: unknown } } | null;
	const sha256 = createHash('sha256').update(image.bytes).digest('hex');
	const url = body?.media?.url;
	if (!response.ok || typeof url !== 'string' || !MEDIA_PATH.test(url) || body?.media?.sha256 !== sha256) {
		throw imageError('storage_failed');
	}
	return { url, sha256, width: image.width, height: image.height, mediaType: image.mediaType };
}
