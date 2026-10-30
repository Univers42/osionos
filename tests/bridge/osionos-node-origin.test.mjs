/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   osionos-node-origin.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The IDE origin served by osionos-node (devil verdict 2026-10-30, C6, C7, C10, A6): it turns a
// node-scoped IDE token into an HttpOnly node cookie, then forwards only the allowlisted
// requests, over the machine's Unix socket, with the client's credentials stripped.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createIdeOriginServer } from '../../packages/osionos-node/ide-origin.mjs';
import { signIdeToken } from '../../scripts/ide-token.mjs';

const SECRET = 'k'.repeat(32);
const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const STRANGER = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const WS = 'cccccccc-3333-4333-8333-cccccccccccc';
const COMMIT = '59c988c744a240b05b039f57b856a5312f19d5b1';
const ROOT = '/srv/reh/vscode/extensions';
const IDE = 'https://ide.example:4100';
const SAME = { 'sec-fetch-site': 'same-origin' };

// A stand-in VS Code server on a Unix socket: echoes what reached it, upgrades echo bytes back.
async function fakeServer(dir) {
	const seen = [];
	const server = http.createServer((req, res) => {
		seen.push({ url: req.url, headers: req.headers });
		res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'vscode-tkn=secret', 'access-control-allow-origin': '*' });
		res.end('<script>alert(1)</script>');
	});
	server.on('upgrade', (req, socket) => {
		seen.push({ url: req.url, headers: req.headers, upgrade: true });
		socket.write('HTTP/1.1 101 Switching Protocols\r\nupgrade: websocket\r\nconnection: Upgrade\r\n\r\n');
		socket.on('data', (chunk) => socket.write(chunk));
		socket.on('end', () => socket.end());
	});
	const socketPath = join(dir, 'reh.sock');
	await new Promise((resolve) => server.listen(socketPath, resolve));
	return { seen, socketPath, close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }) };
}

async function world(t, { ttl } = {}) {
	const dir = mkdtempSync(join(tmpdir(), 'on-'));
	const upstream = await fakeServer(dir);
	const origin = createIdeOriginServer({
		secret: SECRET, ownerId: OWNER, ideOrigin: IDE, appOrigin: 'https://app.example:3001',
		commit: COMMIT, nodes: { laptop: { socketPath: upstream.socketPath, extensionRoots: [ROOT] } }, maxSocketsPerUser: 2,
	});
	await new Promise((resolve) => origin.server.listen(0, '127.0.0.1', resolve));
	const base = `http://127.0.0.1:${origin.server.address().port}`;
	t.after(async () => { origin.close(); await upstream.close(); rmSync(dir, { recursive: true, force: true }); });
	return { base, upstream, origin, ttl };
}

const ideToken = (user = OWNER, scope = 'node', ttlSeconds = 900) => signIdeToken({ userId: user, workspaceId: WS, secret: SECRET, scope: scope ?? undefined, ttlSeconds }).token;

async function openSession(base, { token = ideToken(), node = 'laptop', headers = SAME } = {}) {
	const res = await fetch(`${base}/api/node/session`, { method: 'POST', headers: { origin: IDE, ...headers, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ node }) });
	const cookie = res.headers.get('set-cookie');
	return { status: res.status, cookie, pair: cookie?.split(';')[0] };
}

const resourceUrl = (base, file = `${ROOT}/theme/x.json`) => `${base}/api/node/laptop/stable-${COMMIT}/vscode-remote-resource?path=${encodeURIComponent(file)}`;

test('a node-scoped IDE token from the owner becomes a __Host- HttpOnly Strict cookie', async (t) => {
	const { base } = await world(t);
	const { status, cookie } = await openSession(base);
	assert.equal(status, 204);
	assert.match(cookie, /^__Host-osio-node-laptop=nc1\./);
	for (const flag of ['Path=/', 'Secure', 'HttpOnly', 'SameSite=Strict']) assert.ok(cookie.includes(flag), flag);
	assert.match(cookie, /Max-Age=(8\d\d|900)/);
});

