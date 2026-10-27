// publishRealtime used the global fetch, whose undici pool drops an idle socket after 4 s, so every
// publish after a typing pause paid a new TCP + TLS handshake to the gateway. keepAliveFetch keeps
// the socket in a module-level agent. These tests run it against real node:http servers.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { keepAliveFetch } from '../../scripts/bridge-keepalive-post.mjs';
import { publishRealtime } from '../../scripts/bridge-social-core.mjs';

/** A server on 127.0.0.1:0; `onRequest(request, response, count)` answers, default 200. */
async function fakeServer({ keepAliveTimeout, onRequest } = {}) {
	const requests = [];
	const server = createServer((request, response) => {
		const chunks = [];
		request.on('data', (chunk) => chunks.push(chunk));
		request.on('end', () => {
			requests.push({ method: request.method, url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString() });
			if (onRequest) onRequest(request, response, requests.length);
			else response.end('ok');
		});
	});
	if (keepAliveTimeout !== undefined) server.keepAliveTimeout = keepAliveTimeout;
	let connections = 0;
	server.on('connection', () => { connections += 1; });
	await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
	return {
		url: `http://127.0.0.1:${server.address().port}`,
		requests,
		connections: () => connections,
		async close() {
			server.closeAllConnections();
			await new Promise((resolveClose) => server.close(resolveClose));
		},
	};
}

const post = (url, body = '{}', extra = {}) => keepAliveFetch(url, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body,
	...extra,
});

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

describe('keepAliveFetch', () => {
	it('delivers method, headers and body, and reports the status', async () => {
		const server = await fakeServer({ onRequest: (request, response) => response.writeHead(request.url === '/down' ? 503 : 200).end() });
		try {
			const body = JSON.stringify({ topic: 'a', note: 'é' });
			assert.deepEqual(await post(`${server.url}/v1/publish`, body, { headers: { apikey: 'k', 'Content-Type': 'application/json' } }), { ok: true, status: 200 });
			const [seen] = server.requests;
			assert.equal(seen.method, 'POST');
			assert.equal(seen.url, '/v1/publish');
			assert.equal(seen.body, body);
			assert.equal(seen.headers.apikey, 'k');
			assert.equal(seen.headers['content-length'], String(Buffer.byteLength(body)));
			assert.deepEqual(await post(`${server.url}/down`), { ok: false, status: 503 });
		} finally {
			await server.close();
		}
	});

	it('reuses one socket across an idle longer than fetch allows (4 s)', async () => {
		const server = await fakeServer({ keepAliveTimeout: 10_000 });
		try {
			await post(server.url);
			await sleep(4_300);
			assert.equal((await post(server.url)).status, 200);
			assert.equal(server.connections(), 1);
		} finally {
			await server.close();
		}
	});

	it('survives an idle socket the server already closed', async () => {
		const server = await fakeServer({ keepAliveTimeout: 50 });
		try {
			await post(server.url);
			await sleep(200);
			assert.equal((await post(server.url)).status, 200);
		} finally {
			await server.close();
		}
	});

	it('retries once when a reused socket is reset, never on a fresh socket', async () => {
		const reset = (request) => request.socket.destroy();
		const flaky = await fakeServer({ onRequest: (request, response, count) => (count === 2 ? reset(request) : response.end('ok')) });
		try {
			await post(flaky.url);
			assert.deepEqual(await post(flaky.url), { ok: true, status: 200 });
			assert.equal(flaky.connections(), 2);
			assert.equal(flaky.requests.length, 3);
		} finally {
			await flaky.close();
		}
		const broken = await fakeServer({ onRequest: reset });
		try {
			await assert.rejects(post(broken.url));
			assert.equal(broken.requests.length, 1);
		} finally {
			await broken.close();
		}
	});

	it('rejects on abort: already aborted before any socket, or while the server stays silent', async () => {
		const silent = await fakeServer({ onRequest: () => {} });
		try {
			await assert.rejects(post(silent.url, '{}', { signal: AbortSignal.abort() }));
			assert.equal(silent.requests.length, 0);
			const startedAt = Date.now();
			await assert.rejects(post(silent.url, '{}', { signal: AbortSignal.timeout(100) }));
			assert.ok(Date.now() - startedAt < 1_000);
		} finally {
			await silent.close();
		}
	});

	it('rejects a protocol it has no agent for', async () => {
		await assert.rejects(post('ftp://x'), /unsupported protocol/);
	});
});

describe('publishRealtime default transport', () => {
	it('posts through keepAliveFetch when no fetchImpl is given', async () => {
		const server = await fakeServer();
		try {
			const env = { REALTIME_PUBLISH_URL: server.url };
			assert.equal(await publishRealtime({ topic: 'pages/p1', eventType: 'page.updated', payload: { id: 1 }, env }), true);
			const [seen] = server.requests;
			assert.equal(seen.method, 'POST');
			assert.equal(seen.url, '/v1/publish');
			assert.deepEqual(JSON.parse(seen.body), { topic: 'pages/p1', event_type: 'page.updated', payload: { id: 1 } });
		} finally {
			await server.close();
		}
	});
});
