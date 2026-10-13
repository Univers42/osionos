/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-server.test.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The IDE process answers one browser origin and accepts only IDE tokens. Every case below
// fails before docker is reached (nothing listens on the configured docker host).

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createIdeServer } from '../../scripts/ide-server.mjs';
import { armTokenExpiry } from '../../scripts/bridge-ide-exec.mjs';
import { signIdeToken } from '../../scripts/ide-token.mjs';
import { signAppSessionToken, configFromEnv } from '../../scripts/bridge-api.mjs';

const USER = '11111111-1111-4111-8111-111111111111';
const WS_A = '22222222-2222-4222-8222-222222222222';
const WS_B = '33333333-3333-4333-8333-333333333333';
const SECRET = 'k'.repeat(32);
const APP_SECRET = 'a'.repeat(40);
const ORIGIN = 'https://app.example';
const ENV = {
	OSIONOS_IDE_TOKEN_SECRET: SECRET,
	OSIONOS_APP_SESSION_SECRET: APP_SECRET,
	OSIONOS_IDE_ALLOWED_ORIGIN: ORIGIN,
	OSIONOS_IDE_SANDBOX: '1',
	OSIONOS_IDE_DOCKER_HOST: '127.0.0.1:9',
	OSIONOS_IDE_ALLOWED_SUBJECTS: USER,
};

const ideToken = (workspaceId = WS_A) => signIdeToken({ userId: USER, workspaceId, secret: SECRET }).token;
const appToken = () => signAppSessionToken({
	payload: { subject: USER, provider: 'test' },
	workspace: { _id: WS_A },
	config: configFromEnv({ ...ENV, OSIONOS_APP_SESSION_SECRET: APP_SECRET }),
}).token;

async function withServer(run, env = ENV) {
	const server = createIdeServer({ env });
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const base = `http://127.0.0.1:${server.address().port}`;
	try { return await run(base, server); } finally { server.close(); server.closeAllConnections(); }
}

const get = (base, path, headers = {}, method = 'GET') => fetch(`${base}${path}`, { method, headers });
const bearer = (token) => ({ authorization: `Bearer ${token}` });

function rawUpgrade(server, path, headers) {
	return new Promise((resolve, reject) => {
		const req = httpRequest({
			host: '127.0.0.1', port: server.address().port, path,
			headers: {
				connection: 'upgrade', upgrade: 'websocket', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
				'sec-websocket-version': '13', ...headers,
			},
		});
		req.on('upgrade', (res, socket) => { socket.destroy(); resolve(`HTTP/1.1 ${res.statusCode}`); });
		req.on('response', (res) => { res.resume(); resolve(`HTTP/1.1 ${res.statusCode}`); });
		req.on('error', reject);
		req.end();
	});
}

describe('createIdeServer start-up', () => {
	const refuses = (name, patch) => it(`refuses ${name}`, () => {
		assert.throws(() => createIdeServer({ env: { ...ENV, ...patch } }), (error) => error.status === 503);
	});
	refuses('an unset secret', { OSIONOS_IDE_TOKEN_SECRET: undefined });
	refuses('a 31-byte secret', { OSIONOS_IDE_TOKEN_SECRET: 'k'.repeat(31) });
	refuses('a secret equal to the app secret', { OSIONOS_IDE_TOKEN_SECRET: APP_SECRET });
	refuses('an unset origin', { OSIONOS_IDE_ALLOWED_ORIGIN: undefined });
	refuses('an origin with a trailing slash', { OSIONOS_IDE_ALLOWED_ORIGIN: 'https://app.example/' });
	refuses('a non-http origin', { OSIONOS_IDE_ALLOWED_ORIGIN: 'ftp://x' });
});

