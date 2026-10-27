import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishRealtime } from '../../scripts/bridge-social-core.mjs';
import { bridgeHealthState } from '../../scripts/bridge-sessions.mjs';
import { socketPublishRoute } from '../../scripts/bridge-publish-socket.mjs';

// A fetch that records its one call and answers with `reply` (or throws it when an Error).
function recorder(reply = { ok: true, status: 200 }) {
	const calls = [];
	const fetchImpl = async (url, init) => {
		calls.push({ url, init });
		if (reply instanceof Error) throw reply;
		return reply;
	};
	return { calls, fetchImpl };
}

const event = { topic: 'chat:1', eventType: 'message_created', payload: { n: 1 } };

// Captures console.warn for one async call, so a test can prove a secret never reaches the log.
async function warnings(fn) {
	const lines = [];
	const original = console.warn;
	console.warn = (...args) => lines.push(args.join(' '));
	try {
		return { result: await fn(), lines };
	} finally {
		console.warn = original;
	}
}

describe('publishRealtime', () => {
	it('defaults to the gateway by name, with no apikey', async () => {
		const { calls, fetchImpl } = recorder();
		assert.equal(await publishRealtime({ ...event, fetchImpl, env: {} }), true);
		assert.equal(calls[0].url, 'http://mini-baas-realtime:4000/v1/publish');
		assert.equal(calls[0].init.method, 'POST');
		assert.deepEqual(JSON.parse(calls[0].init.body), { topic: 'chat:1', event_type: 'message_created', payload: { n: 1 } });
		assert.equal('apikey' in calls[0].init.headers, false);
	});

	it('through the edge: strips one trailing slash and presents REALTIME_PUBLISH_APIKEY', async () => {
		const { calls, fetchImpl } = recorder();
		const env = { REALTIME_PUBLISH_URL: 'http://mini-baas-kong:8000/realtime/', REALTIME_PUBLISH_APIKEY: 'k-123' };
		assert.equal(await publishRealtime({ ...event, fetchImpl, env }), true);
		assert.equal(calls[0].url, 'http://mini-baas-kong:8000/realtime/v1/publish');
		assert.equal(calls[0].init.headers.apikey, 'k-123');
	});

	it('an empty URL or a blank key falls back to the defaults', async () => {
		const { calls, fetchImpl } = recorder();
		await publishRealtime({ ...event, fetchImpl, env: { REALTIME_PUBLISH_URL: '', REALTIME_PUBLISH_APIKEY: '   ' } });
		assert.equal(calls[0].url, 'http://mini-baas-realtime:4000/v1/publish');
		assert.equal('apikey' in calls[0].init.headers, false);
	});

	it('a refusal or a network error returns false, never throws, never logs the key', async () => {
		const env = { REALTIME_PUBLISH_URL: 'http://mini-baas-kong:8000/realtime', REALTIME_PUBLISH_APIKEY: 'k-123' };
		for (const reply of [{ ok: false, status: 403 }, new Error('connect ECONNREFUSED')]) {
			const { fetchImpl } = recorder(reply);
			const { result, lines } = await warnings(() => publishRealtime({ ...event, fetchImpl, env }));
			assert.equal(result, false);
			assert.equal(lines.length, 1);
			assert.equal(lines[0].includes('k-123'), false);
		}
	});

	it('with REALTIME_PUBLISH_SOCKET unset, fetchImpl carries the one and only request', async () => {
		const { calls, fetchImpl } = recorder();
		assert.equal(await publishRealtime({ ...event, fetchImpl, env: {} }), true);
		assert.equal(calls.length, 1);
	});

	it('a payload JSON cannot encode resolves false instead of throwing (best-effort contract)', async () => {
		const { calls, fetchImpl } = recorder();
		assert.equal(await publishRealtime({ ...event, payload: { n: 1n }, fetchImpl, env: {} }), false);
		assert.equal(calls.length, 0);
	});
});

// The socket route's transport cannot be injected through publishRealtime, so these cases drive
// it with a REAL unix-socket http.Server. Routes are per-path singletons (the breaker state
// lives on the path), so every case gets its own socket file.
const SOCKET_BASE = 'http://kong.test:8000/realtime';
const socketPathOf = (name) => join(tmpdir(), `sb1c-${name}.sock`);

after(async () => {
	for (const name of ['b', 'c', 'd', 'e']) await rm(socketPathOf(name), { force: true });
});

/** A real unix-socket HTTP server: 'ok' answers 200, 'fail' 500, 'destroy' accepts the whole
 * request then kills the connection without answering. */
async function socketServer(socketPath, answer) {
	const requests = [];
	const server = createServer((request, response) => {
		const chunks = [];
		request.on('data', (chunk) => chunks.push(chunk));
		request.on('end', () => {
			requests.push({ method: request.method, url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString() });
			if (answer === 'destroy') request.socket.destroy();
			else response.writeHead(answer === 'fail' ? 500 : 200).end('{}');
		});
	});
	// A file a crashed earlier run left behind would connect-refuse instead of ENOENT, or EADDRINUSE here.
	await rm(socketPath, { force: true });
	await new Promise((resolveListen, rejectListen) => {
		server.once('error', rejectListen);
		server.listen(socketPath, resolveListen);
	});
	return {
		requests,
		async close() {
			server.closeAllConnections();
			await new Promise((resolveClose) => server.close(resolveClose));
			await rm(socketPath, { force: true });
		},
	};
}

