/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-collab-event-dedupe.test.mjs                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// C4: one collaboration event reads membership, page row and share rules once, and the
// allow/deny answers are the ones the duplicated reads gave.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';
import { removeMember } from './support/membership-world.mjs';

const config = harnessConfig();
const SECRET = 'synthetic-event-dedupe-secret';
const PAGE = 'd2000000-0000-4000-8000-000000000001';
// B owns this page: the editor allow-path needs a write the shared page does not give.
const OWN = IDS.pageB;
const MISSING = 'd2000000-0000-4000-8000-0000000000ff';
// PostgREST calls one blocks event cost on origin/develop 3d1c94d77 (page-topics on,
// editor owning the page, one share rule), measured with this same world before the change.
const CALLS_BEFORE = 8;

function world(memberRole) {
	const seed = teamWorld({ memberRole });
	seed.osionos_pages.push({ id: PAGE, workspace_id: IDS.team, owner_id: IDS.userA, visibility: 'shared', title: 'Shared', collaborators: [], properties: [], parent_page_id: null, archived_at: null, content: [], created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' });
	seed.osionos_share_rules = [{ id: 'rule-other', workspace_id: IDS.team, resource_type: 'page', resource_id: IDS.pageB, target: { type: 'user', userId: IDS.userA }, permission: 'full_access', explicit: true }];
	seed.osionos_bridge_identities = [{ user_id: IDS.userA, notify_token: 'notify-a' }, { user_id: IDS.userB, notify_token: 'notify-b' }];
	return seed;
}

async function run(seed, fn, flag = '1') {
	const mock = createPostgrestMock(seed);
	const publishes = [];
	const fetchImpl = async (url, init) => {
		if (String(url).endsWith('/v1/publish')) {
			publishes.push(JSON.parse(init.body));
			return new Response('{}', { status: 200 });
		}
		return mock.fetchImpl(url, init);
	};
	await withBridge(config, fetchImpl, (base) => fn(base, { mock, publishes }), { env: { COLLAB_PAGE_TOPICS: flag, JWT_SECRET: SECRET } });
	return publishes;
}

const headersB = () => sessionHeaders(config, IDS.userB, IDS.homeB);
const event = (base, t, pageId, extra = {}) => send(base, `/api/collaboration/${IDS.team}/events`, headersB(), post({
	event: 'collab',
	payload: { t, actor: `${IDS.userB}:tab`, seq: 1, pageId, ...extra },
}));
const blocks = (base, pageId) => event(base, 'blocks', pageId, { ops: [] });

describe('one blocks event reads each fact once (C4)', () => {
	it('costs fewer PostgREST calls than before and reads pages, rules, members once', async () => {
		let seen;
		await run(world('editor'), async (base, { mock }) => {
			mock.calls.length = 0;
			const result = await blocks(base, OWN);
			assert.equal(result.status, 200, result.text);
			seen = mock.calls.map((call) => (call.table === 'osionos_pages' && call.params.has('id') ? 'page-row' : call.table));
		});
		const count = (name) => seen.filter((table) => table === name).length;
		assert.ok(seen.length < CALLS_BEFORE, `calls ${seen.length} (before ${CALLS_BEFORE}): ${seen.join(', ')}`);
		assert.equal(count('page-row'), 1, seen.join(', '));
		// The Shared-space gate and the page-level role read stay two reads (different selects).
		assert.ok(count('osionos_workspace_members') <= 2, seen.join(', '));
		assert.equal(count('osionos_share_rules'), 1, seen.join(', '));
	});

	it('dedupe is per request: a second event reads again (no cross-request cache)', async () => {
		await run(world('editor'), async (base, { mock }) => {
			await blocks(base, OWN);
			mock.calls.length = 0;
			await blocks(base, OWN);
			assert.equal(mock.calls.filter((call) => call.table === 'osionos_pages' && call.params.has('id')).length, 1);
		});
	});
});

describe('allow and deny are unchanged (C3, C4)', () => {
	for (const flag of ['1', '0']) {
		it(`flag ${flag}: guest blocks 403, editor blocks 200`, async () => {
			await run(world('viewer'), async (base) => {
				assert.equal((await blocks(base, PAGE)).status, 403);
			}, flag);
			const published = await run(world('editor'), async (base) => {
				assert.equal((await blocks(base, OWN)).status, 200);
			}, flag);
			assert.equal(published.length, 1);
		});
	}

	it('guest caret 200', async () => {
		await run(world('viewer'), async (base) => {
			assert.equal((await event(base, 'caret', PAGE)).status, 200);
		});
	});

	it('a private page is a 404 identical to a missing page', async () => {
		await run(world('editor'), async (base) => {
			const privateA = await blocks(base, IDS.privateA);
			const missing = await blocks(base, MISSING);
			assert.equal(privateA.status, 404);
			assert.equal(missing.status, 404);
			assert.deepEqual(privateA.body, missing.body);
		});
	});

	it('a removed member is refused', async () => {
		await run(world('editor'), async (base, { mock }) => {
			assert.equal((await blocks(base, OWN)).status, 200);
			removeMember(mock, IDS.team, IDS.userB);
			assert.equal((await blocks(base, OWN)).status, 403);
		});
	});

	// Flag off, shared page: only the member's own permissions decide the write.
	it('a downgraded role is refused', async () => {
		await run(world('editor'), async (base, { mock }) => {
			assert.equal((await blocks(base, PAGE)).status, 200);
			const row = mock.rows('osionos_workspace_members').find((member) => member.user_id === IDS.userB);
			row.role = 'viewer';
			row.permissions = ['read'];
			assert.equal((await blocks(base, PAGE)).status, 403);
		}, '0');
	});

	it('a share-rule read error stays a 503, nothing published', async () => {
		const mock = createPostgrestMock(world('editor'), { failWhen: (call) => (call.table === 'osionos_share_rules' ? { status: 500, body: { message: 'boom' } } : null) });
		const publishes = [];
		await withBridge(config, (url, init) => {
			if (String(url).endsWith('/v1/publish')) { publishes.push(init.body); return Promise.resolve(new Response('{}', { status: 200 })); }
			return mock.fetchImpl(url, init);
		}, async (base) => {
			assert.equal((await blocks(base, OWN)).status, 503);
		}, { env: { COLLAB_PAGE_TOPICS: '1', JWT_SECRET: SECRET } });
		assert.equal(publishes.length, 0);
	});

	// The space gate (select=user_id) has its own answer; this fails the page-level role read only.
	it('a members-table read error stays a 503 on a caret event, nothing published', async () => {
		const mock = createPostgrestMock(world('editor'), { failWhen: (call) => (call.table === 'osionos_workspace_members' && call.params.get('select') === 'role,permissions' ? { status: 500, body: { message: 'boom' } } : null) });
		const publishes = [];
		await withBridge(config, (url, init) => {
			if (String(url).endsWith('/v1/publish')) { publishes.push(init.body); return Promise.resolve(new Response('{}', { status: 200 })); }
			return mock.fetchImpl(url, init);
		}, async (base) => {
			assert.equal((await event(base, 'caret', PAGE)).status, 503);
		}, { env: { COLLAB_PAGE_TOPICS: '1', JWT_SECRET: SECRET } });
		assert.equal(publishes.length, 0);
	});

	it('a malformed body is refused before any database read', async () => {
		await run(world('editor'), async (base, { mock }) => {
			mock.calls.length = 0;
			const result = await send(base, `/api/collaboration/${IDS.team}/events`, headersB(), post({ event: 'nope', payload: {} }));
			assert.equal(result.status, 422);
			assert.equal(mock.calls.length, 0, mock.calls.map((call) => call.table).join(', '));
		});
	});
});
