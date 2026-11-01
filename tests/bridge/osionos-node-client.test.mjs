/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   osionos-node-client.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The IDE page as osionos-node serves it (devil verdict 2026-10-30, C9, C0-F2): an enforced CSP
// with no inline script, framable by the app origin alone, and nothing outside the build.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClientHandler } from '../../packages/osionos-node/static-client.mjs';

const APP = 'https://app.example:3001';

async function serve(t, appOrigin = APP) {
	const root = mkdtempSync(join(tmpdir(), 'ide-dist-'));
	mkdirSync(join(root, 'assets'));
	writeFileSync(join(root, 'index.html'), '<meta name="osionos-app-origin" content="%OSIONOS_APP_ORIGIN%"><script type="module" src="/assets/main.js"></script>');
	writeFileSync(join(root, 'assets', 'main.js'), 'export {}');
	writeFileSync(join(root, 'assets', 'textmate.wasm'), 'wasm');
	writeFileSync(join(root, 'assets', '_commonjsHelpers-x1.js'), 'export {}');
	writeFileSync(join(root, 'secret.txt'), 'nope');
	const server = http.createServer(createClientHandler({ root, appOrigin }));
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	t.after(() => { server.close(); rmSync(root, { recursive: true, force: true }); });
	return `http://127.0.0.1:${server.address().port}`;
}

test('the page carries the app origin and a CSP only the app may frame', async (t) => {
	const base = await serve(t);
	const res = await fetch(`${base}/?node=laptop&folder=/x`);
	assert.equal(res.status, 200);
	assert.match(await res.text(), /content="https:\/\/app\.example:3001"/);
	const csp = res.headers.get('content-security-policy');
	assert.match(csp, /frame-ancestors https:\/\/app\.example:3001(;|$)/);
	assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'(;|$)/);
	assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
	assert.match(csp, /default-src 'none'/);
	assert.equal(res.headers.get('cache-control'), 'no-store');
	assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('assets are served with their type; anything outside assets/ or escaping it is a 404', async (t) => {
	const base = await serve(t);
	const js = await fetch(`${base}/assets/main.js`);
	assert.equal(js.status, 200);
	assert.match(js.headers.get('content-type'), /^text\/javascript/);
	assert.equal((await fetch(`${base}/assets/textmate.wasm`)).headers.get('content-type'), 'application/wasm');
	assert.equal((await fetch(`${base}/assets/_commonjsHelpers-x1.js`)).status, 200, 'Rollup helper chunks start with _');
	for (const path of ['/secret.txt', '/assets/../secret.txt', '/assets/%2e%2e/secret.txt', '/assets/', '/assets/.env', '/assets/missing.js', '/index.html/x']) {
		assert.equal((await fetch(`${base}${path}`)).status, 404, path);
	}
	assert.equal((await fetch(`${base}/assets/main.js`, { method: 'POST' })).status, 405);
});

test('an app origin that is not a bare origin is refused at start', () => {
	for (const bad of ['', 'app.example', 'https://app.example/', 'https://app.example/path', "https://a.example 'unsafe-inline'", 'javascript:alert(1)']) {
		assert.throws(() => createClientHandler({ root: tmpdir(), appOrigin: bad }), /app origin/, bad);
	}
});