test('the session mint refuses a plain token, a stranger, an unknown node and a cross-site call', async (t) => {
	const { base } = await world(t);
	assert.equal((await openSession(base, { token: ideToken(OWNER, null) })).status, 403);
	assert.equal((await openSession(base, { token: ideToken(STRANGER) })).status, 403);
	assert.equal((await openSession(base, { node: 'vm' })).status, 404);
	assert.equal((await openSession(base, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
	assert.equal((await openSession(base, { headers: { ...SAME, origin: 'https://evil.example' } })).status, 403);
	assert.equal((await openSession(base, { token: 'osionos_ide1.garbage.x' })).status, 401);
});

test('an allowed resource is forwarded without the prefix, credentials stripped, sandboxed back', async (t) => {
	const { base, upstream } = await world(t);
	const { pair } = await openSession(base);
	const res = await fetch(resourceUrl(base), { headers: { ...SAME, cookie: pair, authorization: 'Bearer x', 'x-forwarded-for': '1.2.3.4' } });
	assert.equal(res.status, 200);
	assert.equal(res.headers.get('content-security-policy'), "sandbox; default-src 'none'; frame-ancestors 'none'");
	assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
	assert.equal(res.headers.get('set-cookie'), null);
	assert.equal(res.headers.get('access-control-allow-origin'), null);
	const reached = upstream.seen.at(-1);
	assert.equal(reached.url, `/stable-${COMMIT}/vscode-remote-resource?path=${encodeURIComponent(`${ROOT}/theme/x.json`)}`);
	for (const name of ['cookie', 'authorization', 'x-forwarded-for']) assert.equal(reached.headers[name], undefined, name);
});

test('no cookie, a foreign cookie or a refused route never reaches the server', async (t) => {
	const { base, upstream } = await world(t);
	const { pair } = await openSession(base);
	assert.equal((await fetch(resourceUrl(base), { headers: SAME })).status, 401);
	assert.equal((await fetch(resourceUrl(base), { headers: { ...SAME, cookie: pair.replace('laptop', 'vm') } })).status, 401);
	assert.equal((await fetch(resourceUrl(base), { headers: { 'sec-fetch-site': 'cross-site', cookie: pair } })).status, 403);
	const refused = await fetch(`${base}/api/node/laptop/version`, { headers: { ...SAME, cookie: pair } });
	assert.equal(refused.status, 404);
	assert.equal(await refused.text(), 'Not found.');
	assert.equal(upstream.seen.length, 0);
});

function upgrade(base, path, headers) {
	return new Promise((resolve) => {
		const req = http.request(`${base}${path}`, { headers: { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-key': 'a2V5', 'sec-websocket-version': '13', ...headers } });
		req.on('upgrade', (res, socket) => resolve({ ok: true, socket }));
		req.on('response', (res) => resolve({ ok: false, status: res.statusCode }));
		req.on('error', () => resolve({ ok: false, status: 0 }));
		req.end();
	});
}

const socketPath = `/api/node/laptop/stable-${COMMIT}?reconnectionToken=r1&reconnection=false&skipWebSocketFrames=false`;
const wsHeaders = (pair) => ({ ...SAME, origin: IDE, cookie: pair });

test('a WebSocket from the IDE origin is spliced to the server; a foreign origin is refused', async (t) => {
	const { base, upstream } = await world(t);
	const { pair } = await openSession(base);
	const opened = await upgrade(base, socketPath, wsHeaders(pair));
	assert.ok(opened.ok);
	const echo = await new Promise((resolve) => { opened.socket.once('data', (d) => resolve(String(d))); opened.socket.write('ping'); });
	assert.equal(echo, 'ping');
	assert.equal(upstream.seen.at(-1).url, `/stable-${COMMIT}?reconnectionToken=r1&reconnection=false&skipWebSocketFrames=false`);
	assert.equal(upstream.seen.at(-1).headers.cookie, undefined);
	opened.socket.destroy();
	const foreign = await upgrade(base, socketPath, { ...wsHeaders(pair), origin: 'https://evil.example' });
	assert.equal(foreign.ok, false);
});

test('sockets per user are capped, and a revoked user is cut at once', async (t) => {
	const { base, origin } = await world(t);
	const { pair } = await openSession(base);
	const one = await upgrade(base, socketPath, wsHeaders(pair));
	const two = await upgrade(base, socketPath, wsHeaders(pair));
	const three = await upgrade(base, socketPath, wsHeaders(pair));
	assert.ok(one.ok && two.ok);
	assert.equal(three.status, 429);
	const closed = new Promise((resolve) => one.socket.once('close', resolve));
	origin.revoke(OWNER);
	await closed;
	two.socket.destroy();
	assert.equal((await upgrade(base, socketPath, wsHeaders(pair))).status, 401, 'a cookie minted before the revocation is dead');
	await new Promise((resolve) => setTimeout(resolve, 1100));
	const fresh = await openSession(base);
	const again = await upgrade(base, socketPath, wsHeaders(fresh.pair));
	assert.ok(again.ok, 'a session minted after the revocation works');
	again.socket.destroy();
});

test('a socket closes when its access expires unless the session was refreshed', async (t) => {
	const { base } = await world(t);
	const short = ideToken(OWNER, 'node', 2);
	const { pair } = await openSession(base, { token: short });
	const opened = await upgrade(base, socketPath, wsHeaders(pair));
	assert.ok(opened.ok);
	const started = Date.now();
	const received = [];
	opened.socket.on('data', (chunk) => received.push(chunk));
	await new Promise((resolve) => opened.socket.once('close', resolve));
	assert.ok(Date.now() - started < 3500, 'closed at expiry');
	assert.deepEqual([...Buffer.concat(received).subarray(-4)], [0x88, 0x02, 0x0f, 0xab], 'closed with 4011');
	assert.equal((await upgrade(base, socketPath, wsHeaders(pair))).status, 401, 'no reconnect on the expired cookie');

	const refreshed = await openSession(base, { token: ideToken(OWNER, 'node', 2) });
	const kept = await upgrade(base, socketPath, wsHeaders(refreshed.pair));
	await openSession(base, { token: ideToken() }); // refresh before expiry
	await new Promise((resolve) => setTimeout(resolve, 2600));
	assert.equal(kept.socket.destroyed, false, 'a refresh keeps the socket open');
	kept.socket.destroy();
});

test('an unreachable server answers a fixed 502', async (t) => {
	const { base, upstream } = await world(t);
	const { pair } = await openSession(base);
	await upstream.close();
	rmSync(upstream.socketPath, { force: true });
	const res = await fetch(resourceUrl(base), { headers: { ...SAME, cookie: pair } });
	assert.equal(res.status, 502);
	assert.equal(await res.text(), 'The machine is not reachable.');
});
