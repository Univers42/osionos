// The socket route posts each realtime publish over the local unix socket while it is healthy,
// and hands it back to the URL route (null) while a circuit breaker is open. These tests inject
// a fake transport and a fake clock: no real socket, no timer, and no dependency on the parallel
// socketPath work in bridge-keepalive-post.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSocketRoute, socketPublishRoute } from '../../scripts/bridge-publish-socket.mjs';

const SOCKET_PATH = '/tmp/bridge-publish-socket-test.sock';
const PUBLISH_URL = 'http://mini-baas-realtime:4000/v1/publish';
const INIT = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"topic":"chat:1"}' };

/** An Error with an errno-style `code`, the shape of a Node socket failure. */
const coded = (code) => Object.assign(new Error(`connect ${code}`), { code });

/** An Error whose `name` carries the failure class, the shape of an abort/timeout. */
const named = (name) => Object.assign(new Error(name), { name });

/** A post fake: records (url, init, socketPath) and answers from `answers` — a value resolves,
 * an Error rejects, a promise stays pending until the test settles it. */
function fakePost(answers) {
	const calls = [];
	const post = (url, init, socketPath) => {
		calls.push({ url, init, socketPath });
		const answer = answers.shift();
		if (answer === undefined) return Promise.reject(new Error('fake post: no answer scripted'));
		if (answer instanceof Error) return Promise.reject(answer);
		return Promise.resolve(answer);
	};
	return { calls, post };
}

/** A fresh route over a fake post and a fake clock (`t` starts at 0). */
function routeWith(answers, options) {
	let t = 0;
	const { calls, post } = fakePost(answers);
	const route = createSocketRoute({ socketPath: SOCKET_PATH, post, now: () => t, ...options });
	return { route, calls, set: (value) => { t = value; }, tick: (ms) => { t += ms; } };
}

describe('socketPublishRoute', () => {
	it('is null when REALTIME_PUBLISH_SOCKET is unset or blank', () => {
		assert.equal(socketPublishRoute({}), null);
		assert.equal(socketPublishRoute({ REALTIME_PUBLISH_SOCKET: '  ' }), null);
	});

	it('keeps one route per socket path', () => {
		const first = socketPublishRoute({ REALTIME_PUBLISH_SOCKET: '/tmp/publish-route-a.sock' });
		assert.ok(first !== null);
		assert.equal(socketPublishRoute({ REALTIME_PUBLISH_SOCKET: '/tmp/publish-route-a.sock' }), first);
		assert.notEqual(socketPublishRoute({ REALTIME_PUBLISH_SOCKET: '/tmp/publish-route-b.sock' }), first);
	});

	it('never puts the socket path in state()', () => {
		const route = socketPublishRoute({ REALTIME_PUBLISH_SOCKET: '/run/host-only-route-k.sock' });
		assert.equal(JSON.stringify(route.state()).includes('host-only-route-k'), false);
	});
});

