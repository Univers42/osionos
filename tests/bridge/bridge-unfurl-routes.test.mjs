/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-unfurl-routes.test.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Routes that reach the unfurler: auth, the shared rate bucket, the chat
// link-preview response shape, and the automation webhook.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import {
	configFromEnv,
	createBridgeServer,
	createUserSession,
	validateBridgePayload,
} from '../../scripts/bridge-api.mjs';
import { createChatHandler } from '../../scripts/bridge-chat.mjs';
import { createEmbedHandler } from '../../scripts/bridge-embed.mjs';
import { httpError } from '../../scripts/bridge-social-core.mjs';
import { createUnfurler } from '../../scripts/bridge-unfurl-core.mjs';
import { html, loopbackNet, sendHtml, startServer } from './bridge-unfurl-helpers.mjs';

const config = { allowedOrigin: 'http://localhost:3001' };
const verifySession = (token) => {
	if (!token.startsWith('user:')) throw httpError('Invalid app session.', 401);
	return { userId: token.slice(5) };
};

function stubUnfurler() {
	const calls = [];
	return { calls, resolve: async (url) => { calls.push(url); return { url }; } };
}

async function serve(handlers) {
	const server = http.createServer(async (request, response) => {
		const url = new URL(request.url, 'http://localhost');
		for (const handler of handlers) if (await handler(url, request, response, config)) return;
		response.writeHead(404).end();
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	after(() => server.close());
	const base = `http://127.0.0.1:${server.address().port}`;
	return (path, userId, body, authorization = userId ? `Bearer user:${userId}` : undefined) => fetch(`${base}${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
		body: JSON.stringify(body ?? { url: 'https://example.com/' }),
	});
}

describe('POST /api/embed/resolve', () => {
	it('answers 401 without a session and never calls the unfurler', async () => {
		const unfurler = stubUnfurler();
		const post = await serve([createEmbedHandler({ config, verifySession, unfurler })]);
		assert.equal((await post('/api/embed/resolve', null)).status, 401);
		assert.equal((await post('/api/embed/resolve', null, undefined, 'Bearer forged-token')).status, 401);
		assert.deepEqual(unfurler.calls, []);
	});

	it('returns {ok, embed} for a session and rejects non-string urls', async () => {
		const unfurler = stubUnfurler();
		const post = await serve([createEmbedHandler({ config, verifySession, unfurler })]);
		const ok = await post('/api/embed/resolve', 'route-ok', { url: 'https://example.com/a' });
		assert.deepEqual(await ok.json(), { ok: true, embed: { url: 'https://example.com/a' } });
		await post('/api/embed/resolve', 'route-ok', { url: 42 });
		assert.deepEqual(unfurler.calls, ['https://example.com/a', '']);
	});

	it('does not echo unexpected error text', async () => {
		const unfurler = { resolve: async () => { throw new Error('connect ECONNREFUSED 10.0.0.9:80'); } };
		const post = await serve([createEmbedHandler({ config, verifySession, unfurler })]);
		const reply = await post('/api/embed/resolve', 'route-err');
		assert.equal(reply.status, 500);
		assert.deepEqual(await reply.json(), { ok: false, message: 'Embed request failed.' });
	});

	it('ignores other paths', async () => {
		const post = await serve([createEmbedHandler({ config, verifySession, unfurler: stubUnfurler() })]);
		assert.equal((await post('/api/embed/other', 'route-other')).status, 404);
	});
});

describe('shared unfurl:<userId> bucket', () => {
	async function both() {
		const unfurler = { resolve: async (url) => ({ url, title: 't', description: 'd', image: null }) };
		return serve([createEmbedHandler({ config, verifySession, unfurler }), createChatHandler({ config, verifySession, unfurler })]);
	}

	it('429 after the burst on BOTH routes, whichever spent the tokens', async () => {
		const post = await both();
		for (let n = 0; n < 12; n += 1) assert.equal((await post('/api/embed/resolve', 'bucket-a')).status, 200);
		for (let n = 0; n < 8; n += 1) assert.equal((await post('/api/chat/link-preview', 'bucket-a')).status, 200);
		assert.equal((await post('/api/embed/resolve', 'bucket-a')).status, 429);
		assert.equal((await post('/api/chat/link-preview', 'bucket-a')).status, 429);
		assert.equal((await post('/api/embed/resolve', 'bucket-other-user')).status, 200, 'buckets are per user');
	});

	it('chat spending alone also exhausts the embed route', async () => {
		const post = await both();
		for (let n = 0; n < 20; n += 1) assert.equal((await post('/api/chat/link-preview', 'bucket-b')).status, 200);
		assert.equal((await post('/api/embed/resolve', 'bucket-b')).status, 429);
	});

	it('a rate-limited call makes no outbound request', async () => {
		const unfurler = stubUnfurler();
		const post = await serve([createEmbedHandler({ config, verifySession, unfurler })]);
		for (let n = 0; n < 25; n += 1) await post('/api/embed/resolve', 'bucket-c');
		assert.equal(unfurler.calls.length, 20);
	});
});

describe('POST /api/chat/link-preview', () => {
	it('keeps the {ok, preview:{title,description,image,url}} body byte for byte', async () => {
		const target = await startServer((_request, response) => sendHtml(response, html('', `
			<title>Ignored when og:title exists</title>
			<meta property="og:title" content="Hello world">
			<meta property="og:description" content="A short description.">
			<meta property="og:image" content="https://cdn.example.com/cover.png">`)));
		after(target.close);
		const net = loopbackNet({ ports: [target.port], names: { 'public.test': ['127.0.0.1'] } });
		const post = await serve([createChatHandler({ config, verifySession, unfurler: createUnfurler({ netOptions: net.options }) })]);
		const reply = await post('/api/chat/link-preview', 'snapshot-user', { url: `http://public.test:${target.port}/page` });
		assert.equal(reply.status, 200);
		assert.equal(
			await reply.text(),
			`{"ok":true,"preview":{"title":"Hello world","description":"A short description.","image":"https://cdn.example.com/cover.png","url":"http://public.test:${target.port}/page"}}`,
		);
	});

	it('falls back to <title> and an empty image string like before', async () => {
		const target = await startServer((_request, response) => sendHtml(response, html('', '<title>Only a title</title>')));
		after(target.close);
		const net = loopbackNet({ ports: [target.port], names: { 'public.test': ['127.0.0.1'] } });
		const post = await serve([createChatHandler({ config, verifySession, unfurler: createUnfurler({ netOptions: net.options }) })]);
		const reply = await post('/api/chat/link-preview', 'snapshot-user-2', { url: `http://public.test:${target.port}/` });
		assert.deepEqual((await reply.json()).preview, { title: 'Only a title', description: '', image: '', url: `http://public.test:${target.port}/` });
	});

	it('refuses private targets with 422 through the real default guard', async () => {
		const post = await serve([createChatHandler({ config, verifySession })]);
		for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/latest/', 'http://[::ffff:7f00:1]/', 'http://user:pw@example.com/']) {
			assert.equal((await post('/api/chat/link-preview', 'snapshot-user-3', { url })).status, 422, url);
		}
	});
});

