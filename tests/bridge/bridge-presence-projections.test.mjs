/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-presence-projections.test.mjs               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Every surface that shows "online" reads the key/value store, and the window that decides
// it lives in one file.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { createProfileHandler } from '../../scripts/bridge-profile.mjs';
import { presenceKey } from '../../scripts/bridge-presence.mjs';
import { createSocialStub, getConnections, uid } from './support/social-postgrest.mjs';

const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts');
const config = harnessConfig();
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);
const PEER = IDS.userA;

/** A store that says the peer is online. */
function onlineKv(who = PEER) {
	const kv = kvStub();
	kv.values.set(`osb:${presenceKey(who)}`, String(Date.now()));
	return kv;
}

describe('the profile card', () => {
	it('shows the peer online when the store says so', async () => {
		const world = {
			osionos_bridge_identities: [{
				user_id: PEER, display_name: 'Alice', username: 'alice', directory_opt_out: false,
				profile: {}, created_at: '2026-10-01T00:00:00.000Z', last_seen_at: '2020-01-01T00:00:00.000Z',
			}],
			osionos_workspace_members: [{ workspace_id: IDS.team, user_id: PEER, role: 'owner' }],
		};
		const mock = createPostgrestMock(world, {
			failWhen: (call) => (call.table === 'osionos_user_blocks' ? { status: 200, body: [] } : null),
		});
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, `/api/profile/${PEER}`, asB);
			assert.equal(answer.status, 200, answer.text);
			assert.equal(answer.body.online, true);
		}, { kv: onlineKv() });
	});

	it('shows the peer offline when the store has no beat', async () => {
		const world = {
			osionos_bridge_identities: [{
				user_id: PEER, display_name: 'Alice', username: 'alice', directory_opt_out: false,
				profile: {}, created_at: '2026-10-01T00:00:00.000Z', last_seen_at: new Date().toISOString(),
			}],
			osionos_workspace_members: [{ workspace_id: IDS.team, user_id: PEER, role: 'owner' }],
		};
		const mock = createPostgrestMock(world, {
			failWhen: (call) => (call.table === 'osionos_user_blocks' ? { status: 200, body: [] } : null),
		});
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, `/api/profile/${PEER}`, asB);
			assert.equal(answer.status, 200, answer.text);
			// The database column says "just seen", the store says nothing: the store wins.
			assert.equal(answer.body.online, false);
			assert.equal(typeof answer.body.lastSeenAt, 'string');
		}, { kv: kvStub() });
	});
});

describe('the people search', () => {
	it('shows the found member online when the store says so', async () => {
		const people = [{ user_id: PEER, display_name: 'Alice', username: 'alice', profile: {}, directory_opt_out: false }];
		const mock = createPostgrestMock({}, {
			failWhen: (call) => {
				if (call.table === 'osionos_people_directory') return { status: 200, body: people };
				if (call.table === 'osionos_user_blocks') return { status: 200, body: [] };
				return null;
			},
		});
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/people?query=ali', asB);
			assert.equal(answer.status, 200, answer.text);
			assert.equal(answer.body.people[0].online, true);
		}, { kv: onlineKv() });
	});
});

describe('the directory search', () => {
	it('shows the found member online when the store says so', async () => {
		const people = [{ user_id: PEER, display_name: 'Alice', username: 'alice', profile: {}, directory_opt_out: false }];
		const mock = createPostgrestMock({}, {
			failWhen: (call) => {
				if (call.table === 'osionos_people_directory') return { status: 200, body: people };
				if (call.table === 'osionos_user_blocks') return { status: 200, body: [] };
				return null;
			},
		});
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/directory/search?q=ali', asB);
			assert.equal(answer.status, 200, answer.text);
			assert.equal(answer.body.people[0].online, true);
		}, { kv: onlineKv() });
	});
});

