import type { GuardedFetch } from '../connections/endpointGuard.ts';
import { config } from '../config.ts';

/**
 * What the page fetcher and the robots reader both do on the wire: send one
 * request with the headers we choose, read one capped body, decode it.
 *
 * Headers (web C344). The set is exactly User-Agent, Accept and
 * Accept-Encoding. No Cookie, Authorization, Referer or X-Forwarded-*: a page
 * must learn nothing about the user, the run or the network we sit in. The
 * User-Agent names the bot and says where to complain, which is what lets a
 * site owner block us by name in robots.txt. undici adds its own fetch-spec
 * headers on top (tests/webFetcher.test.ts lists them); none identifies a user.
 *
 * Caveat: charsets other than utf-8, iso-8859-1 and windows-1252 are read as
 * utf-8, so a page in Shift_JIS or GBK comes back as replacement characters.
 */

export const PAGE_ACCEPT = 'text/html,application/xhtml+xml,text/plain;q=0.9';
export const ROBOTS_ACCEPT = 'text/plain';

export function userAgent(): string {
	return `osionos-assistant/1 (+${config.webContactUrl})`;
}

/** One request through the guarded fetch; redirects are the caller's to follow. */
export function sendRequest(fetchImpl: GuardedFetch, url: URL, accept: string, signal: AbortSignal): Promise<Response> {
	return fetchImpl(url.href, {
		method: 'GET',
		headers: { 'user-agent': userAgent(), accept, 'accept-encoding': 'gzip, deflate, br' },
		redirect: 'manual',
		signal,
	});
}

export function isRedirect(status: number): boolean {
	return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/** The media type (lower-case, no parameters) and the charset of a Content-Type. */
export function parseContentType(header: string | null): { type: string; charset: string } {
	if (!header) return { type: '', charset: '' };
	const [type, ...params] = header.split(';');
	let charset = '';
	for (const param of params) {
		const [key, value] = param.split('=');
		if (value !== undefined && key.trim().toLowerCase() === 'charset') charset = value.trim().replaceAll('"', '').toLowerCase();
	}
	return { type: type.trim().toLowerCase(), charset };
}

/** Reads a stream whole; the caller's cap has already wrapped it. */
export async function readBytes(body: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
	if (!body) return new Uint8Array();
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}
	} finally {
		// A no-op on a finished stream; on a failed read it frees the socket now.
		void reader.cancel().catch(() => undefined);
	}
	return Buffer.concat(chunks);
}

const LATIN_LABELS = new Set(['iso-8859-1', 'iso8859-1', 'latin1', 'windows-1252', 'cp1252']);

/** Invalid bytes become U+FFFD; an unknown charset is read as utf-8. */
export function decodeBody(bytes: Uint8Array, charset: string): string {
	const label = LATIN_LABELS.has(charset) ? 'windows-1252' : 'utf-8';
	return new TextDecoder(label, { fatal: false }).decode(bytes);
}