describe('wiring in createBridgeServer', () => {
	const bridgeConfig = configFromEnv({
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_BRIDGE_SHARED_SECRET: 'test-bridge-secret-that-is-long-enough',
		OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
		OSIONOS_BRIDGE_PERSISTENCE: 'memory',
	});
	const token = createUserSession(validateBridgePayload({
		provider: 'prismatica',
		subject: '3f6d2a70-5b3f-4c92-8f06-8f4644fd1209',
		email: 'Owner@example.com',
		name: 'Owner',
		jti: '1c76c7f0-f07e-442d-96fd-77d601764c3b',
	}), bridgeConfig, { workspaceId: '1cc0693b-59dd-4d51-86d9-de86d088f9df', workspaceName: 'W', workspaceSlug: 'w' }, Date.now()).session.accessToken;
	const server = createBridgeServer({ config: bridgeConfig });
	let base;
	after(() => server.close());

	async function post(path, body, authorized = true) {
		base ??= await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
		return fetch(`${base}${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...(authorized ? { authorization: `Bearer ${token}` } : {}) },
			body: JSON.stringify(body),
		});
	}

	it('serves /api/embed/resolve: 401 without a session, 422 for a private target', async () => {
		assert.equal((await post('/api/embed/resolve', { url: 'https://example.com/' }, false)).status, 401);
		const refused = await post('/api/embed/resolve', { url: 'http://169.254.169.254/' });
		assert.equal(refused.status, 422);
		assert.deepEqual(await refused.json(), { ok: false, message: 'This address is not allowed.' });
	});

	it('guards the automation webhook: https only, no private targets, session required', async () => {
		assert.equal((await post('/api/automations/webhook', { url: 'https://example.com/' }, false)).status, 401);
		assert.equal((await post('/api/automations/webhook', { url: 'http://example.com/hook' })).status, 422);
		assert.equal((await post('/api/automations/webhook', { url: 'not a url' })).status, 422);
		for (const url of ['https://127.0.0.1/hook', 'https://[::1]/hook', 'https://169.254.169.254/', 'https://localhost/']) {
			assert.equal((await post('/api/automations/webhook', { url, payload: {} })).status, 422, url);
		}
	});
});

describe('webhook delivery (unfurler.postJson)', () => {
	it('POSTs the JSON, returns the status and never follows a redirect', async () => {
		const sink = await startServer((_request, response) => response.end('sink'));
		after(sink.close);
		let received = '';
		const target = await startServer((request, response) => {
			request.on('data', (chunk) => { received += chunk; });
			request.on('end', () => {
				response.writeHead(302, { location: `http://public.test:${sink.port}/hit` });
				response.end();
			});
		});
		after(target.close);
		const net = loopbackNet({ ports: [target.port, sink.port], names: { 'public.test': ['127.0.0.1'] } });
		const status = await createUnfurler({ netOptions: net.options }).postJson(`http://public.test:${target.port}/hook`, { a: 1 });
		assert.equal(status, 302);
		assert.equal(received, '{"a":1}');
		assert.equal(target.seen.requests[0].headers['content-type'], 'application/json');
		assert.equal(sink.seen.connections, 0);
	});

	it('refuses a webhook host that resolves to a private address without connecting', async () => {
		const net = loopbackNet({ ports: [443], names: { 'internal.test': ['10.0.0.1'] } });
		await assert.rejects(createUnfurler({ netOptions: net.options }).postJson('https://internal.test/hook', {}), (error) => error.status === 422);
		assert.deepEqual(net.attempts, []);
	});
});
