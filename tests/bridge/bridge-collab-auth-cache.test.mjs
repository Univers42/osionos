/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-collab-auth-cache.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// C5-C7 / P5: the cross-request access cache of POST /api/collaboration/:ws/events. Behind
// COLLAB_AUTH_CACHE=1 an allow is remembered for at most 5 s; flag off nothing changes. The
// PostgREST calls of every case are counted from the mock, not claimed.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { grantSudo } from '../../scripts/bridge-guard.mjs';
import { bumpAccess } from '../../scripts/bridge-access-generation.mjs';
import { IDS, createPostgrestMock, harnessConfig, patch, post, send, sessionHeaders, teamPage, teamWorld, withBridge } from './support/bridge-harness.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { removeMember } from './support/membership-world.mjs';
import { tokenClaims } from './support/session-signin.mjs';

const config = harnessConfig();
const EVENTS = `/api/collaboration/${IDS.team}/events`;
const SECRET = 'synthetic-auth-cache-secret';
const PAGE = 'd3000000-0000-4000-8000-000000000001';
const PARENT = 'd3000000-0000-4000-8000-000000000002';
const CHILD = 'd3000000-0000-4000-8000-000000000003';
// B owns this page, so an editor's blocks event is allowed on it with page topics on.
const OWN = IDS.pageB;
const TTL_MS = '400';
const settle = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));

function world(memberRole = 'editor') {
	const seed = teamWorld({ memberRole });
	seed.osionos_workspaces = [{ id: IDS.team, owner_id: IDS.userA, name: 'Team', slug: 'team', visibility: 'confidential' }];
	seed.osionos_people_directory = [{ user_id: IDS.userA, display_name: 'Alice', profile: {} }, { user_id: IDS.userB, display_name: 'Bob', profile: {} }];
	for (const id of [PAGE, PARENT, CHILD]) seed.osionos_pages.push(teamPage(id, IDS.userA, 'shared', id, 'text'));
	seed.osionos_share_rules = [];
	seed.osionos_bridge_identities = [{ user_id: IDS.userA, notify_token: 'notify-a' }, { user_id: IDS.userB, notify_token: 'notify-b' }];
	return seed;
}

/** Run `fn(base, ctx)` against a bridge over the seeded world, cache on unless `env` says otherwise. */
async function run(seed, fn, { env = {}, mockOptions = {} } = {}) {
	const mock = createPostgrestMock(seed, { realWorkspaceRpc: true, ...mockOptions });
	const publishes = [];
	const kv = kvStub();
	const fetchImpl = async (url, init) => {
		if (!String(url).endsWith('/v1/publish')) return mock.fetchImpl(url, init);
		publishes.push(JSON.parse(init.body));
		return new Response('{}', { status: 200 });
	};
	const serverEnv = { COLLAB_PAGE_TOPICS: '1', JWT_SECRET: SECRET, COLLAB_SERVER_TIMING: '1', COLLAB_AUTH_CACHE: '1', ...env };
	await withBridge(config, fetchImpl, (base) => fn(base, { mock, kv, pagePublishes: () => publishes.filter((entry) => String(entry.topic).startsWith('collabpage:')).length }), { env: serverEnv, kv });
}

/** One event from B: status, PostgREST calls it cost, and what Server-Timing says the cache did. */
async function fire(base, mock, type, pageId, extra = {}) {
	mock.calls.length = 0;
	const body = { event: 'collab', payload: { t: type, actor: `${IDS.userB}:tab`, seq: 1, pageId, ...extra } };
	const response = await fetch(`${base}${EVENTS}`, { headers: sessionHeaders(config, IDS.userB, IDS.homeB), ...post(body) });
	const text = await response.text();
	await settle();
	const timing = response.headers.get('server-timing') ?? '';
	return { status: response.status, text, timing, calls: mock.calls.length, cache: /authcache;desc="(\w+)"/.exec(timing)?.[1] ?? null };
}
const caret = (base, mock, pageId = PAGE) => fire(base, mock, 'caret', pageId);
const blocks = (base, mock, pageId = OWN) => fire(base, mock, 'blocks', pageId, { ops: [] });

const asA = () => sessionHeaders(config, IDS.userA, IDS.homeA, [IDS.team]);
const asOwner = (base, path, init) => send(base, path, asA(), init);

async function warm(base, mock, event = blocks) {
	const first = await event(base, mock);
	const second = await event(base, mock);
	assert.deepEqual([first.status, first.cache, second.status, second.cache], [200, 'miss', 200, 'hit'], `${first.text} ${second.text}`);
	assert.equal(second.calls, 0, 'a hit reads nothing');
}

