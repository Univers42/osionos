/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-node-policy.test.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// What the IDE origin forwards to a machine's VS Code server, and what it refuses or strips
// (devil verdict 2026-10-30, C7). The allowlist is the measured one: a full spike session used
// only the extension-resource route and the WebSocket upgrade, both under the pinned commit.

import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyNodeRequest, nodeRequestHeaders, nodeResponseHeaders, checkNodeOrigin } from '../../scripts/ide-node-policy.mjs';

const COMMIT = '59c988c744a240b05b039f57b856a5312f19d5b1';
const BASE = '/api/node/vm';
const ROOTS = ['/opt/osionos-server/1.138.0/vscode/extensions', '/opt/osionos-server/data/extensions'];
const policy = { basePath: BASE, commit: COMMIT, extensionRoots: ROOTS };
const resource = (path, extra = '') => `${BASE}/stable-${COMMIT}/vscode-remote-resource?path=${encodeURIComponent(path)}${extra}`;
const classify = (url, method = 'GET', isUpgrade = false) => classifyNodeRequest({ method, url, isUpgrade }, policy);

test('the WebSocket upgrade under the pinned commit is forwarded without the prefix', () => {
	const result = classify(`${BASE}/stable-${COMMIT}?reconnectionToken=abc&reconnection=false&skipWebSocketFrames=false`, 'GET', true);
	assert.deepEqual(result, { kind: 'socket', upstreamPath: `/stable-${COMMIT}?reconnectionToken=abc&reconnection=false&skipWebSocketFrames=false` });
});

test('an extension resource inside an extension root is forwarded, minus any token', () => {
	const file = `${ROOTS[0]}/theme-defaults/themes/dark_modern.json`;
	const result = classify(resource(file, '&tkn=leaked'));
	assert.equal(result.kind, 'resource');
	assert.equal(result.upstreamPath, `/stable-${COMMIT}/vscode-remote-resource?path=${encodeURIComponent(file)}`);
});

test('a resource outside the extension roots is refused, however it is spelled', () => {
	for (const path of [
		'/home/dlesieur/repo/x.html',
		`${ROOTS[0]}/../../../../etc/passwd`,
		`${ROOTS[0]}/theme/%2e%2e/x`,
		`${ROOTS[0]}//theme/x`,
		`${ROOTS[0]}/theme/x\0.json`,
		`${ROOTS[0]}-evil/x.json`,
		'relative/path.json',
		'',
	]) {
		assert.equal(classify(resource(path)).status, 404, path);
	}
	assert.equal(classify(`${BASE}/stable-${COMMIT}/vscode-remote-resource`).status, 404, 'no path');
	assert.equal(classify(`${BASE}/stable-${COMMIT}/vscode-remote-resource?path=a&path=b`).status, 404, 'two paths');
});

test('every other server route is refused', () => {
	for (const url of [
		`${BASE}/`, `${BASE}/version`, `${BASE}/delay-shutdown`, `${BASE}/callback`,
		`${BASE}/stable-${COMMIT}/web-extension-resource/x`, `${BASE}/proxy/3000/`, `${BASE}/stable-${COMMIT}/static/out/x.js`,
		`${BASE}/stable-0000000000000000000000000000000000000000/vscode-remote-resource?path=${encodeURIComponent(ROOTS[0] + '/a.json')}`,
		`/api/node/other/stable-${COMMIT}/vscode-remote-resource?path=${encodeURIComponent(ROOTS[0] + '/a.json')}`,
		`${BASE}%2fstable-${COMMIT}/vscode-remote-resource?path=x`,
	]) {
		assert.equal(classify(url).status, 404, url);
	}
});

test('methods and upgrades must match their route', () => {
	assert.equal(classify(resource(`${ROOTS[0]}/a.json`), 'POST').status, 404);
	assert.equal(classify(resource(`${ROOTS[0]}/a.json`), 'GET', true).status, 404);
	assert.equal(classify(`${BASE}/stable-${COMMIT}?reconnectionToken=abc`, 'GET', false).status, 404);
	assert.equal(classify(`${BASE}/stable-${COMMIT}?reconnectionToken=abc&evil=1`, 'GET', true).status, 404);
});

test('client credentials and forwarding headers never reach the server', () => {
	const sent = nodeRequestHeaders({
		cookie: '__Host-osio-node=x', authorization: 'Bearer y', 'x-forwarded-for': '1.2.3.4', forwarded: 'for=1.2.3.4',
		'proxy-authorization': 'z', accept: 'application/json', 'accept-encoding': 'gzip', 'user-agent': 'ua',
		connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-key': 'k', 'sec-websocket-version': '13', origin: 'https://ide.example',
	});
	assert.deepEqual(Object.keys(sent).sort(), ['accept', 'accept-encoding', 'connection', 'sec-websocket-key', 'sec-websocket-version', 'upgrade', 'user-agent']);
});

test('server cookies and CORS are dropped; resources are sandboxed and not sniffed', () => {
	const got = nodeResponseHeaders({ 'set-cookie': ['vscode-tkn=secret'], 'access-control-allow-origin': '*', location: '/', 'content-type': 'text/html', etag: '"1"' });
	assert.equal(got['set-cookie'], undefined);
	assert.equal(got.location, undefined);
	assert.equal(got['access-control-allow-origin'], undefined);
	assert.equal(got['content-security-policy'], "sandbox; default-src 'none'; frame-ancestors 'none'");
	assert.equal(got['x-content-type-options'], 'nosniff');
	assert.equal(got['content-type'], 'text/html');
	assert.equal(got.etag, '"1"');
});

test('only the IDE origin itself may call, and only same-origin', () => {
	const ide = 'https://ide.example:4100';
	assert.equal(checkNodeOrigin({ origin: ide, 'sec-fetch-site': 'same-origin' }, ide, true), true);
	assert.equal(checkNodeOrigin({ 'sec-fetch-site': 'same-origin' }, ide, false), true, 'same-origin GET may omit Origin');
	assert.equal(checkNodeOrigin({ 'sec-fetch-site': 'same-origin' }, ide, true), false, 'an upgrade must carry Origin');
	assert.equal(checkNodeOrigin({ origin: ide }, ide, true), true, 'an upgrade may omit fetch metadata; Origin decides');
	assert.equal(checkNodeOrigin({ origin: ide, 'sec-fetch-site': 'cross-site' }, ide, true), false, 'metadata, when sent, must agree');
	assert.equal(checkNodeOrigin({ origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }, ide, true), false);
	assert.equal(checkNodeOrigin({ origin: ide, 'sec-fetch-site': 'same-site' }, ide, false), false);
	assert.equal(checkNodeOrigin({}, ide, false), false, 'no fetch metadata at all');
});
