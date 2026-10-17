// Behind a Funnel link grobase's WAF refuses POST /realtime/v1/publish (rule 10130), so a
// ws:// REALTIME_PUBLISH_URL publishes over one authenticated socket. These tests drive the
// real global WebSocket against a stand-in gateway built on the ide-ws.mjs frame codec.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { closeFrame, createFrameDecoder, encodeFrame, handshake } from '../../scripts/ide-ws.mjs';
import { RealtimeSocketPublisher, closeRealtimeSocketPublishers } from '../../scripts/bridge-realtime-socket.mjs';
import { publishRealtime } from '../../scripts/bridge-social-core.mjs';

const secret = 'test-jwt-secret-that-is-long-enough-for-hs256';
const fast = { backoffFirstMs: 20, backoffCapMs: 100 };

/** Answers one client frame the way the realtime gateway does. */
function answer(socket, frame, refuse) {
	if (frame.type === 'PING') socket.write(encodeFrame('{"type":"PONG","server_time":"now"}', 1));
	if (frame.type !== 'AUTH') return;
	if (!refuse) {
		socket.write(encodeFrame('{"type":"AUTH_OK","conn_id":"c1","server_time":"now"}', 1));
		return;
	}
	socket.write(encodeFrame('{"type":"ERROR","code":"AUTH_FAILED","message":"InvalidIssuer"}', 1));
	socket.end(closeFrame(1008));
}