describe('collab auth cache: flag off', () => {
	for (const [label, env] of [['unset', {}], ['0', { COLLAB_AUTH_CACHE: '0' }], ['ttl 0', { COLLAB_AUTH_CACHE_TTL_MS: '0' }]]) {
		it(`flag ${label}: every event pays the whole check and reports authcache off`, async (t) => {
			await run(world(), async (base, { mock, pagePublishes }) => {
				const events = [await blocks(base, mock), await blocks(base, mock)];
				assert.deepEqual(events.map((event) => [event.status, event.cache]), [[200, 'off'], [200, 'off']]);
				assert.ok(events[0].calls > 1, `calls ${events[0].calls}`);
				assert.equal(events[1].calls, events[0].calls, 'no memory across requests');
				assert.equal(pagePublishes(), 2);
				if (label === 'unset') t.diagnostic(`PostgREST calls per blocks event, cache off: ${events[0].calls}`);
			}, { env: label === 'unset' ? { COLLAB_AUTH_CACHE: undefined } : env });
		});
	}

	it('without COLLAB_SERVER_TIMING no header is sent', async () => {
		await run(world(), async (base, { mock }) => {
			assert.equal((await blocks(base, mock)).timing, '');
		}, { env: { COLLAB_SERVER_TIMING: undefined } });
	});
});

describe('collab auth cache: flag on', () => {
	it('a second event within the TTL makes fewer PostgREST calls than the first and publishes', async (t) => {
		const counts = {};
		for (const [label, env] of [['off', { COLLAB_AUTH_CACHE: undefined }], ['on', {}]]) {
			await run(world(), async (base, { mock, pagePublishes }) => {
				const first = await blocks(base, mock);
				const second = await blocks(base, mock);
				counts[label] = [first.calls, second.calls];
				assert.deepEqual([first.status, second.status], [200, 200]);
				assert.equal(pagePublishes(), 2);
				if (label === 'on') assert.deepEqual([first.cache, second.cache], ['miss', 'hit']);
			}, { env });
		}
		assert.equal(counts.on[0], counts.off[0], 'a miss costs what the flag-off event costs');
		assert.ok(counts.on[1] < counts.off[1], JSON.stringify(counts));
		t.diagnostic(`PostgREST calls per blocks event: off=${counts.off[1]} on-miss=${counts.on[0]} on-hit=${counts.on[1]}`);
	});

	it('a read allow does not allow a write', async () => {
		await run(world('viewer'), async (base, { mock }) => {
			await warm(base, mock, caret);
			const write = await blocks(base, mock, PAGE);
			assert.equal(write.status, 403, write.text);
			assert.equal(write.cache, 'miss');
			assert.ok(write.calls > 0);
		});
	});

	it('the key names the user, the page and the class', async () => {
		await run(world(), async (base, { mock }) => {
			await warm(base, mock);
			const otherPage = await blocks(base, mock, 'd3000000-0000-4000-8000-0000000000ff');
			assert.equal(otherPage.cache, 'miss');
			assert.notEqual(otherPage.status, 200);
		});
	});

	it('a denial is never cached: the same denial pays the same calls, and a later allow is immediate', async () => {
		await run(world(), async (base, { mock, pagePublishes }) => {
			removeMember(mock, IDS.team, IDS.userB);
			const denied = [await blocks(base, mock), await blocks(base, mock)];
			assert.deepEqual(denied.map((event) => [event.status, event.cache]), [[403, 'miss'], [403, 'miss']]);
			assert.equal(denied[1].calls, denied[0].calls);
			assert.equal(pagePublishes(), 0);
			mock.rows('osionos_workspace_members').push({ workspace_id: IDS.team, user_id: IDS.userB, role: 'editor', permissions: ['create', 'read', 'update'] });
			assert.deepEqual((({ status, cache }) => [status, cache])(await blocks(base, mock)), [200, 'miss']);
		});
	});

	it('a blocks event without an op list is refused every time, whatever the cache holds', async () => {
		await run(world(), async (base, { mock }) => {
			await warm(base, mock);
			const bare = await fire(base, mock, 'blocks', OWN, { ops: 'x' });
			assert.equal(bare.status, 403);
			assert.equal(bare.cache, 'miss');
		});
	});
});

describe('collab auth cache: the TTL', () => {
	it('re-checks after the TTL, and an out-of-process write is only bounded by it', async () => {
		await run(world(), async (base, { mock }) => {
			await warm(base, mock);
			removeMember(mock, IDS.team, IDS.userB);
			const inside = await blocks(base, mock);
			assert.deepEqual([inside.status, inside.cache], [200, 'hit']);
			await settle(Number(TTL_MS) + 60);
			const after = await blocks(base, mock);
			assert.deepEqual([after.status, after.cache], [403, 'miss']);
			assert.ok(after.calls > 0);
		}, { env: { COLLAB_AUTH_CACHE_TTL_MS: TTL_MS } });
	});
});

