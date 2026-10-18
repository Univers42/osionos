/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-realtime-token.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

import { createRealtimeTokenHandler } from '../../scripts/bridge-realtime-token.mjs';
import { mintRealtimeToken } from '../../scripts/bridge-collab.mjs';

const SECRET = 'unit-test-jwt-secret';
const WORKSPACE = 'c0c0c0c0-3333-4333-8333-c0c0c0c0c0c0';
const OPEN_CHANNEL = 'a1a1a1a1-1111-4111-8111-a1a1a1a1a1a1';
const PRIVATE_CHANNEL = 'a2a2a2a2-1111-4111-8111-a2a2a2a2a2a2';
const NOTIFY_TOKEN = 'own-unguessable-notify-token';

const CHANNELS = {
	[OPEN_CHANNEL]: { id: OPEN_CHANNEL, workspace_id: WORKSPACE, kind: 'text', is_private: false },
	[PRIVATE_CHANNEL]: { id: PRIVATE_CHANNEL, workspace_id: WORKSPACE, kind: 'text', is_private: true },
};

function decodeVerified(token) {
	const [header, payload, signature] = String(token).split('.');
	assert.equal(signature, createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url'));
	return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

// Every caller is a workspace member; nobody is a member of the private channel.
function fakeBaas(userId) {
	return async (urlString) => {
		const url = String(urlString);
		let rows = [];
		const channelId = /osionos_channels\?id=eq\.([0-9a-f-]+)/.exec(url)?.[1];
		if (channelId) rows = [CHANNELS[channelId]].filter(Boolean);
		else if (url.includes('osionos_workspace_members')) rows = [{ user_id: userId, role: 'member' }];
		else if (url.includes('osionos_bridge_identities')) rows = [{ notify_token: NOTIFY_TOKEN }];
		return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
	};
}

// A fresh user per test: the rate-limit buckets are module-level and keyed by user.
async function withHandler(run) {
	const userId = randomUUID();
	const handler = createRealtimeTokenHandler({
		config: { allowedOrigin: '*', baasUrl: 'http://baas', serviceKey: 'service-key' },
		verifySession: () => ({ userId }),
		fetchImpl: fakeBaas(userId),
		env: { JWT_SECRET: SECRET },
	});
	const server = createServer(async (request, response) => {
		if (!await handler(new URL(request.url, 'http://h'), request, response)) response.writeHead(404).end();
	});
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	const ask = async (body, path = '/api/realtime/token') => {
		const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
			method: 'POST', headers: { authorization: 'Bearer app-session', 'content-type': 'application/json' }, body: JSON.stringify(body),
		});
		const text = await response.text();
		return { status: response.status, body: text ? JSON.parse(text) : null };
	};
	try {
		return await run(ask, userId);
	} finally {
		await new Promise((done) => server.close(done));
	}
}

describe('POST /api/realtime/token', () => {
	it('mints a subscribe-only, 900 s token for an accessible channel', async () => {
		await withHandler(async (ask, userId) => {
			const { status, body } = await ask({ kind: 'chat', channelId: OPEN_CHANNEL });
			assert.equal(status, 200);
			const topic = `chat:${WORKSPACE}:${OPEN_CHANNEL}`;
			assert.equal(body.topic, topic);
			const claims = decodeVerified(body.token);
			assert.deepEqual(claims.namespaces, [topic]);
			assert.equal(claims.can_subscribe, true);
			assert.equal(claims.can_publish, false);
			assert.equal(claims.exp - claims.iat, 900);
			assert.equal(claims.sub, userId);
		});
	});

	it('refuses a private channel the caller is not in', async () => {
		await withHandler(async (ask) => {
			const { status, body } = await ask({ kind: 'chat', channelId: PRIVATE_CHANNEL });
			assert.equal(status, 403);
			assert.equal(body.token, undefined);
		});
	});

	it('grants the caller their own user topic and their own notify-token topic', async () => {
		await withHandler(async (ask, userId) => {
			const own = await ask({ kind: 'user' });
			assert.equal(own.body.topic, `user:${userId}`);
			assert.deepEqual(decodeVerified(own.body.token).namespaces, [`user:${userId}`]);
			const inbox = await ask({ kind: 'user', subject: NOTIFY_TOKEN });
			assert.equal(inbox.status, 200);
			assert.equal(inbox.body.topic, `user:${NOTIFY_TOKEN}`);
		});
	});

	it('refuses someone else’s user topic', async () => {
		await withHandler(async (ask) => {
			for (const subject of [randomUUID(), 'someone-elses-notify-token', '*']) {
				assert.equal((await ask({ kind: 'user', subject })).status, 403, subject);
			}
		});
	});

	it('refuses every other kind, raw topic and wildcard', async () => {
		await withHandler(async (ask) => {
			const attempts = [
				{ kind: 'feed', workspaceId: WORKSPACE }, { kind: 'presence', workspaceId: WORKSPACE },
				{ kind: 'collab', spaceId: WORKSPACE }, { kind: 'table', id: 'x' },
				{ kind: 'topic', topic: 'chat:*' }, { topic: `chat:${WORKSPACE}:${OPEN_CHANNEL}` },
				{ kind: 'chat', channelId: '*' }, { kind: 'chat', channelId: `${OPEN_CHANNEL}/x` }, { kind: 'chat' }, {},
			];
			for (const attempt of attempts) {
				const { status, body } = await ask(attempt);
				assert.equal(status, 403, JSON.stringify(attempt));
				assert.equal(body.token, undefined);
			}
		});
	});

	it('rate-limits one user', async () => {
		await withHandler(async (ask) => {
			const statuses = [];
			for (let i = 0; i < 62; i += 1) statuses.push((await ask({ kind: 'user' })).status);
			assert.equal(statuses[0], 200);
			assert.equal(statuses.at(-1), 429);
		});
	});

	it('ignores other paths', async () => {
		await withHandler(async (ask) => {
			assert.equal((await ask({}, '/api/other')).status, 404);
		});
	});
});

describe('mintRealtimeToken canPublish', () => {
	it('keeps collab tokens publish-capable by default', () => {
		const claims = decodeVerified(mintRealtimeToken({ secret: SECRET, userId: 'U', namespaces: ['collab:A'] }).token);
		assert.equal(claims.can_publish, true);
	});

	it('mints a subscribe-only token on request and honours a 900 s ttl', () => {
		const claims = decodeVerified(mintRealtimeToken({ secret: SECRET, userId: 'U', namespaces: ['t'], ttlSeconds: 900, canPublish: false }).token);
		assert.equal(claims.can_publish, false);
		assert.equal(claims.exp - claims.iat, 900);
	});
});
