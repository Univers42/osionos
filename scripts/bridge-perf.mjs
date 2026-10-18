// Opt-in, log-only meter of the bridge's outbound round trips (BaaS vs other upstreams).
// It sets no response header: per-request call counts differ between branches that
// return identical bodies (blocked vs opted-out profile), so exposing them would be an oracle.
//
// Caveat: n counts attempts, failures included; time runs to the response headers, so body
// download is not counted; concurrent calls are summed, so baas_ms can exceed the wall-clock
// ms; calls made with a fetch other than the injected fetchImpl are invisible. "baas" means
// only fetches whose ORIGIN equals baasUrl's origin: query-router and adapter-registry calls
// are counted as `up`. The route keeps only lowercase-word segments and caps at 120 chars,
// so a route can still carry a short lowercase word a client typed into the path.
import { AsyncLocalStorage } from 'node:async_hooks';

const WORD_SEGMENT = /^[a-z][a-z-]{0,23}$/;
const MAX_ROUTE_CHARS = 120;
const round = (ms) => Math.round(ms * 10) / 10;

// Template, not redaction: anything that is not a plain word may be user data.
export function redactRoute(rawUrl = '') {
	const pathname = String(rawUrl).split('?')[0].split('#')[0];
	const route = pathname.split('/').map((segment) => (segment === '' || WORD_SEGMENT.test(segment) ? segment : ':x')).join('/');
	return route.slice(0, MAX_ROUTE_CHARS);
}

export function originOf(value) {
	try {
		return new URL(String(value?.url ?? value)).origin;
	} catch {
		return null;
	}
}

export function createRequestMeter({ enabled = false, baasUrl = '', now = () => performance.now(), log = (line) => console.info(line) } = {}) {
	if (!enabled) return { wrapFetch: (fetchImpl) => fetchImpl, track: (_request, _response, handler) => handler() };
	const als = new AsyncLocalStorage();
	const baasOrigin = baasUrl ? originOf(baasUrl) : null;

	const wrapFetch = (fetchImpl) => async (input, init) => {
		const store = als.getStore();
		if (!store) return fetchImpl(input, init);
		const bucket = baasOrigin && originOf(input) === baasOrigin ? store.baas : store.upstream;
		const started = now();
		try {
			return await fetchImpl(input, init);
		} finally {
			bucket.n += 1;
			bucket.ms += now() - started;
		}
	};

	const track = (request, response, handler) => {
		const store = { started: now(), baas: { n: 0, ms: 0 }, upstream: { n: 0, ms: 0 } };
		response.once('close', () => {
			try {
				log(JSON.stringify({
					evt: 'bridge.perf',
					method: request.method,
					route: redactRoute(request.url),
					// An aborted request never sent headers; statusCode would still read 200.
					status: response.headersSent ? response.statusCode : 0,
					ms: round(now() - store.started),
					baas_n: store.baas.n,
					baas_ms: round(store.baas.ms),
					up_n: store.upstream.n,
					up_ms: round(store.upstream.ms),
				}));
			} catch { /* logging is best effort */ }
		});
		return als.run(store, handler);
	};

	return { wrapFetch, track };
}
