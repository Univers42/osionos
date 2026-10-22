/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-media-serve-hygiene.test.mjs                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Devil C76 (2026-10-21). The app rewrites /api/* to the bridge, so a stored
// object is served on the app's own origin, and the page-media capability URL
// opens without a session. Before this fix a `text/html` or SVG upload came back
// with its declared type and no nosniff or CSP: one upload and one click ran
// script as the victim. Page media, chat uploads and collab seeds all write
// through storagePut into one bucket, so the refusal is tested there.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { configFromEnv, createBridgeServer, createUserSession, validateBridgePayload } from '../../scripts/bridge-api.mjs';
import { storagePut } from '../../scripts/bridge-storage-core.mjs';
import { handleServe } from '../../scripts/bridge-chat-media.mjs';
import { pngFixture } from './support/image-fixtures.mjs';

const owner = '3f6d2a70-5b3f-4c92-8f06-8f4644fd1209';
const SHA = 'a'.repeat(64);
const SANDBOX = /(^|;)\s*sandbox(\s|;|$)/;
const PAGE_TYPES = ['text/html', 'Text/HTML; charset=utf-8', 'image/svg+xml', 'application/xhtml+xml'];

function testConfig() {
	return configFromEnv({
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_BRIDGE_SHARED_SECRET: 'test-bridge-secret-that-is-long-enough',
		OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
		OSIONOS_BRIDGE_PERSISTENCE: 'memory',
	});
}

function token(config) {
	const payload = validateBridgePayload({
		provider: 'prismatica', subject: owner, email: 'owner@example.com', name: 'Owner',
		jti: '5b0e8f9e-3f43-4f6f-9a43-0f3f3c5d7a11',
	});
	return createUserSession(payload, config, {
		workspaceId: '1cc0693b-59dd-4d51-86d9-de86d088f9df', workspaceName: 'Owner', workspaceSlug: 'owner-3f6d2a70',
	}, Date.now()).session.accessToken;
}

/** The storage router, in memory; `puts` counts the writes that reached it. */
function fakeStorage(objects) {
	const fake = async (input, init = {}) => {
		const method = (init.method || 'GET').toUpperCase();
		if (String(input).includes('/bucket/')) return new Response('{"created":false}', { status: 200 });
		const key = `${init.headers?.['x-user-id']}/${decodeURIComponent(/\/object\/[^/]+\/(.+)$/.exec(new URL(String(input)).pathname)[1])}`;
		if (method === 'PUT') {
			fake.puts += 1;
			objects.set(key, { body: Buffer.from(init.body), contentType: init.headers?.['content-type'] });
			return new Response('{"ok":true}', { status: 200 });
		}
		const stored = objects.get(key);
		return stored
			? new Response(stored.body, { status: 200, headers: { 'content-type': stored.contentType } })
			: new Response('missing', { status: 404 });
	};
	fake.puts = 0;
	return fake;
}

async function listen(server) {
	await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
	return `http://127.0.0.1:${server.address().port}`;
}

function assertSandboxed(headers) {
	assert.equal(headers.get('x-content-type-options'), 'nosniff');
	const csp = headers.get('content-security-policy') ?? '';
	assert.match(csp, SANDBOX, csp);
	assert.match(csp, /default-src 'none'/, csp);
}

describe('stored media cannot run as a page on the app origin', () => {
	const objects = new Map();
	const storage = fakeStorage(objects);
	const config = testConfig();
	const server = createBridgeServer({ config, fetchImpl: storage });
	let base;
	after(() => server.close());

	for (const type of PAGE_TYPES) {
		it(`refuses a "${type}" page-media upload before storage`, async () => {
			base ??= await listen(server);
			const before = storage.puts;
			const res = await fetch(`${base}/api/media/uploads?name=x`, {
				method: 'POST',
				headers: { 'content-type': type, authorization: `Bearer ${token(config)}` },
				body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
			});
			assert.equal(res.status, 415, await res.text());
			assert.equal(storage.puts, before, 'no byte reached storage');
		});
	}

	it('the shared writer refuses page types for every caller (chat, collab)', async () => {
		let calls = 0;
		const count = async () => { calls += 1; return new Response('{}'); };
		for (const type of PAGE_TYPES) {
			await assert.rejects(storagePut(owner, `${SHA}.html`, type, Buffer.from('x'), count, {}), { status: 415 });
		}
		assert.equal(calls, 0);
	});

	it('a page type stored before the fix downloads as an opaque attachment', async () => {
		base ??= await listen(server);
		objects.set(`${owner}/${SHA}.html`, { body: Buffer.from('<script>alert(1)</script>'), contentType: 'text/html' });
		const res = await fetch(`${base}/api/media/uploads/${owner}/${SHA}.html`);
		assert.equal(res.status, 200);
		assert.equal(res.headers.get('content-type'), 'application/octet-stream');
		assert.match(res.headers.get('content-disposition') ?? '', /^attachment/);
		assertSandboxed(res.headers);
	});

	it('an SVG stored before the fix still renders in <img>, sandboxed', async () => {
		base ??= await listen(server);
		objects.set(`${owner}/${SHA}.svg`, { body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), contentType: 'image/svg+xml' });
		const res = await fetch(`${base}/api/media/uploads/${owner}/${SHA}.svg`);
		assert.equal(res.headers.get('content-type'), 'image/svg+xml');
		assert.equal(res.headers.get('content-disposition'), null);
		assertSandboxed(res.headers);
	});

	it('an image upload serves inline with its type, sandboxed', async () => {
		base ??= await listen(server);
		const upload = await fetch(`${base}/api/media/uploads?name=p.png`, {
			method: 'POST',
			headers: { 'content-type': 'image/png', authorization: `Bearer ${token(config)}` },
			body: pngFixture({ width: 2, height: 2 }),
		});
		assert.equal(upload.status, 201);
		const res = await fetch(`${base}${(await upload.json()).media.url}`);
		assert.equal(res.headers.get('content-type'), 'image/png');
		assert.equal(res.headers.get('content-disposition'), null);
		assertSandboxed(res.headers);
	});

	it('a chat attachment serves with the same headers', async () => {
		const chatObjects = new Map([[`${owner}/${SHA}.html`, { body: Buffer.from('<script>1</script>'), contentType: 'text/html' }]]);
		const chatStorage = fakeStorage(chatObjects);
		const row = { id: 'att-1', channel_id: 'c-1', owner_id: owner, object_key: `${SHA}.html`, sha256: SHA, type: 'file', content_type: 'text/html' };
		const fetchImpl = async (input, init) => (String(input).includes('/rest/v1/osionos_message_attachments')
			? new Response(JSON.stringify([row]), { status: 200, headers: { 'content-type': 'application/json' } })
			: chatStorage(input, init));
		const written = {};
		const response = { writeHead: (status, headers) => Object.assign(written, { status, headers }), end: () => {} };
		await handleServe({ fetchImpl, env: {} }, { userId: owner }, 'att-1', { headers: {} }, response,
			{ baasUrl: 'http://baas.test', serviceKey: 'k', allowedOrigin: 'http://localhost:3001' }, async () => ({}));
		assert.equal(written.status, 200);
		assert.equal(written.headers['content-type'], 'application/octet-stream');
		assert.match(written.headers['content-disposition'] ?? '', /^attachment/);
		assert.equal(written.headers['x-content-type-options'], 'nosniff');
		assert.match(written.headers['content-security-policy'] ?? '', SANDBOX);
	});
});
