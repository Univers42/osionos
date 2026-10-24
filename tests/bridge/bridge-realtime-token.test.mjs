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
import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const SECRET = 'unit-test-jwt-secret';
const WORKSPACE = 'c0c0c0c0-3333-4333-8333-c0c0c0c0c0c0';
const OPEN_CHANNEL = 'a1a1a1a1-1111-4111-8111-a1a1a1a1a1a1';
const PRIVATE_CHANNEL = 'a2a2a2a2-1111-4111-8111-a2a2a2a2a2a2';
const NOTIFY_TOKEN = 'own-unguessable-notify-token';
// A live database mounted in the workspace above, and one nobody mounts.
const MOUNTED_DB = 'b1b1b1b1-1111-4111-8111-b1b1b1b1b1b1';
const UNMOUNTED_DB = 'b2b2b2b2-2222-4222-8222-b2b2b2b2b2b2';
const MOUNTS = [{ workspace_id: WORKSPACE, db_id: MOUNTED_DB }];

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
function fakeBaas(userId, { member = true, mounts = MOUNTS } = {}) {
	return async (urlString) => {
		const url = String(urlString);
		let rows = [];
		const channelId = /osionos_channels\?id=eq\.([0-9a-f-]+)/.exec(url)?.[1];
		if (channelId) rows = [CHANNELS[channelId]].filter(Boolean);
		else if (url.includes('osionos_workspace_members')) {
			rows = member ? [{ user_id: userId, workspace_id: WORKSPACE, role: 'member' }] : [];
		} else if (url.includes('osionos_bridge_identities')) rows = [{ notify_token: NOTIFY_TOKEN }];
		else if (url.includes('osionos_workspace_databases')) rows = mounts;
		return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
	};
}

async function baasRows(fetchImpl, path) {
	const response = await fetchImpl(`http://baas/rest/v1/${path}`);
	return JSON.parse(await response.text());
}

/**
 * The mount check the token module is given, built the way bridge-api.mjs builds
 * it: the session's own workspaces ∪ the workspaces the user is a member of,
 * then the dbId must be one of those workspaces' mounts.
 */
function mountAccessFor(fetchImpl) {
	return async (session, dbId) => {
		const memberRows = await baasRows(fetchImpl, `osionos_workspace_members?user_id=eq.${session.userId}&select=workspace_id`);
		const memberIds = (Array.isArray(memberRows) ? memberRows : []).map((row) => String(row.workspace_id ?? '')).filter(Boolean);
		const accessible = [...new Set([...(session.workspaceIds ?? []), ...memberIds])];
		if (accessible.length === 0) return false;
		const mounts = await baasRows(fetchImpl, `osionos_workspace_databases?workspace_id=in.(${accessible.join(',')})&select=workspace_id,db_id`);
		return (Array.isArray(mounts) ? mounts : []).some((row) => row && row.db_id === dbId);
	};
}

