// REALTIME_PUBLISH_WS_URL opts publishRealtime into a socket lane that falls back to HTTP and
// is gated by a startup canary. The stand-in gateway echoes PUBLISH to SUBSCRIBE like the real
// one; `echo:false` swallows frames to model the silent loss the canary exists to catch.

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { closeFrame, createFrameDecoder, encodeFrame, handshake } from '../../scripts/ide-ws.mjs';
import { closeWsLanes, exactNamespaces, realtimeWsLane, runWsCanary, wsLaneHealth } from '../../scripts/bridge-realtime-ws-lane.mjs';
import { RealtimeSocketPublisher } from '../../scripts/bridge-realtime-socket.mjs';
import { publishRealtime } from '../../scripts/bridge-social-core.mjs';
import { bridgeHealthState } from '../../scripts/bridge-sessions.mjs';

const secret = 'test-jwt-secret-that-is-long-enough-for-hs256';
const fast = { backoffFirstMs: 20, backoffCapMs: 100 };
const claimsOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

async function fakeGateway({ port = 0, echo = true } = {}) {
	const frames = [];
	const sockets = new Set();
	const server = createServer();
	server.on('upgrade', (request, socket) => {
		if (!handshake(request, socket)) return;
		sockets.add(socket);
		const decode = createFrameDecoder();
		const reply = (frame) => socket.write(encodeFrame(JSON.stringify(frame), 1));
		socket.on('data', (chunk) => {
			for (const message of decode(chunk)) {
				if (message.opcode === 8) socket.end(closeFrame(1000));
				if (message.opcode !== 1) continue;
				const frame = JSON.parse(message.data.toString());
				frames.push(frame);
				if (frame.type === 'AUTH') reply({ type: 'AUTH_OK', conn_id: 'c', server_time: 'now' });
				if (frame.type === 'SUBSCRIBE') {
					echo && gatewaySubscribers.add({ frame, reply });
					reply({ type: 'SUBSCRIBED', sub_id: frame.sub_id, seq: 0 });
				}
				if (frame.type === 'PUBLISH' && echo) {
					for (const sub of gatewaySubscribers) if (sub.frame.topic === frame.topic) sub.reply({ type: 'EVENT', sub_id: sub.frame.sub_id, event: { topic: frame.topic, payload: frame.payload } });
				}
			}
		});
		socket.on('error', () => {});
		socket.on('close', () => sockets.delete(socket));
	});
	const gatewaySubscribers = new Set();
	await new Promise((resolveListen) => server.listen(port, '127.0.0.1', resolveListen));
	const boundPort = server.address().port;
	return {
		url: `ws://127.0.0.1:${boundPort}/realtime/v1/ws`,
		port: boundPort,
		frames,
		async close() {
			for (const socket of sockets) socket.destroy();
			await new Promise((resolveClose) => server.close(resolveClose));
		},
	};
}

async function until(predicate, timeoutMs = 3_000) {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline) throw new Error('condition not met in time');
		await new Promise((resolveTick) => setTimeout(resolveTick, 10));
	}
}

const envFor = (url) => ({ REALTIME_PUBLISH_URL: 'http://gw:4000', REALTIME_PUBLISH_WS_URL: url, REALTIME_PUBLISH_NAMESPACES: 'collab:ws1', JWT_SECRET: secret });
const recordingFetch = (posts) => async (url, init) => {
	posts.push({ url, body: JSON.parse(init.body) });
	return { ok: true, status: 200 };
};
const publishWith = (env, posts, topic = 'collab:ws1') => publishRealtime({ topic, eventType: 'broadcast', payload: { n: 1 }, fetchImpl: recordingFetch(posts), env });

afterEach(() => closeWsLanes());

describe('the namespace grant', () => {
	it('lists exact namespaces and never honours a wildcard', () => {
		assert.deepEqual(exactNamespaces(' collab:a, *,collabpage:b ,,'), ['collab:a', 'collabpage:b']);
		assert.deepEqual(exactNamespaces(undefined), []);
	});

	it('signs exactly the granted namespaces plus the canary namespace', async () => {
		const gateway = await fakeGateway();
		const env = envFor(gateway.url);
		const lane = realtimeWsLane(env);
		try {
			assert.equal((await runWsCanary(env)).status, 'ok');
			const auth = gateway.frames.find((frame) => frame.type === 'AUTH' && claimsOf(frame.token).can_publish);
			const { namespaces } = claimsOf(auth.token);
			assert.deepEqual(namespaces, ['collab:ws1', lane.canaryNamespace]);
			assert.ok(!namespaces.includes('*'));
		} finally {
			await gateway.close();
		}
	});

	it('with no namespace granted the lane stays off and HTTP carries the publish', async () => {
		const env = { ...envFor('ws://127.0.0.1:1/x'), REALTIME_PUBLISH_NAMESPACES: '*' };
		assert.equal((await runWsCanary(env)).status, 'off');
		const posts = [];
		assert.equal(await publishWith(env, posts), true);
		assert.equal(posts.length, 1);
		assert.equal(posts[0].url, 'http://gw:4000/v1/publish');
	});
});

