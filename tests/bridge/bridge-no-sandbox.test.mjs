/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-no-sandbox.test.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The sandbox daemon is owned by the IDE server (one process per daemon); the main bridge must
// answer 404 on those routes even for a valid app bearer, and refuse every WebSocket upgrade.

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { configFromEnv, createBridgeServer, signAppSessionToken } from '../../scripts/bridge-api.mjs';

const WS = 'cccccccc-3333-4333-8333-cccccccccccc';
const USER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const config = configFromEnv({ OSIONOS_APP_URL: 'http://localhost:3001', OSIONOS_APP_SESSION_SECRET: 'a'.repeat(40) });
const ENV_KEYS = ['OSIONOS_IDE_SANDBOX', 'OSIONOS_IDE_DOCKER_HOST', 'OSIONOS_IDE_TOKEN_SECRET'];

let savedEnv;
let server;
let base;

before(async () => {
	savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
	process.env.OSIONOS_IDE_SANDBOX = '1';
	process.env.OSIONOS_IDE_DOCKER_HOST = '127.0.0.1:9';
	process.env.OSIONOS_IDE_TOKEN_SECRET = 'k'.repeat(32);
	server = createBridgeServer({ config, fetchImpl: async () => Response.json([]) });
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
	for (const key of ENV_KEYS) {
		if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key];
	}
	server.closeAllConnections?.();
	await new Promise((resolve) => server.close(resolve));
});

const appBearer = () => signAppSessionToken({ payload: { subject: USER, provider: 'test' }, workspace: { _id: WS }, config }).token;

const ROUTES = [
	['GET', `/api/ide/session?workspaceId=${WS}`],
	['POST', '/api/ide/fs'],
	['POST', '/api/ide/git'],
	['POST', '/api/ide/search'],
	['GET', `/api/ide/ports?workspaceId=${WS}`],
	['POST', '/api/ide/preview/session'],
];

for (const [method, path] of ROUTES) {
	for (const withBearer of [false, true]) {
		test(`${method} ${path.split('?')[0]} is 404 on the main bridge ${withBearer ? 'with' : 'without'} an app bearer`, async () => {
			const headers = { 'content-type': 'application/json' };
			if (withBearer) headers.authorization = `Bearer ${appBearer()}`;
			const response = await fetch(base + path, { method, headers, body: method === 'POST' ? JSON.stringify({ workspaceId: WS }) : undefined });
			assert.equal(response.status, 404);
		});
	}
}

function upgradeOutcome(path) {
	return new Promise((resolve) => {
		const req = http.request(base + path, { headers: { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', authorization: `Bearer ${appBearer()}` } });
		req.on('upgrade', (res, socket) => { socket.destroy(); resolve(res.statusCode); });
		req.on('response', (res) => { res.resume(); resolve(res.statusCode); });
		req.on('error', () => resolve('closed'));
		req.end();
	});
}

for (const path of ['/api/ide/pty', '/api/ide/lsp', '/api/ide/fsync']) {
	test(`an upgrade to ${path} never gets 101 on the main bridge`, async () => {
		const outcome = await upgradeOutcome(`${path}?workspaceId=${WS}`);
		assert.notEqual(outcome, 101);
	});
}

test('POST /api/ide/token without a bearer is 401: the mint route stays wired', async () => {
	const response = await fetch(`${base}/api/ide/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: WS }) });
	assert.equal(response.status, 401);
});
