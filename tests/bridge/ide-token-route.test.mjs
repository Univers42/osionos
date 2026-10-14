/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-token-route.test.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The main bridge exchanges an app token for a 15-minute, one-workspace IDE token. Handlers
// are called directly; the last test goes through createBridgeServer to prove the wiring.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { configFromEnv, createBridgeServer, signAppSessionToken, verifyAppSessionToken } from '../../scripts/bridge-api.mjs';
import { createIdeTokenHandler } from '../../scripts/bridge-ide-token.mjs';
import { signIdeToken, verifyIdeToken } from '../../scripts/ide-token.mjs';

const APP_SECRET = 'a'.repeat(40);
const IDE_SECRET = 'k'.repeat(32);
const WS = 'cccccccc-3333-4333-8333-cccccccccccc';
const OTHER_WS = 'dddddddd-4444-4444-8444-dddddddddddd';
const USER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const config = configFromEnv({ OSIONOS_APP_URL: 'http://localhost:3001', OSIONOS_APP_SESSION_SECRET: APP_SECRET });

let counter = 0;
// A fresh user per test keeps the per-user rate bucket from crossing tests.
function freshUser() {
	counter += 1;
	return `eeeeeeee-5555-4555-8555-${String(counter).padStart(12, '0')}`;
}

function envFor(user, extra = {}) {
	return { OSIONOS_IDE_TOKEN_SECRET: IDE_SECRET, OSIONOS_APP_SESSION_SECRET: APP_SECRET, OSIONOS_IDE_ALLOWED_SUBJECTS: user, ...extra };
}

function appToken(user) {
	return signAppSessionToken({ payload: { subject: user, provider: 'test' }, workspace: { _id: WS }, config }).token;
}

function fakeRes() {
	return {
		statusCode: 0, headers: null, body: '',
		writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
		end(body) { this.body = String(body ?? ''); },
	};
}

function fakeReq(method, { body, auth } = {}) {
	const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
	req.method = method;
	req.headers = auth ? { authorization: `Bearer ${auth}` } : {};
	return req;
}

async function call(env, { method = 'POST', body, auth, path = '/api/ide/token' } = {}) {
	const handler = createIdeTokenHandler({ config, verifySession: verifyAppSessionToken, env });
	const res = fakeRes();
	const handled = await handler(new URL(`http://x${path}`), fakeReq(method, { body, auth }), res);
	return { handled, res, json: res.body ? JSON.parse(res.body) : null };
}

test('another path is not handled', async () => {
	const user = freshUser();
	const { handled } = await call(envFor(user), { path: '/api/ide/session' });
	assert.equal(handled, false);
});

test('secret unset answers 404', async () => {
	const user = freshUser();
	const env = envFor(user);
	delete env.OSIONOS_IDE_TOKEN_SECRET;
	const { res, json } = await call(env, { auth: appToken(user), body: { workspaceId: WS } });
	assert.equal(res.statusCode, 404);
	assert.equal(json.message, 'The IDE is not enabled.');
});

test('secret of 31 bytes answers 503', async () => {
	const user = freshUser();
	const { res } = await call(envFor(user, { OSIONOS_IDE_TOKEN_SECRET: 'k'.repeat(31) }), { auth: appToken(user), body: { workspaceId: WS } });
	assert.equal(res.statusCode, 503);
});

test('secret equal to the app session secret answers 503', async () => {
	const user = freshUser();
	const { res } = await call(envFor(user, { OSIONOS_IDE_TOKEN_SECRET: APP_SECRET }), { auth: appToken(user), body: { workspaceId: WS } });
	assert.equal(res.statusCode, 503);
});

test('GET answers 405', async () => {
	const user = freshUser();
	const { res } = await call(envFor(user), { method: 'GET', auth: appToken(user) });
	assert.equal(res.statusCode, 405);
});

test('no bearer answers 401', async () => {
	const user = freshUser();
	const { res } = await call(envFor(user), { body: { workspaceId: WS } });
	assert.equal(res.statusCode, 401);
});

