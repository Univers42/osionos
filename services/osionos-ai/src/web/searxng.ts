import { capBody } from '../connections/bodyCap.ts';
import { WebFailure } from './failure.ts';

/**
 * The one SearXNG search the web tools make (web C351).
 *
 * SearXNG is OUR private service at one configured address, so this uses the
 * plain fetch: the guarded fetch exists to refuse private addresses and would
 * refuse the service itself. That is safe only because nothing here is
 * chosen by the model or the user except the query text: the base URL comes
 * from config, the parameters are fixed (`format=json`, `safesearch=1`,
 * `pageno=1`), so the model never picks an engine, a category, a language or a
 * page. A redirect is an error, never followed: a service that answers with
 * one is misconfigured, and following it would be a request to an address
 * nobody configured.
 *
 * What the caller sees is one of four fixed codes. The error of fetch and the
 * body of a failing SearXNG can quote the query or an upstream engine:
 * `toFailure` is the one place they are dropped.
 *
 * Caveat: the 8 s deadline covers connect, headers and body together, so a
 * slow-but-alive service is cut the same as a dead one. The cap counts
 * decoded bytes of one response only.
 */
export const SEARCH_DEADLINE_MS = 8000;
export const SEARCH_MAX_BYTES = 256 * 1024;

export interface SearxngOptions {
	baseUrl: string;
	fetchImpl?: typeof fetch;
	deadlineMs?: number;
	maxBytes?: number;
	signal?: AbortSignal;
}

interface CallState {
	timedOut: boolean;
	tooLarge: boolean;
}

/** The one place a raw error becomes ours: the flags decide, never the error text. */
function toFailure(state: CallState, error: unknown): WebFailure {
	if (error instanceof WebFailure) return error;
	if (state.tooLarge) return new WebFailure('web_too_large');
	if (state.timedOut) return new WebFailure('web_timeout');
	return new WebFailure('web_unreachable');
}

function searchUrl(baseUrl: string, query: string): URL {
	const url = new URL(baseUrl);
	url.pathname = `${url.pathname.replace(/\/+$/, '')}/search`;
	url.search = new URLSearchParams({ q: query, format: 'json', safesearch: '1', pageno: '1' }).toString();
	return url;
}

/** The raw `results` array of SearXNG: nothing in it is trusted yet. */
export async function searxngSearch(query: string, options: SearxngOptions): Promise<unknown[]> {
	const state: CallState = { timedOut: false, tooLarge: false };
	const controller = new AbortController();
	const timer = setTimeout(() => {
		state.timedOut = true;
		controller.abort();
	}, options.deadlineMs ?? SEARCH_DEADLINE_MS);
	const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
	try {
		const response = capBody(
			await (options.fetchImpl ?? fetch)(searchUrl(options.baseUrl, query), {
				redirect: 'error',
				signal,
				headers: { accept: 'application/json' },
			}),
			options.maxBytes ?? SEARCH_MAX_BYTES,
			() => {
				state.tooLarge = true;
				controller.abort();
			},
		);
		const type = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
		if (!response.ok || type !== 'application/json') {
			void response.body?.cancel();
			throw new WebFailure('web_protocol');
		}
		const body: unknown = JSON.parse(await response.text());
		const results = (body as { results?: unknown } | null)?.results;
		if (!Array.isArray(results)) throw new WebFailure('web_protocol');
		return results;
	} catch (error) {
		if (error instanceof SyntaxError) throw new WebFailure('web_protocol');
		throw toFailure(state, error);
	} finally {
		clearTimeout(timer);
	}
}
