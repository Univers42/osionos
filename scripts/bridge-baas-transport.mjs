// Keeps bridge->BaaS connections alive and warm. Measured 2026-10-18 from the
// bridge container: a reused connection costs 52-56 ms, a new one 194-232 ms,
// a new one after 25 s idle 924 ms (3.5 s cold); Node's fetch drops idle sockets
// after 4 s, but with keepAliveTimeout 600 s a connection idle 130 s was reused.
// Uses Node's bundled undici Agent (no npm package, by design). Undici frees a
// socket one tick after the body resolves, so a call dispatched right after another
// (check membership, then read) opens a second connection (measured 2026-10-18:
// [201,199,52,52,53] ms over 5 sequential calls); the ping therefore warms two.
// Price: warmConnections GETs every pingEveryMs, i.e. 4 tiny GETs/min to the WAF health route.
// Each warm socket idles at most pingEveryMs (30 s) < keepAliveMs (50 s). 50 s, not 60:
// the grobase WAF's nginx closes idle connections at 60 s, and a far end closing a socket
// just as a POST is written races it (undici does not retry a POST).
//
// Caveat: relies on Node's bundled undici being reachable through the
// global-dispatcher symbol. A Node release that changes that falls back to plain
// fetch (4 s keep-alive, 200 ms+ per new connection) with one warning. The ping
// keeps `warmConnections` (default 2) connections warm, so a burst wider than that
// still opens new connections at ~200 ms each. The agent class is whatever is installed as the
// global dispatcher at startup; a later setGlobalDispatcher does not affect this transport.

import { originOf } from './bridge-perf.mjs';

const GLOBAL_DISPATCHER = Symbol.for('undici.globalDispatcher.1');

export function bundledAgentClass() {
	// Calling fetch makes Node install its global dispatcher synchronously.
	fetch('data:,').catch(() => {});
	const AgentClass = globalThis[GLOBAL_DISPATCHER]?.constructor;
	return typeof AgentClass === 'function' ? AgentClass : null;
}

function buildAgent(baasUrl, keepAliveMs, resolveAgentClass) {
	if (!baasUrl) throw new Error('no baasUrl');
	const AgentClass = resolveAgentClass();
	if (!AgentClass) throw new Error('bundled undici Agent not found');
	return new AgentClass({ keepAliveTimeout: keepAliveMs, keepAliveMaxTimeout: keepAliveMs });
}

export function createBaasTransport({
	baasUrl,
	fetchImpl = fetch,
	keepAliveMs = 50_000,
	pingEveryMs = 30_000,
	warmConnections = 2,
	pingTimeoutMs = 5_000,
	pingPath = '/waf-health',
	resolveAgentClass = bundledAgentClass,
	setIntervalImpl = setInterval,
	clearIntervalImpl = clearInterval,
	log = (line) => console.warn(line),
} = {}) {
	let agent;
	try {
		agent = buildAgent(baasUrl, keepAliveMs, resolveAgentClass);
	} catch (error) {
		log(`[osionos-bridge] baas keep-alive unavailable: ${error.message}`);
		return { fetch: fetchImpl, close() {} };
	}

	const baasOrigin = originOf(baasUrl);
	let pingFailing = false;

	const pingOnce = async () => {
		// Bounded: a stalled far end would otherwise pin a socket per tick.
		const response = await fetchImpl(`${baasUrl}${pingPath}`, { dispatcher: agent, signal: AbortSignal.timeout(pingTimeoutMs) });
		await response.arrayBuffer();
	};

	// Concurrent, so each GET lands on its own socket.
	const ping = async () => {
		const results = await Promise.allSettled(Array.from({ length: warmConnections }, pingOnce));
		const failure = results.find((result) => result.status === 'rejected');
		if (failure && !pingFailing) log(`[osionos-bridge] baas keep-alive ping failing: ${failure.reason?.message}`);
		if (!failure && pingFailing) log('[osionos-bridge] baas keep-alive ping recovered');
		pingFailing = Boolean(failure);
	};

	// Unconditional: activity is tracked per transport, not per socket, so light
	// traffic would hide a second connection idling past keepAliveMs.
	const timer = setIntervalImpl(() => void ping(), pingEveryMs);
	timer?.unref?.();

	return {
		fetch(input, init) {
			if (originOf(input) !== baasOrigin) return fetchImpl(input, init);
			return fetchImpl(input, { ...init, dispatcher: agent });
		},
		close() {
			clearIntervalImpl(timer);
			// Closing a never-connected agent resolves; only a second close (UND_ERR_DESTROYED) rejects, and at shutdown there is nothing to recover.
			Promise.resolve(agent.close()).catch(() => {});
		},
	};
}
