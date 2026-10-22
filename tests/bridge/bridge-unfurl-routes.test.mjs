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

// The embed route over the unfurler (auth, the unfurl:<userId> bucket), and the
// bridge's wiring of it and of the automation webhook. The chat link preview
// stays on bridge-url-guard (bridge-link-preview-ssrf.test.mjs).

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

describe('unfurl:<userId> bucket', () => {
	it('a rate-limited call makes no outbound request', async () => {
		const unfurler = stubUnfurler();
		const post = await serve([createEmbedHandler({ config, verifySession, unfurler })]);
		for (let n = 0; n < 25; n += 1) await post('/api/embed/resolve', 'bucket-c');
		assert.equal(unfurler.calls.length, 20);
		assert.equal((await post('/api/embed/resolve', 'bucket-other-user')).status, 200, 'buckets are per user');
	});
});

describe('POST /api/chat/link-preview', () => {
	// Credentials in the URL are not refused here, unlike /api/embed/resolve: this guard
	// is also the webhooks', where `https://user:token@host/` is how basic auth is given.
	it('refuses private targets with 422 through the real default guard', async () => {
		const post = await serve([createChatHandler({ config, verifySession })]);
		for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/latest/', 'http://[::ffff:7f00:1]/']) {
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

	it('charges every webhook to a webhook:<userId> bucket (burst 10), then answers 429', async () => {
		const sessionFor = (subject) => createUserSession(validateBridgePayload({
			provider: 'prismatica',
			subject,
			email: 'burst@example.com',
			name: 'Burst',
			jti: '2c76c7f0-f07e-442d-96fd-77d601764c3b',
		}), bridgeConfig, { workspaceId: '1cc0693b-59dd-4d51-86d9-de86d088f9df', workspaceName: 'W', workspaceSlug: 'w' }, Date.now()).session.accessToken;
		const send = async (jwt) => {
			base ??= await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
			return (await fetch(`${base}/api/automations/webhook`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
				body: JSON.stringify({ url: 'https://127.0.0.1/hook', payload: {} }),
			})).status;
		};
		const burster = sessionFor('4f6d2a70-5b3f-4c92-8f06-8f4644fd1209');
		const statuses = [];
		for (let n = 0; n < 12; n += 1) statuses.push(await send(burster));
		assert.deepEqual(statuses, [...Array(10).fill(422), 429, 429]);
		assert.equal(await send(sessionFor('5f6d2a70-5b3f-4c92-8f06-8f4644fd1209')), 422);
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