// A fresh user per test: the rate-limit buckets are module-level and keyed by user.
async function withHandler(run, options = {}) {
	const userId = randomUUID();
	const fetchImpl = fakeBaas(userId, options);
	const handler = createRealtimeTokenHandler({
		config: { allowedOrigin: '*', baasUrl: 'http://baas', serviceKey: 'service-key' },
		verifySession: () => ({ userId, workspaceIds: options.workspaceIds ?? [WORKSPACE] }),
		fetchImpl,
		env: { JWT_SECRET: SECRET },
		mountAccess: mountAccessFor(fetchImpl),
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

	it('grants a live database mounted in a workspace the caller belongs to', async () => {
		await withHandler(async (ask, userId) => {
			const { status, body } = await ask({ kind: 'table', dbId: MOUNTED_DB, table: 'transactions' });
			assert.equal(status, 200);
			const topic = `table:${MOUNTED_DB}:transactions`;
			assert.equal(body.topic, topic);
			const claims = decodeVerified(body.token);
			assert.deepEqual(claims.namespaces, [topic]);
			assert.equal(claims.can_subscribe, true);
			assert.equal(claims.can_publish, false);
			assert.equal(claims.sub, userId);
		});
	});

	it('refuses a live database no workspace of the caller mounts', async () => {
		await withHandler(async (ask) => {
			const { status, body } = await ask({ kind: 'table', dbId: UNMOUNTED_DB, table: 'transactions' });
			assert.equal(status, 403);
			assert.equal(body.token, undefined);
		});
	});

	it('refuses a live database for a caller who is no member of any workspace', async () => {
		await withHandler(async (ask) => {
			const { status, body } = await ask({ kind: 'table', dbId: MOUNTED_DB, table: 'transactions' });
			assert.equal(status, 403);
			assert.equal(body.token, undefined);
		}, { member: false, workspaceIds: [] });
	});

	it('refuses a bad table name and a non-UUID database id', async () => {
		await withHandler(async (ask) => {
			for (const attempt of [
				{ kind: 'table', dbId: MOUNTED_DB, table: '../x' },
				{ kind: 'table', dbId: MOUNTED_DB, table: 'a/b' },
				{ kind: 'table', dbId: MOUNTED_DB, table: '' },
				{ kind: 'table', dbId: 'not-a-uuid', table: 'transactions' },
				{ kind: 'table', table: 'transactions' },
			]) {
				const { status, body } = await ask(attempt);
				assert.equal(status, 403, JSON.stringify(attempt));
				assert.equal(body.token, undefined);
			}
		});
	});

	it('grants the caller their own object database and never another user\'s', async () => {
		await withHandler(async (ask, userId) => {
			const other = randomUUID();
			for (const attempt of [{ kind: 'objectdb' }, { kind: 'objectdb', subject: other }, { kind: 'objectdb', ownerId: other }]) {
				const { status, body } = await ask(attempt);
				assert.equal(status, 200, JSON.stringify(attempt));
				assert.equal(body.topic, `objectdb:${userId}`);
				const claims = decodeVerified(body.token);
				assert.deepEqual(claims.namespaces, [`objectdb:${userId}`]);
				assert.equal(claims.can_publish, false);
				assert.ok(!body.topic.includes(other));
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

describe('POST /api/realtime/token through the real bridge', () => {
	const config = harnessConfig();

	it('grants a mounted live database to a member and refuses an outsider', async () => {
		const previous = process.env.JWT_SECRET;
		process.env.JWT_SECRET = SECRET; // the bridge signs the realtime token with it
		try {
			const mock = createPostgrestMock({
				osionos_workspace_members: [{ user_id: IDS.userB, workspace_id: IDS.team, role: 'editor', permissions: ['read', 'update'] }],
				osionos_workspace_databases: [{ workspace_id: IDS.team, db_id: MOUNTED_DB }],
			}, { realWorkspaceRpc: true });
			await withBridge(config, mock.fetchImpl, async (base) => {
				const member = sessionHeaders(config, IDS.userB, IDS.homeB, [IDS.team]);
				const granted = await send(base, '/api/realtime/token', member, post({ kind: 'table', dbId: MOUNTED_DB, table: 'transactions' }));
				assert.equal(granted.status, 200, granted.text);
				assert.equal(granted.body.topic, `table:${MOUNTED_DB}:transactions`);
				const claims = decodeVerified(granted.body.token);
				assert.deepEqual(claims.namespaces, [`table:${MOUNTED_DB}:transactions`]);
				assert.equal(claims.can_publish, false);

				const outsider = await send(base, '/api/realtime/token', sessionHeaders(config, IDS.userA, IDS.homeA), post({ kind: 'table', dbId: MOUNTED_DB, table: 'transactions' }));
				assert.equal(outsider.status, 403, outsider.text);
				assert.equal(outsider.body.token, undefined);
			});
		} finally {
			if (previous === undefined) delete process.env.JWT_SECRET;
			else process.env.JWT_SECRET = previous;
		}
	});

	for (const [label, member, expected] of [
		['a membership without read permission', { role: 'viewer', permissions: [] }, 403],
		['a read-only membership', { role: 'viewer', permissions: ['read'] }, 200],
	]) {
		it(`uses database read permission for ${label}`, async () => {
			const previous = process.env.JWT_SECRET;
			process.env.JWT_SECRET = SECRET;
			try {
				const mock = createPostgrestMock({
					osionos_workspace_members: [{ user_id: IDS.userB, workspace_id: IDS.team, ...member }],
					osionos_workspace_databases: [{ workspace_id: IDS.team, db_id: MOUNTED_DB }],
				}, { realWorkspaceRpc: true });
				await withBridge(config, mock.fetchImpl, async (base) => {
					const headers = sessionHeaders(config, IDS.userB, IDS.homeB, [IDS.team]);
					const result = await send(base, '/api/realtime/token', headers, post({ kind: 'table', dbId: MOUNTED_DB, table: 'transactions' }));
					assert.equal(result.status, expected, result.text);
					if (expected === 403) assert.equal(result.body.token, undefined);
					else assert.deepEqual(decodeVerified(result.body.token).namespaces, [`table:${MOUNTED_DB}:transactions`]);
				});
			} finally {
				if (previous === undefined) delete process.env.JWT_SECRET;
				else process.env.JWT_SECRET = previous;
			}
		});
	}

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