/** A stand-in gateway on `port` (0 = any): records each connection's frames and headers. */
async function fakeGateway({ port = 0, refuse = false } = {}) {
	const connections = [];
	const sockets = new Set();
	const server = createServer();
	server.on('upgrade', (request, socket) => {
		if (!handshake(request, socket)) return;
		const connection = { frames: [], headers: request.headers };
		connections.push(connection);
		sockets.add(socket);
		const decode = createFrameDecoder();
		socket.on('data', (chunk) => {
			for (const message of decode(chunk)) {
				if (message.opcode === 8) socket.end(closeFrame(1000));
				if (message.opcode !== 1) continue;
				const frame = JSON.parse(message.data.toString());
				connection.frames.push(frame);
				answer(socket, frame, refuse);
			}
		});
		socket.on('error', () => {});
		socket.on('close', () => sockets.delete(socket));
	});
	await new Promise((resolveListen) => server.listen(port, '127.0.0.1', resolveListen));
	const boundPort = server.address().port;
	return {
		url: `ws://127.0.0.1:${boundPort}/realtime/v1/ws`,
		port: boundPort,
		connections,
		frames: () => connections.flatMap((connection) => connection.frames),
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

function decodeClaims(token) {
	const [head, body, signature] = token.split('.');
	assert.equal(createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url'), signature);
	return JSON.parse(Buffer.from(body, 'base64url').toString());
}

function publisherFor(url, extra = {}) {
	const lines = [];
	const publisher = new RealtimeSocketPublisher({ url, secret, log: (line) => lines.push(line), timing: fast, ...extra });
	return { publisher, lines };
}

describe('realtime publish over the gateway socket', () => {
	it('sends AUTH with the publisher claims before the first PUBLISH, and N publishes share one connection', async () => {
		const gateway = await fakeGateway();
		const { publisher } = publisherFor(gateway.url);
		try {
			for (const n of [1, 2, 3]) assert.equal(publisher.publish('chat:ws:1', 'message_created', { n }), true);
			await until(() => gateway.frames().length === 4);
			const [auth, ...publishes] = gateway.frames();
			assert.equal(auth.type, 'AUTH');
			const { iat, exp, ...claims } = decodeClaims(auth.token);
			assert.deepEqual(claims, { iss: 'grobase-realtime', sub: 'osionos-bridge', can_publish: true, can_subscribe: false, namespaces: ['*'] });
			assert.ok(exp - iat <= 900 && exp > iat);
			assert.deepEqual(publishes, [1, 2, 3].map((n) => ({ type: 'PUBLISH', topic: 'chat:ws:1', event_type: 'message_created', payload: { n } })));
			assert.equal(gateway.connections.length, 1);
			assert.equal(gateway.connections[0].headers.origin, undefined);
		} finally {
			publisher.close();
			await gateway.close();
		}
	});

	it('delivers the events queued while the gateway is down once it is back', async () => {
		let gateway = await fakeGateway();
		const { port } = gateway;
		const { publisher } = publisherFor(gateway.url);
		try {
			publisher.publish('chat:ws:1', 'message_created', { n: 1 });
			await until(() => gateway.frames().length === 2);
			await gateway.close();
			// Let the client see the close: a frame written before that is the Caveat's lost frame.
			await new Promise((resolveWait) => setTimeout(resolveWait, 150));
			publisher.publish('chat:ws:1', 'message_created', { n: 2 });
			publisher.publish('chat:ws:1', 'message_created', { n: 3 });
			await new Promise((resolveWait) => setTimeout(resolveWait, 60));
			gateway = await fakeGateway({ port });
			await until(() => gateway.frames().length === 3);
			assert.deepEqual(gateway.frames().map((frame) => frame.type), ['AUTH', 'PUBLISH', 'PUBLISH']);
			assert.deepEqual(gateway.frames().slice(1).map((frame) => frame.payload.n), [2, 3]);
		} finally {
			publisher.close();
			await gateway.close();
		}
	});

	it('holds the queue bound: drops the oldest, counts the drops, logs once', async () => {
		const probe = await fakeGateway();
		const { port, url } = probe;
		await probe.close();
		const { publisher, lines } = publisherFor(url, { timing: { ...fast, queueLimit: 3 } });
		let gateway;
		try {
			for (const n of [1, 2, 3, 4, 5]) publisher.publish('chat:ws:1', 'message_created', { n });
			assert.equal(publisher.droppedCount, 2);
			assert.equal(lines.filter((line) => line.includes('dropped')).length, 1);
			gateway = await fakeGateway({ port });
			await until(() => gateway.frames().length === 4);
			assert.deepEqual(gateway.frames().slice(1).map((frame) => frame.payload.n), [3, 4, 5]);
		} finally {
			publisher.close();
			await gateway?.close();
		}
	});

	it('refuses a payload over 65,536 bytes before it reaches the socket', async () => {
		const gateway = await fakeGateway();
		const { publisher, lines } = publisherFor(gateway.url);
		try {
			assert.equal(publisher.publish('chat:ws:1', 'message_created', { text: 'x'.repeat(70_000) }), false);
			assert.match(lines[0], /chat:ws:1 refused: payload is \d+ bytes/);
			await new Promise((resolveWait) => setTimeout(resolveWait, 50));
			assert.equal(gateway.connections.length, 0);
		} finally {
			publisher.close();
			await gateway.close();
		}
	});

	it('keeps the token, the secret and the payload out of every log line when the gateway refuses', async () => {
		const gateway = await fakeGateway({ refuse: true });
		const { publisher, lines } = publisherFor(gateway.url);
		try {
			publisher.publish('chat:ws:1', 'message_created', { text: 'payload-marker-7f3a' });
			await until(() => lines.some((line) => line.includes('refused the token')));
			const token = gateway.frames()[0].token;
			for (const line of lines) {
				for (const needle of [token, secret, 'payload-marker-7f3a']) assert.equal(line.includes(needle), false, line);
			}
		} finally {
			publisher.close();
			await gateway.close();
		}
	});

	it('pings while connected and re-AUTHs on the same socket before the token ends', async () => {
		const gateway = await fakeGateway();
		const { publisher } = publisherFor(gateway.url, { timing: { ...fast, pingIntervalMs: 50, tokenTtlSeconds: 2, reauthLeadMs: 1_000 } });
		try {
			publisher.publish('chat:ws:1', 'message_created', { n: 1 });
			await until(() => gateway.frames().filter((frame) => frame.type === 'AUTH').length === 2);
			assert.ok(gateway.frames().some((frame) => frame.type === 'PING'));
			assert.equal(gateway.connections.length, 1);
		} finally {
			publisher.close();
			await gateway.close();
		}
	});

	it('without JWT_SECRET it publishes nothing and warns once', () => {
		const lines = [];
		const publisher = new RealtimeSocketPublisher({ url: 'ws://127.0.0.1:9/realtime/v1/ws', secret: '', log: (line) => lines.push(line) });
		assert.equal(publisher.publish('chat:ws:1', 'message_created', {}), false);
		assert.equal(publisher.publish('chat:ws:1', 'message_created', {}), false);
		assert.equal(lines.length, 1);
		publisher.close();
	});
});

describe('publishRealtime picks the transport from REALTIME_PUBLISH_URL', () => {
	it('a ws:// URL publishes over the socket and never calls fetch', async () => {
		const gateway = await fakeGateway();
		const fetchImpl = async () => assert.fail('fetch must not be called for a ws:// URL');
		try {
			const sent = await publishRealtime({ topic: 'objectdb:u1', eventType: 'objectdb_changed', payload: { dbKey: 'k' }, fetchImpl, env: { REALTIME_PUBLISH_URL: gateway.url, JWT_SECRET: secret } });
			assert.equal(sent, true);
			await until(() => gateway.frames().length === 2);
			assert.deepEqual(gateway.frames()[1], { type: 'PUBLISH', topic: 'objectdb:u1', event_type: 'objectdb_changed', payload: { dbKey: 'k' } });
		} finally {
			closeRealtimeSocketPublishers();
			await gateway.close();
		}
	});

	it('an http URL still POSTs /v1/publish as before', async () => {
		const calls = [];
		const fetchImpl = async (url, init) => {
			calls.push({ url, init });
			return { ok: true, status: 200 };
		};
		const sent = await publishRealtime({ topic: 'chat:1', eventType: 'message_created', payload: {}, fetchImpl, env: { REALTIME_PUBLISH_URL: 'http://mini-baas-kong:8000/realtime', JWT_SECRET: secret } });
		assert.equal(sent, true);
		assert.deepEqual(calls.map((call) => [call.url, call.init.method]), [['http://mini-baas-kong:8000/realtime/v1/publish', 'POST']]);
	});
});
