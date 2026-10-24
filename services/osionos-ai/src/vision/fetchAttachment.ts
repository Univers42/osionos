/**
 * Fetch an attachment through the bridge, the way the service reads a page
 * the user attached: by id or by capability path, never by URL.
 *
 * The caller's token of THIS run request is read, used here, and nowhere
 * else: it is never stored and never logged (the C10 rule of P4a). The
 * guard of the endpoints (`guardedFetch`) is NOT used: its guard stays
 * unchanged, and the bridge is operator configuration.
 */

import { config } from '../config.ts';

/**
 * The capability path of a stored media file, the one the bridge serves
 * (SERVE_RE of the bridge): the only shape of a path the service fetches.
 */
export const MEDIA_CAPABILITY_PATH = /^\/api\/media\/uploads\/([0-9a-f-]{36})\/([0-9a-f]{64}\.[a-z0-9]{1,8})$/i;

/** The cap of an attachment: ten megabytes. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** The timeout of a fetch of an attachment. */
export const ATTACHMENT_TIMEOUT_MS = 30_000;

export interface FetchedAttachment {
	bytes: Uint8Array;
	mediaType: string;
}

interface FetchAttachmentOptions {
	path?: string;
	bridgeUrl?: string;
	token?: string;
	sessionToken?: string;
	timeoutMs?: number;
}

function normalize(args: unknown[]): { path: string; bridgeUrl?: string; token: string; timeoutMs: number } {
	if (typeof args[0] === 'string') {
		return {
			path: args[0],
			token: (typeof args[1] === 'string' ? args[1] : '') as string,
			timeoutMs: typeof args[2] === 'number' ? args[2] : ATTACHMENT_TIMEOUT_MS,
		};
	}
	const options = (args[0] ?? {}) as FetchAttachmentOptions;
	return {
		path: String(options.path ?? ''),
		bridgeUrl: options.bridgeUrl,
		token: String(options.token ?? options.sessionToken ?? ''),
		timeoutMs: options.timeoutMs ?? ATTACHMENT_TIMEOUT_MS,
	};
}

/** An error that carries the status and the code of an attachment failure. */
function attachmentError(status: number, code: string): Error {
	return Object.assign(new Error(code), { status, code });
}

/**
 * GET an attachment through the bridge.
 *
 * A 403 or a 404 of the bridge becomes a 404 `attachment_not_found`: the
 * caller may not read it, or it does not exist, and the two are the same
 * answer. A redirect is never followed: the bridge serves attachments itself,
 * so a 3xx would send the caller's token somewhere else. The deadline covers
 * the body too, and the read is aborted at ten megabytes.
 */
export async function fetchAttachment(...args: unknown[]): Promise<FetchedAttachment> {
	const { path, bridgeUrl: override, token, timeoutMs } = normalize(args);
	const base = (override ?? config.bridgeUrl ?? '').replace(/\/+$/, '');
	if (!base) throw attachmentError(500, 'bridge_unavailable');
	if (!path.startsWith('/')) throw attachmentError(400, 'invalid_attachment');

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		let response: Response;
		try {
			response = await fetch(`${base}${path}`, {
				method: 'GET',
				headers: token ? { authorization: `Bearer ${token}` } : {},
				redirect: 'manual',
				signal: controller.signal,
			});
		} catch {
			throw attachmentError(504, 'attachment_timeout');
		}
		if (response.status === 403 || response.status === 404) {
			throw attachmentError(404, 'attachment_not_found');
		}
		if (!response.ok) {
			throw attachmentError(502, 'attachment_fetch_failed');
		}
		const bytes = await readCapped(response, controller);
		const mediaType = (response.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim();
		return { bytes, mediaType };
	} finally {
		clearTimeout(timer);
	}
}

/** The body, aborted past the cap; a read cut by the deadline is a timeout. */
async function readCapped(response: Response, controller: AbortController): Promise<Uint8Array> {
	const chunks: Uint8Array[] = [];
	let total = 0;
	const reader = response.body?.getReader();
	if (!reader) return new Uint8Array(0);
	while (true) {
		let step: Awaited<ReturnType<typeof reader.read>>;
		try {
			step = await reader.read();
		} catch {
			throw attachmentError(504, 'attachment_timeout');
		}
		if (step.done) break;
		total += step.value.byteLength;
		if (total > MAX_ATTACHMENT_BYTES) {
			controller.abort();
			throw attachmentError(413, 'attachment_too_large');
		}
		chunks.push(step.value);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

export default fetchAttachment;