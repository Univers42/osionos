/* ************************************************************************** */
/*   bridge-page-access-surfaces.test.mjs                                     */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, patch, post, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asB = sessionHeaders(config, IDS.userB, IDS.homeB, [IDS.team]);

const PARENT = 'b2000000-0000-4000-8000-000000000001';
const HIDDEN = 'b2000000-0000-4000-8000-000000000002';
const RULE = 'b2000000-0000-4000-8000-0000000000f1';
const HIDDEN_TITLE = 'HIDDEN-H';

function page(id, parent, title) {
	return {
		id, workspace_id: IDS.team, owner_id: IDS.userA, visibility: 'shared', title, collaborators: [], properties: [],
		parent_page_id: parent, archived_at: null,
		content: [{ id: `${id}-b1`, type: 'paragraph', content: `${title} body` }],
		created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
	};
}

function world() {
	const base = teamWorld({ memberRole: 'editor' });
	base.osionos_pages = [page(PARENT, null, 'Parent'), page(HIDDEN, PARENT, HIDDEN_TITLE)];
	base.osionos_share_rules = [{
		id: RULE, workspace_id: IDS.team, resource_type: 'page', resource_id: PARENT,
		target: { type: 'user', userId: IDS.userB }, permission: 'no_access', explicit: true,
	}];
	return base;
}

describe('inherited deny on an ancestor: single-page surfaces', () => {
	it('GET /api/pages/:id is 404', async () => {
		const mock = createPostgrestMock(world(), { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const r = await send(base, `/api/pages/${HIDDEN}`, asB);
			assert.equal(r.status, 404, r.text);
		});
	});
	it('PATCH /api/pages/:id is 404', async () => {
		const mock = createPostgrestMock(world(), { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const r = await send(base, `/api/pages/${HIDDEN}`, asB, patch({ title: 'x' }));
			assert.equal(r.status, 404, r.text);
		});
	});
	it('POST /api/pages/:id/blocks (append) is 404', async () => {
		const mock = createPostgrestMock(world(), { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const r = await send(base, `/api/pages/${HIDDEN}/blocks`, asB, post({ blocks: [{ id: 'b1', type: 'paragraph' }], idempotencyKey: 'test-key-12345678' }));
			assert.equal(r.status, 404, r.text);
		});
	});
	it('DELETE /api/pages/:id is 404', async () => {
		const mock = createPostgrestMock(world(), { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const r = await send(base, `/api/pages/${HIDDEN}`, asB, { method: 'DELETE' });
			assert.equal(r.status, 404, r.text);
		});
	});
	it('POST /api/pages with parentPageId=HIDDEN is 404', async () => {
		const mock = createPostgrestMock(world(), { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const r = await send(base, '/api/pages', asB, post({ workspaceId: IDS.team, title: 'nested', parentPageId: HIDDEN }));
			assert.equal(r.status, 404, r.text);
		});
	});
	it('GET /api/pages/:id/backlinks is 404', async () => {
		const mock = createPostgrestMock(world(), { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const r = await send(base, `/api/pages/${HIDDEN}/backlinks`, asB);
			assert.equal(r.status, 404, r.text);
		});
	});
	it('POST /api/favorites with the hidden page is 404', async () => {
		const mock = createPostgrestMock(world(), { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const r = await send(base, '/api/favorites', asB, post({ pageId: HIDDEN }));
			assert.equal(r.status, 404, r.text);
		});
	});
});

describe('C550 surfaces never carry the denied page', () => {
	it('feed: GET /api/feed/{H}/likes answers like an id with no activity', async () => {
		const mock = createPostgrestMock(world(), { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const r = await send(base, `/api/feed/${HIDDEN}/likes`, asB);
			assert.equal(r.status, 200, r.text);
			assert.equal(r.text.includes(HIDDEN_TITLE), false);
		});
	});
	it('feed: POST /api/feed/{H}/like is 404', async () => {
		const mock = createPostgrestMock(world(), { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const r = await send(base, `/api/feed/${HIDDEN}/like`, asB, { method: 'POST' });
			assert.equal(r.status, 404, r.text);
		});
	});
	it('profile shares omit the denied page', async () => {
		const base = world();
		base.osionos_feed_shares = [{ user_id: IDS.userA, page_id: HIDDEN, target: 'profile', created_at: '2026-10-02T00:00:00.000Z' }];
		const mock = createPostgrestMock(base, { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const r = await send(base, `/api/profile/${IDS.userA}/shares`, asB);
			assert.equal(r.status, 200, r.text);
			assert.equal(r.text.includes(HIDDEN), false);
			assert.equal(r.text.includes(HIDDEN_TITLE), false);
		});
	});
	it('reports: POST /api/social/reports on the hidden page is 404', async () => {
		const mock = createPostgrestMock(world(), { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const r = await send(base, '/api/social/reports', asB, post({ subjectKind: 'page', subjectId: HIDDEN, category: 'other' }));
			assert.equal(r.status, 404, r.text);
		});
	});
});