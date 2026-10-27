/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-collab-page-access.test.mjs                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';
import { removeMember } from './support/membership-world.mjs';

const config = harnessConfig();
const SECRET = 'synthetic-page-access-secret';
const ON = { COLLAB_PAGE_TOPICS: '1', JWT_SECRET: SECRET };

const PARENT = 'd1000000-0000-4000-8000-000000000001';
const CHILD = 'd1000000-0000-4000-8000-000000000002';
const CHILD_TOPIC = `collabpage:${CHILD}`;

function world({ rule = true, memberRole = 'viewer' } = {}) {
	const seed = teamWorld({ memberRole });
	seed.osionos_pages.push(
		{ id: PARENT, workspace_id: IDS.team, owner_id: IDS.userA, visibility: 'shared', title: 'Parent page', collaborators: [], properties: [], parent_page_id: null, archived_at: null, content: [], created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' },
		{ id: CHILD, workspace_id: IDS.team, owner_id: IDS.userA, visibility: 'shared', title: 'Child page', collaborators: [], properties: [], parent_page_id: PARENT, archived_at: null, content: [], created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' },
	);
	seed.osionos_share_rules = rule
		? [{ id: 'rule-parent', workspace_id: IDS.team, resource_type: 'page', resource_id: PARENT, target: { type: 'user', userId: IDS.userB }, permission: 'no_access', explicit: true }]
		: [];
	seed.osionos_bridge_identities = [
		{ user_id: IDS.userA, notify_token: 'notify-a' },
		{ user_id: IDS.userB, notify_token: 'notify-b' },
	];
	return seed;
}

function headersB() { return sessionHeaders(config, IDS.userB, IDS.homeB); }
function headersA() { return sessionHeaders(config, IDS.userA, IDS.homeA); }

async function run(seed, fn) {
	const mock = createPostgrestMock(seed);
	const publishes = [];
	const fetchImpl = async (url, init) => {
		if (String(url).endsWith('/v1/publish')) {
			publishes.push(JSON.parse(init.body));
			return new Response('{}', { status: 200 });
		}
		return mock.fetchImpl(url, init);
	};
	const out = await withBridge(config, fetchImpl, (base) => fn(base, { mock, publishes }), { env: ON });
	return { ...out, publishes };
}

describe('inherited no_access on a parent denies the child (real wiring)', () => {
	it('B page-token request for CHILD is 404', async () => {
		await run(world({ rule: true }), async (base) => {
			const result = await send(base, `/api/collaboration/${IDS.team}/pages/${CHILD}/realtime-token`, headersB(), post({}));
			assert.equal(result.status, 404, result.text);
			assert.equal(result.body.token, undefined);
		});
	});

	it('B caret publish on CHILD is 404 and nothing is published', async () => {
		const { publishes } = await run(world({ rule: true }), async (base) => {
			const result = await send(base, `/api/collaboration/${IDS.team}/events`, headersB(), post({
				event: 'collab',
				payload: { t: 'caret', actor: `${IDS.userB}:tab-one`, seq: 1, pageId: CHILD },
			}));
			assert.equal(result.status, 404, result.text);
		});
		assert.equal(publishes.length, 0, 'nothing published');
	});

	it('a summon targeting B for CHILD is 404', async () => {
		await run(world({ rule: true }), async (base) => {
			const result = await send(base, `/api/collaboration/${IDS.team}/events`, headersA(), post({
				event: 'collab.req',
				payload: { cid: 'c-summon', target: IDS.userB, req: { kind: 'summon', route: `/pages/${CHILD}` } },
			}));
			assert.equal(result.status, 404, result.text);
		});
	});
});

describe('with the inherited rule removed, access is restored', () => {
	it('token minted and caret publish accepted', async () => {
		const { publishes } = await run(world({ rule: false }), async (base) => {
			const tokenResult = await send(base, `/api/collaboration/${IDS.team}/pages/${CHILD}/realtime-token`, headersB(), post({}));
			assert.equal(tokenResult.status, 200, tokenResult.text);
			assert.equal(tokenResult.body.level, 'can_view');

			const publishResult = await send(base, `/api/collaboration/${IDS.team}/events`, headersB(), post({
				event: 'collab',
				payload: { t: 'caret', actor: `${IDS.userB}:tab-one`, seq: 1, pageId: CHILD },
			}));
			assert.equal(publishResult.status, 200, publishResult.text);
		});
		assert.equal(publishes.length, 1);
		assert.equal(publishes[0].topic, CHILD_TOPIC);
	});
});

describe('ex-member owner loses access (C557)', () => {
	it('a page owner who left the workspace gets no page token', async () => {
		const seed = teamWorld();
		const mock = createPostgrestMock(seed);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const before = await send(base, `/api/collaboration/${IDS.team}/pages/${IDS.pageB}/realtime-token`, headersB(), post({}));
			assert.equal(before.status, 200, before.text);
			removeMember(mock, IDS.team, IDS.userB);
			const after = await send(base, `/api/collaboration/${IDS.team}/pages/${IDS.pageB}/realtime-token`, headersB(), post({}));
			// The Shared-space gate refuses an ex-member before any page lookup (C557 at the space level).
			assert.equal(after.status, 403, after.text);
			assert.equal(after.body.token, undefined);
		}, { env: ON });
	});
});