describe('createSocketRoute send', () => {
	it('posts over the socket with its own signal and reports the response', async () => {
		const { route, calls } = routeWith([{ ok: true, status: 200 }]);
		const callerSignal = AbortSignal.timeout(60_000);
		assert.deepEqual(await route.send(PUBLISH_URL, { ...INIT, signal: callerSignal }), { ok: true, status: 200 });
		assert.equal(calls.length, 1);
		const [seen] = calls;
		assert.equal(seen.url, PUBLISH_URL);
		assert.equal(seen.socketPath, SOCKET_PATH);
		assert.equal(seen.init.method, INIT.method);
		assert.equal(seen.init.body, INIT.body);
		assert.deepEqual(seen.init.headers, INIT.headers);
		assert.ok(seen.init.signal instanceof AbortSignal);
		assert.notEqual(seen.init.signal, callerSignal);
		assert.deepEqual(route.state(), { route: 'socket', last_error: null });
	});

	it('ENOENT opens the breaker and hands this event to the URL route', async () => {
		const { route, calls, tick } = routeWith([coded('ENOENT')]);
		assert.equal(await route.send(PUBLISH_URL, INIT), null);
		assert.deepEqual(route.state(), { route: 'socket-breaker-open', last_error: 'ENOENT' });
		for (let attempt = 0; attempt < 3; attempt += 1) {
			tick(1_000);
			assert.equal(await route.send(PUBLISH_URL, INIT), null);
		}
		assert.equal(calls.length, 1);
	});

	it('after the open period one call probes, a concurrent call uses the URL', async () => {
		let settleProbe;
		const probe = new Promise((resolve) => { settleProbe = resolve; });
		const { route, calls, set } = routeWith([coded('ENOENT'), probe, { ok: true, status: 200 }]);
		assert.equal(await route.send(PUBLISH_URL, INIT), null);
		set(30_001);
		const probing = route.send(PUBLISH_URL, INIT);
		assert.equal(await route.send(PUBLISH_URL, INIT), null);
		assert.equal(calls.length, 2);
		settleProbe({ ok: true, status: 200 });
		assert.deepEqual(await probing, { ok: true, status: 200 });
		assert.deepEqual(route.state(), { route: 'socket', last_error: null });
		assert.deepEqual(await route.send(PUBLISH_URL, INIT), { ok: true, status: 200 });
		assert.equal(calls.length, 3);
	});

	it('a timeout is reported failed, never re-sent, and opens the breaker', async () => {
		const { route, calls } = routeWith([named('TimeoutError')]);
		assert.deepEqual(await route.send(PUBLISH_URL, INIT), { ok: false, status: 0 });
		assert.equal(calls.length, 1);
		assert.deepEqual(route.state(), { route: 'socket-breaker-open', last_error: 'TimeoutError' });
	});

	it('ECONNRESET may have written the request: reported failed, never re-sent', async () => {
		const { route, calls } = routeWith([coded('ECONNRESET')]);
		assert.deepEqual(await route.send(PUBLISH_URL, INIT), { ok: false, status: 0 });
		assert.equal(calls.length, 1);
		assert.equal(route.state().last_error, 'ECONNRESET');
	});

	it('every pre-send errno resolves null so the URL route still delivers', async () => {
		for (const code of ['ECONNREFUSED', 'EACCES', 'ENOTSOCK']) {
			const { route } = routeWith([coded(code)]);
			assert.equal(await route.send(PUBLISH_URL, INIT), null);
			assert.deepEqual(route.state(), { route: 'socket-breaker-open', last_error: code });
		}
	});

	it('a failed probe re-opens the breaker for another full period', async () => {
		const { route, calls, set } = routeWith([coded('ENOENT'), coded('ECONNREFUSED')]);
		assert.equal(await route.send(PUBLISH_URL, INIT), null);
		set(30_001);
		assert.equal(await route.send(PUBLISH_URL, INIT), null);
		assert.equal(calls.length, 2);
		set(60_000); // 30_001 + 29_999: still inside the second open period
		assert.equal(await route.send(PUBLISH_URL, INIT), null);
		assert.equal(calls.length, 2);
	});

	it('a success that started before a failure does not close the breaker it opened', async () => {
		let settleOlder;
		const older = new Promise((resolve) => { settleOlder = resolve; });
		const { route, calls } = routeWith([older, coded('ECONNRESET')]);
		const olderSend = route.send(PUBLISH_URL, INIT);
		assert.deepEqual(await route.send(PUBLISH_URL, INIT), { ok: false, status: 0 });
		settleOlder({ ok: true, status: 200 });
		assert.deepEqual(await olderSend, { ok: true, status: 200 });
		assert.deepEqual(route.state(), { route: 'socket-breaker-open', last_error: 'ECONNRESET' });
		assert.equal(await route.send(PUBLISH_URL, INIT), null);
		assert.equal(calls.length, 2);
	});

	it('a 5xx is returned, never re-sent, and opens the breaker; a 4xx does not', async () => {
		const { route, calls } = routeWith([{ ok: false, status: 502 }]);
		assert.deepEqual(await route.send(PUBLISH_URL, INIT), { ok: false, status: 502 });
		assert.deepEqual(route.state(), { route: 'socket-breaker-open', last_error: 'HTTP_502' });
		assert.equal(await route.send(PUBLISH_URL, INIT), null);
		assert.equal(calls.length, 1);
		const client = routeWith([{ ok: false, status: 413 }, { ok: true, status: 200 }]);
		assert.deepEqual(await client.route.send(PUBLISH_URL, INIT), { ok: false, status: 413 });
		assert.deepEqual(client.route.state(), { route: 'socket', last_error: null });
		assert.deepEqual(await client.route.send(PUBLISH_URL, INIT), { ok: true, status: 200 });
		assert.equal(client.calls.length, 2);
	});

	it('the socket deadline aborts a transport that never answers', async () => {
		// AbortSignal.timeout is unref'd and the isolated test has no server holding the loop:
		// keep it alive just long enough for the deadline to fire, like the real bridge does.
		const held = setTimeout(() => {}, 1_000);
		try {
			const post = (url, init) => new Promise((_, reject) => {
				init.signal.addEventListener('abort', () => reject(init.signal.reason));
			});
			const route = createSocketRoute({ socketPath: SOCKET_PATH, post, timeoutMs: 20 });
			const startedAt = Date.now();
			assert.deepEqual(await route.send(PUBLISH_URL, INIT), { ok: false, status: 0 });
			assert.ok(Date.now() - startedAt < 1_000);
		} finally {
			clearTimeout(held);
		}
	});
});
