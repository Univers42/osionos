import { capBody } from '../connections/bodyCap.ts';
import { createGuardedFetch } from '../connections/endpointGuard.ts';
import type { GuardedFetch } from '../connections/endpointGuard.ts';
import { WebFailure } from './failure.ts';
import { htmlToText, plainToText } from './htmlText.ts';
import { extractLinks } from './links.ts';
import { checkRobots, defaultRobotsCache } from './robots.ts';
import type { RobotsCache } from './robots.ts';
import { decodeBody, isRedirect, PAGE_ACCEPT, parseContentType, readBytes, sendRequest } from './wire.ts';
import { webUrl } from './webUrl.ts';

/**
 * The guarded page fetcher (web W1): an SSRF primitive inside a process that
 * holds database and Redis credentials, so every line below answers a
 * condition of the web verdict.
 *   - C341 the input URL and EVERY redirect hop pass `webUrl()` again.
 *   - C342 redirects are followed by hand, at most three, each `Location`
 *     resolved against the URL it came from and re-checked (webUrl, then
 *     robots) BEFORE anything is sent to it: a refused host is never contacted.
 *   - C343 there is no pre-resolve step here. The guarded fetch resolves in
 *     its own connect-time lookup and connects to the address it checked.
 *   - C344 the headers are wire.ts's: three, ours.
 *   - C345 ONE deadline covers robots, every hop and the body; the body is
 *     capped on the decoded stream; the request is aborted in `finally`.
 *   - C346 html, xhtml and plain text only; the body of anything else is
 *     cancelled unread.
 *   - C368 `toFailure` is the one place a raw error becomes a fixed code.
 *   - C373 nothing is cached here: two calls are two requests. (Only the
 *     robots verdict is cached, in its own module, for an hour.)
 *
 * Caveat: the deadline and the cap bound this call, not the sum of calls; the
 * per-run budget of fetches is the caller's (slice W3, through `beforeRequest`).
 * A caller's own abort is reported as `web_unreachable`.
 */

export const DEFAULT_DEADLINE_MS = 10_000;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_REDIRECTS = 3;

const TEXT_TYPES = new Set(['text/html', 'application/xhtml+xml', 'text/plain']);

/** Created once: its agent is the pool every fetch shares. */
const defaultFetch = createGuardedFetch(undefined, { trustDevHosts: false });

export interface FetchedPage {
	/** The URL the text came from, after redirects. */
	url: string;
	title: string;
	text: string;
	links: string[];
	/** Decoded bytes read. */
	bytes: number;
	ms: number;
}

export interface FetchOptions {
	fetchImpl?: GuardedFetch;
	deadlineMs?: number;
	maxBytes?: number;
	robots?: RobotsCache;
	signal?: AbortSignal;
	/** Called before EVERY outbound request; it may throw a WebFailure (a rate limit). */
	beforeRequest?: (kind: 'robots' | 'page') => void | Promise<void>;
}

interface CallState {
	timedOut: boolean;
	tooLarge: boolean;
	network: boolean;
}

/**
 * The one place a raw error becomes ours.
 *
 * The state flags decide, not the type or the text of the error: undici and
 * the platform wrap what they catch, and what they say can quote the server.
 */
function toFailure(state: CallState, error: unknown, callerAborted: boolean): WebFailure {
	if (error instanceof WebFailure) return error;
	if (state.tooLarge) return new WebFailure('web_too_large');
	if (state.timedOut) return new WebFailure('web_timeout');
	if (state.network || callerAborted) return new WebFailure('web_unreachable');
	return new WebFailure('web_protocol');
}

/** The next URL of a redirect, or the refusal: webUrl is the whole policy. */
function nextHop(response: Response, from: URL): URL {
	const location = response.headers.get('location');
	if (location) {
		try {
			const next = webUrl(new URL(location, from).href);
			if (next) return next;
		} catch {
			// An unparseable Location is a refusal like any other.
		}
	}
	throw new WebFailure('web_redirect_refused');
}

export async function fetchPage(url: URL, options: FetchOptions = {}): Promise<FetchedPage> {
	const started = performance.now();
	const fetchImpl = options.fetchImpl ?? defaultFetch;
	const maxBytes = options.maxBytes ?? MAX_BODY_BYTES;
	const state: CallState = { timedOut: false, tooLarge: false, network: false };
	const controller = new AbortController();
	const timer = setTimeout(() => {
		state.timedOut = true;
		controller.abort();
	}, options.deadlineMs ?? DEFAULT_DEADLINE_MS);
	const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
	let open: Response | null = null;
	try {
		let current = webUrl(url.href);
		if (!current) throw new WebFailure('web_unreachable');
		const robots = {
			fetchImpl,
			cache: options.robots ?? defaultRobotsCache,
			signal,
			beforeRequest: options.beforeRequest,
		};
		for (let redirects = 0; ; redirects += 1) {
			await checkRobots(current, robots);
			await options.beforeRequest?.('page');
			try {
				open = await sendRequest(fetchImpl, current, PAGE_ACCEPT, signal);
			} catch (error) {
				state.network = true;
				throw error;
			}
			if (isRedirect(open.status)) {
				void open.body?.cancel().catch(() => undefined);
				if (redirects >= MAX_REDIRECTS) throw new WebFailure('web_redirect_refused');
				current = nextHop(open, current);
				continue;
			}
			if (open.status < 200 || open.status >= 300) throw new WebFailure('web_unreachable');
			const { type, charset } = parseContentType(open.headers.get('content-type'));
			if (!TEXT_TYPES.has(type)) throw new WebFailure('web_content_type');
			const capped = capBody(open, maxBytes, () => {
				state.tooLarge = true;
				controller.abort();
			});
			const bytes = await readBytes(capped.body);
			const body = decodeBody(bytes, charset);
			if (type === 'text/plain') {
				return { url: current.href, title: '', text: plainToText(body), links: [], bytes: bytes.byteLength, ms: elapsed(started) };
			}
			const page = htmlToText(body);
			return {
				url: current.href,
				title: page.title,
				text: page.text,
				links: extractLinks(page.hrefs, current.href),
				bytes: bytes.byteLength,
				ms: elapsed(started),
			};
		}
	} catch (error) {
		throw toFailure(state, error, options.signal?.aborted === true);
	} finally {
		clearTimeout(timer);
		// Ends the socket of whatever is still open: a cap, a type, a deadline.
		controller.abort();
		void open?.body?.cancel().catch(() => undefined);
	}
}

function elapsed(started: number): number {
	return Math.round(performance.now() - started);
}
