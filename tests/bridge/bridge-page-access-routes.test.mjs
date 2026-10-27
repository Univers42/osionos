/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-access-routes.test.mjs                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The page surfaces apply the ONE inherited decision (C510-C512): a page denied on
 * its root, and every descendant of it, never appears in list, search, graph or
 * favorites — serialized bodies are grepped for both the id and the title. A failed
 * rules read is a 503, never an unfiltered list.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA);
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);

const ROOT = 'a1000000-0000-4000-8000-000000000001';
const CHILD = 'a1000000-0000-4000-8000-000000000002';
const GRAND = 'a1000000-0000-4000-8000-000000000003';
const SAFE = 'a1000000-0000-4000-8000-000000000004';
const RULE = 'a1000000-0000-4000-8000-0000000000f1';

const DENIED_TITLES = ['Root denied', 'Child secret', 'Grand secret'];
const DENIED_IDS = [ROOT, CHILD, GRAND];

function page(id, parent, visibility, title) {
	return {
		id, workspace_id: IDS.team, owner_id: IDS.userA, visibility, title, collaborators: [], properties: [],
		parent_page_id: parent, archived_at: null,
		content: [{ id: `${id}-b1`, type: 'paragraph', content: `${title} body` }],
		created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
	};
}

/** Root is SHARED (so it would be readable by default), denied for B; its descendants are shared too. */
function world() {
	const base = teamWorld();
	base.osionos_pages = [
		page(ROOT, null, 'shared', DENIED_TITLES[0]),
		page(CHILD, ROOT, 'shared', DENIED_TITLES[1]),
		page(GRAND, CHILD, 'shared', DENIED_TITLES[2]),
		page(SAFE, null, 'shared', 'Public notes'),
	];
	base.osionos_share_rules = [{
		id: RULE, workspace_id: IDS.team, resource_type: 'page', resource_id: ROOT,
		target: { type: 'user', userId: IDS.userB }, permission: 'no_access', explicit: true,
	}];
	base.osionos_page_favorites = [
		{ user_id: IDS.userB, page_id: ROOT, created_at: '2026-10-02T00:00:00.000Z' },
		{ user_id: IDS.userB, page_id: SAFE, created_at: '2026-10-01T00:00:00.000Z' },
	];
	return base;
}

function assertNoDenied(text, label) {
	for (const id of DENIED_IDS) assert.equal(text.includes(id), false, `${label}: leaked id ${id}`);
	for (const title of DENIED_TITLES) assert.equal(text.includes(title), false, `${label}: leaked title ${title}`);
}

describe('list, search, graph and favorites hide a denied subtree', () => {
	it('GET /api/pages and /api/pages/all omit the denied page and both descendants', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			for (const path of ['/api/pages', '/api/pages/all']) {
				const answer = await send(base, `${path}?workspaceId=${IDS.team}`, asB);
				assert.equal(answer.status, 200, answer.text);
				assertNoDenied(answer.text, path);
				assert.equal(answer.body.some((entry) => entry._id === SAFE), true, `${path}: the safe page stays`);
			}
			// The owner still sees the whole tree (unchanged exemption).
			const owner = await send(base, `/api/pages?workspaceId=${IDS.team}`, asA);
			assert.equal(owner.text.includes(DENIED_TITLES[1]), true, 'the owner keeps the child');
		});
	});

	it('GET /api/pages/search omits the denied subtree and keeps the safe match', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const denied = await send(base, `/api/pages/search?workspaceId=${IDS.team}&q=secret`, asB);
			assert.equal(denied.status, 200, denied.text);
			assert.deepEqual(denied.body, []);
			assertNoDenied(denied.text, 'search');
			const safe = await send(base, `/api/pages/search?workspaceId=${IDS.team}&q=notes`, asB);
			assert.equal(safe.status, 200, safe.text);
			assert.deepEqual(safe.body.map((entry) => entry._id), [SAFE]);
		});
	});

	it('GET /api/graph/pages and /api/graph/data omit the denied subtree', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			for (const path of [`/api/graph/pages?workspaceId=${IDS.team}`, `/api/graph/data?workspaceId=${IDS.team}`]) {
				const answer = await send(base, path, asB);
				assert.equal(answer.status, 200, answer.text);
				assertNoDenied(answer.text, path);
				assert.equal(answer.text.includes(SAFE), true, `${path}: the safe node stays`);
			}
		});
	});

	it('GET /api/favorites omits a denied favourite and keeps a readable one', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/favorites', asB);
			assert.equal(answer.status, 200, answer.text);
			assert.deepEqual(answer.body, { ok: true, pageIds: [SAFE] });
		});
	});
});

describe('a failed access read is a 503, never unfiltered rows', () => {
	it('a failing rules read answers 503 on every page surface', async () => {
		const mock = createPostgrestMock(world(), {
			failWhen: (call) => (call.table === 'osionos_share_rules' ? { status: 500, body: { message: 'rules down' } } : null),
		});
		await withBridge(config, mock.fetchImpl, async (base) => {
			for (const path of [`/api/pages?workspaceId=${IDS.team}`, `/api/pages/search?workspaceId=${IDS.team}&q=notes`, `/api/graph/pages?workspaceId=${IDS.team}`]) {
				const answer = await send(base, path, asB);
				assert.equal(answer.status, 503, `${path}: ${answer.text}`);
				assertNoDenied(answer.text, path);
			}
		});
	});

	it('a failing parent-map read answers 503', async () => {
		const mock = createPostgrestMock(world(), {
			failWhen: (call) => (call.table === 'osionos_pages' && call.params.get('select') === 'id,parent_page_id'
				? { status: 500, body: { message: 'pages down' } }
				: null),
		});
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, `/api/pages?workspaceId=${IDS.team}`, asB);
			assert.equal(answer.status, 503, answer.text);
			assertNoDenied(answer.text, 'parent map down');
		});
	});
});