describe('publishRealtime over REALTIME_PUBLISH_SOCKET', () => {
	it('a healthy socket carries the one and only publish, fetchImpl stays silent', async () => {
		const socketPath = socketPathOf('b');
		const server = await socketServer(socketPath, 'ok');
		const { calls, fetchImpl } = recorder();
		const env = { REALTIME_PUBLISH_URL: SOCKET_BASE, REALTIME_PUBLISH_APIKEY: 'k-123', REALTIME_PUBLISH_SOCKET: socketPath };
		try {
			assert.equal(await publishRealtime({ ...event, fetchImpl, env }), true);
			assert.equal(calls.length, 0);
			assert.equal(server.requests.length, 1);
			const [seen] = server.requests;
			assert.equal(seen.method, 'POST');
			assert.equal(seen.url, '/realtime/v1/publish');
			assert.deepEqual(JSON.parse(seen.body), { topic: 'chat:1', event_type: 'message_created', payload: { n: 1 } });
			assert.equal(seen.headers.apikey, 'k-123');
		} finally {
			await server.close();
		}
	});

	it('a missing socket (ENOENT) delivers over the URL, and the open breaker never touches it again', async () => {
		const socketPath = socketPathOf('c');
		await rm(socketPath, { force: true });
		const { calls, fetchImpl } = recorder();
		const env = { REALTIME_PUBLISH_URL: SOCKET_BASE, REALTIME_PUBLISH_SOCKET: socketPath };
		assert.equal(await publishRealtime({ ...event, fetchImpl, env }), true);
		assert.equal(calls.length, 1);
		assert.equal(calls[0].url, `${SOCKET_BASE}/v1/publish`);
		assert.deepEqual(JSON.parse(calls[0].init.body), { topic: 'chat:1', event_type: 'message_created', payload: { n: 1 } });
		assert.deepEqual(socketPublishRoute(env).state(), { route: 'socket-breaker-open', last_error: 'ENOENT' });
		// The breaker is open: even a socket that appears now is not connected to for the whole
		// open period, the URL route carries the publish.
		const late = await socketServer(socketPath, 'ok');
		try {
			assert.equal(await publishRealtime({ ...event, fetchImpl, env }), true);
			assert.equal(late.requests.length, 0);
			assert.equal(calls.length, 2);
			assert.equal(calls[1].url, `${SOCKET_BASE}/v1/publish`);
		} finally {
			await late.close();
		}
	});

	it('a 500 from the socket is the answer: never re-sent over the URL (S8)', async () => {
		const socketPath = socketPathOf('d');
		const server = await socketServer(socketPath, 'fail');
		const { calls, fetchImpl } = recorder();
		const env = { REALTIME_PUBLISH_URL: SOCKET_BASE, REALTIME_PUBLISH_SOCKET: socketPath };
		try {
			const { result, lines } = await warnings(() => publishRealtime({ ...event, fetchImpl, env }));
			assert.equal(result, false);
			assert.equal(lines.length, 1);
			assert.equal(server.requests.length, 1);
			assert.equal(calls.length, 0);
		} finally {
			await server.close();
		}
	});

	it('a connection destroyed after the request went out is never re-sent (S8)', async () => {
		const socketPath = socketPathOf('e');
		const server = await socketServer(socketPath, 'destroy');
		const { calls, fetchImpl } = recorder();
		const env = { REALTIME_PUBLISH_URL: SOCKET_BASE, REALTIME_PUBLISH_SOCKET: socketPath };
		try {
			const { result, lines } = await warnings(() => publishRealtime({ ...event, fetchImpl, env }));
			assert.equal(result, false);
			assert.equal(lines.length, 1);
			// The server saw the whole request: bytes may have been written, so the URL route stays silent.
			assert.equal(server.requests.length, 1);
			assert.equal(calls.length, 0);
		} finally {
			await server.close();
		}
	});
});

describe('bridgeHealthState publish_route', () => {
	it('is absent by default, and never carries the socket path when opted in (S11, S13)', () => {
		const saved = process.env.REALTIME_PUBLISH_SOCKET;
		delete process.env.REALTIME_PUBLISH_SOCKET;
		try {
			assert.deepEqual(Object.keys(bridgeHealthState({})), [
				'ok', 'service', 'session_cutoffs', 'session_cutoffs_age_ms',
				'session_revocations', 'session_revocations_age_ms', 'kv',
			]);
			process.env.REALTIME_PUBLISH_SOCKET = socketPathOf('f');
			const health = bridgeHealthState({});
			assert.deepEqual(health.publish_route, { route: 'socket', last_error: null });
			assert.equal(JSON.stringify(health).includes('sb1c-f'), false);
		} finally {
			if (saved === undefined) delete process.env.REALTIME_PUBLISH_SOCKET;
			else process.env.REALTIME_PUBLISH_SOCKET = saved;
		}
	});
});
