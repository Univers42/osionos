// The node serves the web terminal page (devil verdict 2026-11-01, W12) and answers only requests
// naming its own origin (W1): a DNS-rebound page sends its own name in Host, and gets 403 on every
// route, the pty upgrade included.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createIdeOriginServer } from '../../packages/osionos-node/ide-origin.mjs';
import { createMachineSession } from '../../packages/osionos-node/machine-identity.mjs';
import { createClientHandler, terminalCsp } from '../../packages/osionos-node/static-client.mjs';
import { bridgeKeyFromSeed } from '../../scripts/ide-machine-protocol.mjs';
import { generateAgentKeyPair } from '../../scripts/ide-agent-frames.mjs';
import { fakeHost } from './support/pty-fakes.mjs';
import { createHostedFetch } from './support/host-fetch.mjs';

const APPS = ['https://baas.tail10f2ea.ts.net:8443', 'https://baas-beta.tail10f2ea.ts.net', 'app://osionos'];
const MACHINE = 'm-abcdefghijklmnop';
const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const hosted = createHostedFetch();

function roots(t) {
	const dir = mkdtempSync(join(tmpdir(), 'tp-'));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const ide = join(dir, 'ide');
	const terminal = join(dir, 'terminal');
	for (const root of [ide, terminal]) mkdirSync(join(root, 'assets', 'nested'), { recursive: true });
	writeFileSync(join(ide, 'index.html'), '<meta name="osionos-app-origin" content="%OSIONOS_APP_ORIGIN%">ide');
	writeFileSync(join(terminal, 'index.html'), '<meta name="osionos-app-origin" content="%OSIONOS_APP_ORIGIN%">terminal');
	writeFileSync(join(terminal, 'assets', 'index-abc.js'), 'export {};');
	writeFileSync(join(terminal, 'assets', 'nested', 'deep.js'), 'export {};');
	writeFileSync(join(dir, 'secret.txt'), 'outside');
	return { ide, terminal };
}

async function world(t) {
	const { ide, terminal } = roots(t);
	const probe = http.createServer();
	await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
	const { port } = probe.address();
	await new Promise((resolve) => probe.close(resolve));
	const ideOrigin = `http://127.0.0.1:${port}`;
	const key = bridgeKeyFromSeed(randomBytes(32).toString('base64url'));
	const { privateKey } = generateAgentKeyPair();
	const machine = {
		machineId: MACHINE, ownerId: OWNER, bridgeUrl: 'https://bridge.example', bridgeKeys: { [key.kid]: key.publicKey },
		privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url'),
	};
	const accepted = [];
	const origin = createIdeOriginServer({
		...createMachineSession({ machine, home: '/home/owner' }).originOptions, ownerId: OWNER, ideOrigin, commit: 'c'.repeat(40),
		nodes: { [MACHINE]: { socketPath: '/nonexistent.sock', extensionRoots: [] } },
		client: createClientHandler({ root: ide, terminalRoot: terminal, appOrigins: APPS }),
		pty: { host: fakeHost(), accept: (req, socket) => { accepted.push(req.url); socket.destroy(); return Promise.resolve(null); } },
	});
	await new Promise((resolve) => origin.server.listen(port, '127.0.0.1', resolve));
	hosted.bind(ideOrigin, ideOrigin);
	t.after(() => origin.close());
	return { base: ideOrigin, accepted };
}

const get = (base, path, headers = {}) => hosted.fetch(`${base}${path}`, { headers });

function upgrade(base, headers) {
	return new Promise((resolve) => {
		const req = http.request(`${base}/api/pty`, { headers: { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-key': 'a2V5', 'sec-websocket-version': '13', ...headers } });
		req.on('upgrade', (res, socket) => { socket.destroy(); resolve(101); });
		req.on('response', (res) => { res.resume(); resolve(res.statusCode); });
		req.on('error', () => resolve(0));
		req.end();
	});
}

test('W12: the page carries its own exact policy, names the app origins, and is never cached', async (t) => {
	const { base } = await world(t);
	for (const path of ['/terminal/', '/terminal/index.html']) {
		const res = await get(base, path);
		assert.equal(res.status, 200, path);
		assert.equal(res.headers.get('content-security-policy'), terminalCsp(APPS));
		assert.equal(res.headers.get('cache-control'), 'no-store');
		assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
		assert.match(await res.text(), new RegExp(`content="${APPS.join(' ')}">terminal`));
	}
	const csp = terminalCsp(APPS).split('; ');
	for (const directive of ["default-src 'none'", "script-src 'self'", "connect-src 'self'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'", `frame-ancestors ${APPS.join(' ')}`]) {
		assert.ok(csp.includes(directive), directive);
	}
	const sources = csp.filter((directive) => !directive.startsWith('frame-ancestors ')).join('; ');
	assert.doesNotMatch(sources, /open-vsx|https?:|wss?:|unsafe-eval|127\.0\.0\.1|localhost/);
});

test('W12: only flat assets of the terminal build are served; nested, escaping and unknown paths are 404', async (t) => {
	const { base } = await world(t);
	const asset = await get(base, '/terminal/assets/index-abc.js');
	assert.equal(asset.status, 200);
	assert.equal(asset.headers.get('content-type'), 'text/javascript; charset=utf-8');
	for (const path of ['/terminal/../secret.txt', '/terminal/%2e%2e/secret.txt', '/terminal/assets/nested/deep.js', '/terminal/assets/..%2fsecret.txt',
		'/terminal/assets/.hidden', '/terminal/missing.js', '/terminal', '/terminal/x/index.html', '/terminal/index.html/']) {
		const res = await get(base, path);
		assert.equal(res.status, 404, path);
		assert.equal(res.headers.get('content-security-policy'), terminalCsp(APPS), `${path} carries the policy`);
	}
	assert.equal((await get(base, '/')).status, 200, 'the IDE page is unchanged');
});

test('W1: a request or upgrade naming another host is 403 on every route; the node\'s own host passes', async (t) => {
	const { base, accepted } = await world(t);
	const port = new URL(base).port;
	const evil = { host: `evil.test:${port}`, 'sec-fetch-site': 'same-origin' };
	for (const path of ['/terminal/', '/api/machine/self', '/', '/api/node/session']) {
		assert.equal((await get(base, path, evil)).status, 403, path);
	}
	for (const host of [`evil.test:${port}`, `localhost:${port}`, '127.0.0.1', `127.0.0.1:${Number(port) + 1}`]) {
		assert.equal(await upgrade(base, { host, origin: base }), 403, host);
	}
	assert.deepEqual(accepted, [], 'no refused upgrade reached the socket');
	assert.equal((await get(base, '/api/machine/self', { 'sec-fetch-site': 'same-origin' })).status, 200);
	assert.equal((await get(base, '/terminal/')).status, 200);
	await upgrade(base, { origin: base });
	assert.deepEqual(accepted, ['/api/pty']);
});
