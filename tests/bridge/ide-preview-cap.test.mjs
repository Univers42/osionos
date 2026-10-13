/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-preview-cap.test.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The preview opens on a signed, port-bound link served in an opaque origin: every /p/ answer
// carries the same six headers, nothing from the box except a validated content type reaches the
// browser, and the cookie route is gone. The box is a fake upstream; docker is never reached.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createIdePreviewHandler, PREVIEW_HEADERS } from '../../scripts/ide-preview.mjs';
import { createIdeServer } from '../../scripts/ide-server.mjs';
import { signIdeToken, signPreviewCap } from '../../scripts/ide-token.mjs';

const SECRET = 'k'.repeat(32);
const USER = '11111111-1111-4111-8111-111111111111';
const WS = '22222222-2222-4222-8222-222222222222';
const CONFIG = { allowedOrigin: 'https://app.example' };
const ENV = {
	OSIONOS_IDE_TOKEN_SECRET: SECRET,
	OSIONOS_APP_SESSION_SECRET: 'a'.repeat(40),
	OSIONOS_IDE_SANDBOX: '1',
	OSIONOS_IDE_DOCKER_HOST: '127.0.0.1:9',
	OSIONOS_IDE_PUBLIC_URL: 'https://ide.example',
	OSIONOS_IDE_ALLOWED_SUBJECTS: USER,
};
const FORBIDDEN = ['set-cookie', 'location', 'access-control-allow-credentials'];

const fakeRes = () => ({
	statusCode: 0, headers: null, body: '',
	writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
	end(body) { this.body = String(body ?? ''); },
});

const capFor = (overrides = {}) => signPreviewCap({
	userId: USER, workspaceId: WS, port: 3000, secret: SECRET, parentExp: Math.floor(Date.now() / 1000) + 600, ...overrides,
}).cap;

const okAnswer = (extra = {}) => ({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: Buffer.from('hi').toString('base64'), ...extra });

function setup({ env = ENV, upstream = async () => okAnswer(), session = { userId: USER, workspaceIds: [WS], exp: Math.floor(Date.now() / 1000) + 600 } } = {}) {
	return createIdePreviewHandler({ config: CONFIG, verifySession: () => session, env, upstream });
}

async function serve(handler, path, method = 'GET', headers = {}) {
	const response = fakeRes();
	await handler(new URL(`http://x${path}`), { method, headers }, response, CONFIG);
	return response;
}

async function mint(handler, body) {
	const response = fakeRes();
	const request = Object.assign(Readable.from([JSON.stringify(body)]), { method: 'POST', headers: { authorization: 'Bearer t' } });
	await handler(new URL('http://x/api/ide/preview/session'), request, response, CONFIG);
	return response;
}

function assertPreviewShape(response) {
	for (const [name, value] of Object.entries(PREVIEW_HEADERS)) assert.equal(response.headers[name], value, name);
	for (const name of FORBIDDEN) assert.equal(response.headers[name], undefined, name);
	assert.match(response.headers['content-security-policy'], /^sandbox allow-scripts allow-forms allow-popups; frame-ancestors 'none'$/);
}

describe('minting a preview link', () => {
	it('returns a signed url on the public origin and sets no cookie', async () => {
		const response = await mint(setup(), { workspaceId: WS, port: 3000 });
		assert.equal(response.statusCode, 200);
		assert.ok(JSON.parse(response.body).url.startsWith('https://ide.example/p/pc1.'));
		assert.equal(response.headers['set-cookie'], undefined);
	});

	it('needs a token that carries an expiry', async () => {
		const response = await mint(setup({ session: { userId: USER, workspaceIds: [WS] } }), { workspaceId: WS, port: 3000 });
		assert.equal(response.statusCode, 401);
	});

	for (const port of [0, 70000, '3000', 1.5]) {
		it(`refuses port ${JSON.stringify(port)}`, async () => {
			assert.equal((await mint(setup(), { workspaceId: WS, port })).statusCode, 400);
		});
	}

	for (const value of [undefined, 'https://ide.example/', 'ftp://ide.example', 'not a url']) {
		it(`answers 503 when the public url is ${JSON.stringify(value)}`, async () => {
			const response = await mint(setup({ env: { ...ENV, OSIONOS_IDE_PUBLIC_URL: value } }), { workspaceId: WS, port: 3000 });
			assert.equal(response.statusCode, 503);
			assert.equal(JSON.parse(response.body).message, 'Preview is not configured.');
		});
	}
});