describe('the startup canary', () => {
	it('passes when the subscriber hears the echo, then publishes ride the socket without HTTP', async () => {
		const gateway = await fakeGateway();
		const env = envFor(gateway.url);
		try {
			assert.equal((await runWsCanary(env)).status, 'ok');
			const posts = [];
			// The socket authenticated during the canary: this publish needs no wait.
			assert.equal(await publishWith(env, posts), true);
			await until(() => gateway.frames.some((frame) => frame.type === 'PUBLISH' && frame.topic === 'collab:ws1'));
			assert.equal(posts.length, 0);
			assert.deepEqual(bridgeHealthState({}).realtime_ws, { status: 'ok' });
		} finally {
			await gateway.close();
		}
	});

	it('marks the lane degraded when no frame arrives, and HTTP takes over', async () => {
		const gateway = await fakeGateway({ echo: false });
		const env = envFor(gateway.url);
		const lines = [];
		try {
			const health = await runWsCanary(env, { timeoutMs: 300, log: (line) => lines.push(line) });
			assert.deepEqual(health, { status: 'degraded', reason: 'no echo within the timeout' });
			assert.equal(bridgeHealthState({}).realtime_ws.status, 'degraded');
			assert.match(lines[0], /canary failed/);
			const posts = [];
			assert.equal(await publishWith(env, posts), true);
			assert.equal(posts.length, 1);
			assert.equal(gateway.frames.filter((frame) => frame.type === 'PUBLISH' && frame.topic === 'collab:ws1').length, 0);
		} finally {
			await gateway.close();
		}
	});

	it('marks the lane degraded when the gateway is unreachable', async () => {
		const env = envFor('ws://127.0.0.1:1/realtime/v1/ws');
		const health = await runWsCanary(env, { timeoutMs: 500, log: () => {} });
		assert.equal(health.status, 'degraded');
	});

	it('leaves health unchanged when the lane is not opted in', () => {
		assert.equal('realtime_ws' in bridgeHealthState({}), false);
		assert.deepEqual(wsLaneHealth(), { status: 'off' });
	});
});

describe('the HTTP fallback', () => {
	it('sends a topic outside the granted namespaces over HTTP, never to the socket', async () => {
		const gateway = await fakeGateway();
		const env = envFor(gateway.url);
		try {
			assert.equal((await runWsCanary(env)).status, 'ok');
			const posts = [];
			for (const topic of ['collab:ws2', 'collabpage:p9']) assert.equal(await publishWith(env, posts, topic), true);
			assert.equal(posts.length, 2);
			await new Promise((resolveTick) => setTimeout(resolveTick, 100));
			assert.equal(gateway.frames.some((frame) => frame.type === 'PUBLISH' && !frame.topic.startsWith('bridgecanary:')), false);
		} finally {
			await gateway.close();
		}
	});

	it('falls back while the lane is pending (socket not yet open)', async () => {
		const env = envFor('ws://127.0.0.1:1/realtime/v1/ws');
		realtimeWsLane(env);
		const posts = [];
		assert.equal(await publishWith(env, posts), true);
		assert.equal(posts.length, 1);
	});

	it('refuses a socket whose send buffer is backed up (the queue-full case)', async () => {
		const sent = [];
		class StubSocket {
			readyState = 1;
			bufferedAmount = 0;
			#handlers = {};
			constructor() {
				queueMicrotask(() => this.#handlers.open?.());
			}
			addEventListener(name, handler) {
				this.#handlers[name] = (event) => handler(event);
			}
			send(data) {
				sent.push(data);
				if (data.includes('"AUTH"')) queueMicrotask(() => this.#handlers.message?.({ data: '{"type":"AUTH_OK"}' }));
			}
			close() {}
		}
		const publisher = new RealtimeSocketPublisher({ url: 'ws://stub/x', secret, WebSocketImpl: StubSocket, timing: { maxBufferedBytes: 100 } });
		try {
			assert.equal(publisher.publishIfReady('t', 'e', {}), false);
			await until(() => sent.length === 1);
			await until(() => publisher.publishIfReady('t', 'e', { a: 1 }));
			const writes = sent.length;
			assert.equal(writes, 2);
			publisher.close();
		} finally {
			publisher.close();
		}
	});

	it('reconnects with backoff after the gateway drops and carries publishes again', async () => {
		let gateway = await fakeGateway();
		const { port } = gateway;
		const env = envFor(gateway.url);
		const lane = realtimeWsLane(env, { timing: fast });
		try {
			assert.equal((await runWsCanary(env, { overrides: { timing: fast } })).status, 'ok');
			assert.equal(lane.publisher.publishIfReady('collab:ws1', 'broadcast', { n: 1 }), true);
			await gateway.close();
			await new Promise((resolveWait) => setTimeout(resolveWait, 150));
			// Socket down: refused (HTTP's turn) and the reconnect is armed.
			assert.equal(lane.publisher.publishIfReady('collab:ws1', 'broadcast', { n: 2 }), false);
			gateway = await fakeGateway({ port });
			await until(() => gateway.frames.some((frame) => frame.type === 'AUTH'), 5_000);
			await until(() => lane.publisher.publishIfReady('collab:ws1', 'broadcast', { n: 3 }), 5_000);
			await until(() => gateway.frames.some((frame) => frame.type === 'PUBLISH' && frame.payload.n === 3));
		} finally {
			await gateway.close();
		}
	});
});