test('an IDE token as the bearer answers 401', async () => {
	const user = freshUser();
	const { token } = signIdeToken({ userId: user, workspaceId: WS, secret: IDE_SECRET });
	const { res } = await call(envFor(user), { auth: token, body: { workspaceId: WS } });
	assert.equal(res.statusCode, 401);
});

test('a workspace missing from the app token answers 403', async () => {
	const user = freshUser();
	const { res } = await call(envFor(user), { auth: appToken(user), body: { workspaceId: OTHER_WS } });
	assert.equal(res.statusCode, 403);
});

test('a subject outside the allowlist is refused with a 200 the browser does not log, and no token', async () => {
	const user = freshUser();
	// OTHER_WS: the allowlist is checked first, so an unlisted account learns nothing about workspaces.
	const { res, json } = await call(envFor(user, { OSIONOS_IDE_ALLOWED_SUBJECTS: USER }), { auth: appToken(user), body: { workspaceId: OTHER_WS } });
	assert.equal(res.statusCode, 200);
	assert.deepEqual(json, { ok: false, reason: 'not-allowed', message: 'The IDE is not enabled for this account.' });
});

test('a malformed workspace id answers 400', async () => {
	const user = freshUser();
	const { res } = await call(envFor(user), { auth: appToken(user), body: { workspaceId: 'nope' } });
	assert.equal(res.statusCode, 400);
});

test('success mints a 900 s token for the user and workspace', async () => {
	const user = freshUser();
	const { res, json } = await call(envFor(user), { auth: appToken(user), body: { workspaceId: WS } });
	assert.equal(res.statusCode, 200);
	assert.equal(res.headers['cache-control'], 'no-store');
	assert.equal(json.ok, true);
	const verified = verifyIdeToken(json.token, { secret: IDE_SECRET });
	assert.deepEqual(verified.workspaceIds, [WS]);
	assert.equal(verified.userId, user);
	const claims = JSON.parse(Buffer.from(json.token.split('.')[1], 'base64url').toString('utf8'));
	assert.equal(claims.exp - claims.iat, 900);
	assert.equal(json.expiresAt, new Date(claims.exp * 1000).toISOString());
});

test('the 11th rapid mint for one user answers 429', async () => {
	const user = freshUser();
	const env = envFor(user);
	const auth = appToken(user);
	for (let i = 0; i < 10; i += 1) {
		const { res } = await call(env, { auth, body: { workspaceId: WS } });
		assert.equal(res.statusCode, 200);
	}
	const { res } = await call(env, { auth, body: { workspaceId: WS } });
	assert.equal(res.statusCode, 429);
});

test('the route answers with the sandbox switch unset', async () => {
	const user = freshUser();
	const env = envFor(user);
	assert.equal(env.OSIONOS_IDE_SANDBOX, undefined);
	const { res } = await call(env, { auth: appToken(user), body: { workspaceId: WS } });
	assert.equal(res.statusCode, 200);
});

test('an error without an HTTP status answers 500 and keeps its message on the server', async () => {
	const user = freshUser();
	const handler = createIdeTokenHandler({
		config,
		verifySession: () => { throw new TypeError('internal detail'); },
		env: envFor(user),
	});
	const res = fakeRes();
	await handler(new URL('http://x/api/ide/token'), fakeReq('POST', { body: { workspaceId: WS }, auth: appToken(user) }), res);
	assert.equal(res.statusCode, 500);
	assert.doesNotMatch(res.body, /internal detail/);
});

test('createBridgeServer routes POST /api/ide/token to the handler', async () => {
	const server = createBridgeServer({ config, fetchImpl: async () => Response.json([]) });
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	try {
		const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ide/token`, { method: 'POST', body: '{}' });
		assert.equal(response.status, 404);
		assert.equal((await response.json()).message, 'The IDE is not enabled.');
	} finally {
		await new Promise((done) => server.close(done));
	}
});
