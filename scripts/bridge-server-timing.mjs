/**
 * Opt-in Server-Timing for the collaboration events route (COLLAB_SERVER_TIMING=1, default
 * off). One AsyncLocalStorage store per request holds named hop durations and a PostgREST
 * call count; the header is written when the response head is, so success and error
 * responses both carry it. Flag off: beginServerTiming returns null and nothing here runs.
 *
 * Caveat: durations are wall-clock on a shared event loop, so they include time spent
 * waiting behind other in-flight requests under load. The PostgREST count sees only calls
 * made through the fetch given to countingFetch (every handler's fetchImpl in
 * bridge-api.mjs); a module that imports global fetch directly is not counted (under-report).
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';

const storage = new AsyncLocalStorage();
const round = (ms) => Math.round(ms * 100) / 100;

export const serverTimingEnabled = (env) => env?.COLLAB_SERVER_TIMING === '1';

function format(timing) {
	const hops = Object.entries(timing.hops).map(([name, ms]) => `${name};dur=${round(ms)}`);
	return [...hops, `postgrest;desc="${timing.postgrest}"`, `total;dur=${round(performance.now() - timing.startedAt)}`].join(', ');
}

/** Start timing one response; null when the flag is off. */
export function beginServerTiming(env, response) {
	if (!serverTimingEnabled(env)) return null;
	const timing = { startedAt: performance.now(), hops: {}, postgrest: 0 };
	const writeHead = response.writeHead.bind(response);
	response.writeHead = (...args) => {
		if (!response.headersSent) response.setHeader('Server-Timing', format(timing));
		return writeHead(...args);
	};
	return timing;
}

/** Record time since begin as a hop (the session check that ran before the store existed). */
export function markHop(timing, name) {
	if (timing) timing.hops[name] = (timing.hops[name] ?? 0) + performance.now() - timing.startedAt;
}

export const runWithServerTiming = (timing, fn) => (timing ? storage.run(timing, fn) : fn());

/** Time `fn` under `name`; hops of the same name add up. A no-op wrapper outside a timed request. */
export async function timedHop(name, fn) {
	const timing = storage.getStore();
	if (!timing) return fn();
	const start = performance.now();
	try {
		return await fn();
	} finally {
		timing.hops[name] = (timing.hops[name] ?? 0) + performance.now() - start;
	}
}

/** Wrap a fetch so PostgREST calls made inside a timed request are counted. */
export function countingFetch(fetchImpl, env) {
	if (!serverTimingEnabled(env)) return fetchImpl;
	return (url, init) => {
		const timing = storage.getStore();
		if (timing && String(url).includes('/rest/v1/')) timing.postgrest += 1;
		return fetchImpl(url, init);
	};
}