describe('the connections list', () => {
	it('shows the peer online when the store says so', async () => {
		const world = {
			blocks: [],
			people: [{ user_id: PEER, display_name: 'Alice', profile: {} }],
			connections: [{ id: uid(500), requester_id: IDS.userB, addressee_id: PEER, status: 'accepted', source: 'manual', intro_message: null, created_at: '2026-10-01T00:00:00.000Z', responded_at: null }],
		};
		const stub = createSocialStub(world);
		const answer = await getConnections(stub, IDS.userB, '', onlineKv());
		assert.equal(answer.status, 200);
		assert.equal(answer.body.connections[0].peer.online, true);
	});

	it('still answers 200 when the store is down', async () => {
		const world = {
			blocks: [],
			people: [{ user_id: PEER, display_name: 'Alice', profile: {} }],
			connections: [{ id: uid(500), requester_id: IDS.userB, addressee_id: PEER, status: 'accepted', source: 'manual', intro_message: null, created_at: '2026-10-01T00:00:00.000Z', responded_at: null }],
		};
		const stub = createSocialStub(world);
		const down = { getMany: async () => { throw new Error('down'); } };
		const answer = await getConnections(stub, IDS.userB, '', down);
		assert.equal(answer.status, 200);
		assert.equal(answer.body.connections[0].peer.online, false);
	});
});

describe('the new connection', () => {
	it('shows the peer online when the store says so', async () => {
		const world = {
			osionos_people_directory: [{ user_id: PEER, display_name: 'Alice', profile: {} }],
		};
		const mock = createPostgrestMock(world, {
			failWhen: (call) => (call.table === 'osionos_user_blocks' ? { status: 200, body: [] } : null),
		});
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/connections', asB, post({ addresseeId: PEER }));
			assert.equal(answer.status, 201, answer.text);
			assert.equal(answer.body.connection.peer.online, true);
		}, { kv: onlineKv() });
	});
});

describe('a handler built without a store', () => {
	it('still answers, with everybody offline', async () => {
		const world = {
			osionos_bridge_identities: [{
				user_id: PEER, display_name: 'Alice', username: 'alice', directory_opt_out: false,
				profile: {}, created_at: '2026-10-01T00:00:00.000Z', last_seen_at: null,
			}],
			osionos_workspace_members: [{ workspace_id: IDS.team, user_id: PEER, role: 'owner' }],
		};
		const mock = createPostgrestMock(world, {
			failWhen: (call) => (call.table === 'osionos_user_blocks' ? { status: 200, body: [] } : null),
		});
		const handler = createProfileHandler({
			config,
			verifySession: () => ({ userId: IDS.userB }),
			fetchImpl: mock.fetchImpl,
		});
		const captured = {};
		const response = {
			writeHead: (status) => { captured.status = status; },
			end: (text) => { captured.body = text ? JSON.parse(text) : null; },
		};
		await handler(new URL(`http://bridge.test/api/profile/${PEER}`), { method: 'GET', headers: { authorization: 'Bearer test' } }, response);
		assert.equal(captured.status, 200);
		assert.equal(captured.body.online, false);
	});
});

describe('the presence window', () => {
	const scripts = readdirSync(SCRIPTS).filter((name) => name.endsWith('.mjs'));

	it('lives in bridge-presence.mjs only', () => {
		for (const name of scripts) {
			if (name === 'bridge-presence.mjs') continue;
			const source = readFileSync(resolve(SCRIPTS, name), 'utf8');
			assert.equal(source.includes('90_000'), false, `${name} holds the window`);
			assert.equal(source.includes('PRESENCE_TTL_MS'), false, `${name} holds the window`);
		}
	});

	it('is not decided twice', () => {
		const definitions = scripts.filter((name) => /(?:function|const|let)\s+isOnline\b/.test(readFileSync(resolve(SCRIPTS, name), 'utf8')));
		assert.ok(definitions.length <= 1, `isOnline is defined in ${definitions.join(', ')}`);
	});
});