describe('ide server routing', () => {
	it('answers /healthz without auth and sets nosniff', () => withServer(async (base) => {
		const res = await get(base, '/healthz');
		assert.equal(res.status, 200);
		assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
		assert.deepEqual(await res.json(), { ok: true });
	}));

	it('refuses an app token, a missing token, and another workspace', () => withServer(async (base) => {
		const path = `/api/ide/session?workspaceId=${WS_A}`;
		assert.equal((await get(base, path, bearer(appToken()))).status, 401);
		assert.equal((await get(base, path)).status, 401);
		assert.equal((await get(base, `/api/ide/session?workspaceId=${WS_B}`, bearer(ideToken(WS_A)))).status, 403);
	}));

	it('never reads a token from the query string', () => withServer(async (base) => {
		const res = await get(base, `/api/ide/session?workspaceId=${WS_A}&token=${ideToken()}`);
		assert.equal(res.status, 401);
	}));

	for (const origin of ['null', 'http://127.0.0.1:4100', 'http://localhost:5173', `${ORIGIN}.evil.example`, `${ORIGIN}/`]) {
		it(`refuses origin ${origin}`, () => withServer(async (base) => {
			const res = await get(base, `/api/ide/session?workspaceId=${WS_A}`, { origin, ...bearer(ideToken()) });
			assert.equal(res.status, 403);
			assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
		}));
	}

	it('answers the preflight for the exact origin only', () => withServer(async (base) => {
		const ok = await get(base, '/api/ide/fs', { origin: ORIGIN }, 'OPTIONS');
		assert.equal(ok.status, 204);
		assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
		assert.equal(ok.headers.get('access-control-allow-methods'), 'GET, POST, DELETE');
		assert.equal(ok.headers.get('access-control-allow-headers'), 'authorization, content-type');
		assert.equal(ok.headers.get('access-control-max-age'), '600');
		assert.equal(ok.headers.get('vary'), 'Origin');
		assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
		assert.equal((await get(base, '/api/ide/fs', { origin: 'https://other.example' }, 'OPTIONS')).status, 403);
	}));

	it('does not serve the app API or the token and run routes', () => withServer(async (base) => {
		for (const path of ['/api/pages', '/api/ide/token', '/api/ide/run', '/api/ide/format']) {
			const res = await get(base, path, bearer(ideToken()));
			assert.equal(res.status, 404, path);
			assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
		}
	}));

	it('refuses an upgrade from another origin and one carrying an app token', () => withServer(async (base, server) => {
		const path = `/api/ide/pty?workspaceId=${WS_A}`;
		assert.equal(await rawUpgrade(server, path, { origin: 'https://other.example' }), 'HTTP/1.1 403');
		assert.equal(await rawUpgrade(server, path, { origin: ORIGIN, 'sec-websocket-protocol': `osio-ide-token.${appToken()}` }), 'HTTP/1.1 401');
		assert.equal(await rawUpgrade(server, path, { origin: ORIGIN, 'sec-websocket-protocol': `osio-token.${appToken()}` }), 'HTTP/1.1 401');
	}));

	it('writes no token to any log channel', () => withServer(async (base) => {
		const token = ideToken();
		const calls = [];
		const spies = ['log', 'info', 'warn', 'error'].map((name) => mock.method(console, name, (...args) => calls.push(args)));
		try {
			await get(base, `/api/ide/session?workspaceId=${WS_A}`, bearer(token));
			await get(base, `/api/ide/session?workspaceId=${WS_B}`, bearer(token));
		} finally { spies.forEach((spy) => spy.mock.restore()); }
		assert.equal(JSON.stringify(calls).includes(token), false);
	}));
});

describe('armTokenExpiry', () => {
	const fakeSocket = () => Object.assign(new EventEmitter(), { destroyed: false, ended: [], end(frame) { this.ended.push(frame); } });

	it('closes with 4011 at exp', () => {
		mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
		try {
			const socket = fakeSocket();
			armTokenExpiry(socket, 1_030, Date.now());
			mock.timers.tick(29_999);
			assert.equal(socket.ended.length, 0);
			mock.timers.tick(1);
			assert.equal(socket.ended.length, 1);
			assert.equal(socket.ended[0].readUInt16BE(2), 4011);
		} finally { mock.timers.reset(); }
	});

	it('does nothing when the socket closed first', () => {
		mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
		try {
			const socket = fakeSocket();
			armTokenExpiry(socket, 1_030, Date.now());
			socket.emit('close');
			mock.timers.tick(60_000);
			assert.equal(socket.ended.length, 0);
		} finally { mock.timers.reset(); }
	});

	it('arms nothing without a finite exp', () => {
		mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
		try {
			for (const exp of [undefined, NaN, 'x']) {
				const socket = fakeSocket();
				armTokenExpiry(socket, exp, Date.now());
				mock.timers.tick(10_000_000);
				assert.equal(socket.ended.length, 0);
				assert.equal(socket.listenerCount('close'), 0);
			}
		} finally { mock.timers.reset(); }
	});
});