describe('every /p/ answer carries the same headers', () => {
	const cases = [
		['upstream 200', () => okAnswer(), 'GET', 200],
		['upstream 302 with location and cookie', () => okAnswer({ status: 302, headers: { location: 'https://elsewhere.example/', 'set-cookie': 'a=b', 'content-type': 'text/html' } }), 'GET', 302],
		['upstream 404', () => okAnswer({ status: 404 }), 'GET', 404],
		['upstream 500', () => okAnswer({ status: 500 }), 'GET', 500],
		['HEAD', () => okAnswer(), 'HEAD', 200],
	];
	for (const [name, answer, method, status] of cases) {
		it(name, async () => {
			const response = await serve(setup({ upstream: async () => answer() }), `/p/${capFor()}/index.html`, method);
			assert.equal(response.statusCode, status);
			assertPreviewShape(response);
			assert.deepEqual(Object.keys(response.headers).sort(), [...Object.keys(PREVIEW_HEADERS), 'content-length', 'content-type'].sort());
			if (method === 'HEAD') assert.equal(response.body, '');
		});
	}

	it('an invalid cap (401), an expired cap (410), a 405, a 404 and gate-off', async () => {
		const handler = setup();
		const expired = capFor({ now: Date.now() - 3600_000, parentExp: Math.floor(Date.now() / 1000) - 3000 });
		const invalid = await serve(handler, '/p/pc1.aaaa.bbbb/');
		const old = await serve(handler, `/p/${expired}/`);
		const method = await serve(handler, `/p/${capFor()}/`, 'POST');
		const nomatch = await serve(handler, '/p/nope');
		const off = await serve(setup({ env: { ...ENV, OSIONOS_IDE_SANDBOX: '0' } }), `/p/${capFor()}/`);
		assert.deepEqual([invalid, old, method, nomatch, off].map((r) => r.statusCode), [401, 410, 405, 404, 404]);
		assert.equal(invalid.body, 'This preview link is not valid.');
		assert.equal(old.body, 'This preview link has expired. Reopen it from the Ports panel.');
		for (const response of [invalid, old, method, nomatch, off]) assertPreviewShape(response);
	});
});

describe('what reaches the browser from the box', () => {
	const typeOf = async (value) => (await serve(setup({ upstream: async () => okAnswer({ headers: { 'content-type': value } }) }), `/p/${capFor()}/`)).headers['content-type'];

	it('passes a well-formed content type through', async () => {
		assert.equal(await typeOf('text/html; charset=utf-8'), 'text/html; charset=utf-8');
	});
	it('replaces an injected or empty content type', async () => {
		assert.equal(await typeOf('text/html\r\nx: y'), 'application/octet-stream');
		assert.equal(await typeOf('text/html;\r\nx=y'), 'application/octet-stream');
		assert.equal(await typeOf(''), 'application/octet-stream');
	});
	for (const [name, answer] of [['199', { status: 199 }], ['600', { status: 600 }], ['a string', { status: '200' }], ['truncated', { truncated: true }]]) {
		it(`refuses an upstream answer that is ${name}`, async () => {
			const response = await serve(setup({ upstream: async () => okAnswer(answer) }), `/p/${capFor()}/`);
			assert.equal(response.statusCode, 502);
			assertPreviewShape(response);
		});
	}
});

describe('what the link authorises', () => {
	it('reaches only the port inside the signed link, with the path and query', async () => {
		const asked = [];
		const handler = setup({ upstream: async (names, port, req) => { asked.push({ port, path: req.path, method: req.method }); return okAnswer(); } });
		await serve(handler, `/p/${capFor({ port: 3000 })}/a/b?x=1`);
		await serve(handler, `/p/${capFor({ port: 3000 })}`, 'HEAD');
		assert.deepEqual(asked, [{ port: 3000, path: '/a/b?x=1', method: 'GET' }, { port: 3000, path: '/', method: 'HEAD' }]);
	});

	it('is refused once the subject leaves the allowlist', async () => {
		const cap = capFor();
		const response = await serve(setup({ env: { ...ENV, OSIONOS_IDE_ALLOWED_SUBJECTS: '99999999-9999-4999-8999-999999999999' } }), `/p/${cap}/`);
		assert.equal(response.statusCode, 403);
		assertPreviewShape(response);
	});
});

describe('in-flight limit per user', () => {
	it('answers 429 on the 9th concurrent request and recovers when they settle', async () => {
		const gate = [];
		const handler = setup({ upstream: () => new Promise((resolve) => gate.push(resolve)) });
		const cap = capFor();
		const held = Array.from({ length: 8 }, () => serve(handler, `/p/${cap}/`));
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(gate.length, 8);
		const ninth = await serve(handler, `/p/${cap}/`);
		assert.equal(ninth.statusCode, 429);
		assertPreviewShape(ninth);
		for (const release of gate) release(okAnswer());
		await Promise.all(held);
		const next = serve(setup({ upstream: async () => okAnswer() }), `/p/${cap}/`);
		assert.equal((await next).statusCode, 200);
	});

	it('releases the slot when the upstream throws', async () => {
		const handler = setup({ upstream: async () => { throw new Error('boom'); } });
		const cap = capFor();
		for (let i = 0; i < 10; i += 1) assert.equal((await serve(handler, `/p/${cap}/`)).statusCode, 502);
	});
});

describe('ide server routing', () => {
	const serverEnv = { ...ENV, OSIONOS_IDE_ALLOWED_ORIGIN: 'https://app.example' };
	async function withServer(run) {
		const server = createIdeServer({ env: serverEnv, upstream: async () => okAnswer() });
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		try { return await run(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); server.closeAllConnections(); }
	}

	it('serves /p/ to an opaque origin but keeps the origin check on the mint route', async () => {
		await withServer(async (base) => {
			const preview = await fetch(`${base}/p/${capFor()}/`, { headers: { origin: 'null' } });
			assert.equal(preview.status, 200);
			assert.equal(preview.headers.get('cross-origin-resource-policy'), 'cross-origin');
			assert.equal(preview.headers.get('set-cookie'), null);
			const token = signIdeToken({ userId: USER, workspaceId: WS, secret: SECRET }).token;
			const mintCall = await fetch(`${base}/api/ide/preview/session`, {
				method: 'POST', headers: { origin: 'https://other.example', authorization: `Bearer ${token}` }, body: JSON.stringify({ workspaceId: WS, port: 3000 }),
			});
			assert.equal(mintCall.status, 403);
		});
	});
});