describe('collab auth cache: an in-process writer invalidates at once', () => {
	const expectRechecked = (event, status) => {
		assert.equal(event.cache, 'miss', event.timing);
		assert.equal(event.status, status, event.text);
		assert.ok(event.calls > 0);
	};

	it('removing the member', async () => {
		await run(world(), async (base, { mock }) => {
			await warm(base, mock);
			const removed = await asOwner(base, `/api/workspaces/${IDS.team}/members/${IDS.userB}`, { method: 'DELETE' });
			assert.equal(removed.status, 200, removed.text);
			expectRechecked(await blocks(base, mock), 403);
		});
	});

	it('downgrading the member role', async () => {
		// A page B owns stays writable at any role, so the downgrade is read on A's page.
		const onShared = (base, mock) => blocks(base, mock, PAGE);
		await run(world(), async (base, { mock }) => {
			await warm(base, mock, onShared);
			const changed = await asOwner(base, `/api/workspaces/${IDS.team}/members/${IDS.userB}`, patch({ role: 'guest' }));
			assert.equal(changed.status, 200, changed.text);
			expectRechecked(await onShared(base, mock), 403);
		});
	});

	it('writing a share rule', async () => {
		await run(world(), async (base, { mock }) => {
			await warm(base, mock, caret);
			const rule = { workspaceId: IDS.team, resourceType: 'page', resourceId: PAGE, permission: 'no_access', target: { type: 'user', userId: IDS.userB } };
			const written = await asOwner(base, '/api/perms/rules', post(rule));
			assert.equal(written.status, 200, written.text);
			expectRechecked(await caret(base, mock), 404);
		});
	});

	it('moving a page under a parent whose rule refuses the member', async () => {
		const seed = world();
		seed.osionos_share_rules.push({ id: 'rule-parent', workspace_id: IDS.team, resource_type: 'page', resource_id: PARENT, target: { type: 'user', userId: IDS.userB }, target_key: `user:${IDS.userB}:`, permission: 'no_access', explicit: true });
		await run(seed, async (base, { mock }) => {
			await warm(base, mock, (b, m) => caret(b, m, CHILD));
			const moved = await asOwner(base, `/api/pages/${CHILD}`, patch({ parentPageId: PARENT }));
			assert.equal(moved.status, 200, moved.text);
			expectRechecked(await caret(base, mock, CHILD), 404);
		});
	});

	it('trashing the page', async () => {
		await run(world(), async (base, { mock }) => {
			await warm(base, mock, caret);
			const trashed = await asOwner(base, `/api/pages/${PAGE}`, patch({ archivedAt: new Date().toISOString() }));
			assert.equal(trashed.status, 200, trashed.text);
			const after = await caret(base, mock);
			assert.equal(after.cache, 'miss');
			assert.ok(after.calls > 0);
		});
	});

	it('deleting the page', async () => {
		await run(world(), async (base, { mock }) => {
			await warm(base, mock, caret);
			const deleted = await asOwner(base, `/api/pages/${PAGE}`, { method: 'DELETE' });
			assert.equal(deleted.status, 200, deleted.text);
			expectRechecked(await caret(base, mock), 404);
		});
	});

	it('transferring the workspace owner re-checks (B becomes owner, so the answer stays allow)', async () => {
		await run(world(), async (base, { mock, kv }) => {
			await warm(base, mock);
			const headers = asA();
			const claims = tokenClaims(headers.authorization.slice('Bearer '.length));
			await grantSudo(kv, { userId: claims.sub, raw: { jti: claims.jti } });
			const moved = await send(base, `/api/workspaces/${IDS.team}/members/transfer-ownership`, headers, post({ toUserId: IDS.userB }));
			assert.equal(moved.status, 200, moved.text);
			expectRechecked(await blocks(base, mock), 200);
		});
	});

	it('typing (a content-only page edit) does not invalidate', async () => {
		await run(world(), async (base, { mock }) => {
			await warm(base, mock);
			const edited = await send(base, `/api/pages/${OWN}`, sessionHeaders(config, IDS.userB, IDS.homeB), patch({ content: [{ id: 'x', type: 'paragraph', content: 'hi' }] }));
			assert.equal(edited.status, 200, edited.text);
			assert.equal((await blocks(base, mock)).cache, 'hit');
		});
	});
});

describe('collab auth cache: a revalidate error fails closed', () => {
	for (const table of ['osionos_share_rules', 'osionos_workspace_members']) {
		it(`a 500 reading ${table} is an error, publishes nothing and stores nothing`, async () => {
			let failing = false;
			const failWhen = (call) => (failing && call.table === table ? { status: 500, body: { message: 'boom' } } : null);
			await run(world(), async (base, { mock, pagePublishes }) => {
				await warm(base, mock);
				const before = pagePublishes();
				bumpAccess({ workspaceId: IDS.team });
				failing = true;
				const broken = await blocks(base, mock);
				assert.ok(broken.status >= 500, `${broken.status} ${broken.text}`);
				assert.equal(broken.cache, 'miss');
				assert.equal(pagePublishes(), before);
				failing = false;
				assert.equal((await blocks(base, mock)).cache, 'miss', 'the failed check stored nothing');
				assert.equal((await blocks(base, mock)).cache, 'hit');
			}, { mockOptions: { failWhen } });
		});
	}
});
