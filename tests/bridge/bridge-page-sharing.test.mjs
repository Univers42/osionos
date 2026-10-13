/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-sharing.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Only a page's owner changes who may read it: a non-owner's PATCH keeps the sharing
// keys out, the marketplace publishes only the caller's own app (with that app's own
// children), app drafts and children follow the read rule, and re-opening a record
// never changes who owns its note.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, patch, post, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA);
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);
const MARKET = '5a4b1c2d-1111-4111-8111-000000000001';
const MARKET_DB = '5a4b1c2d-2222-4222-8222-000000000002';
const APPS = {
	publishedB: 'b2b2b2b2-2222-4222-8222-b2b2b2b2b2b2',
	childB: 'b3b3b3b3-2222-4222-8222-b3b3b3b3b3b3',
	draftB: 'b4b4b4b4-2222-4222-8222-b4b4b4b4b4b4',
	draftA: 'a5a5a5a5-1111-4111-8111-a5a5a5a5a5a5',
	ownerless: 'e0e0e0e0-5555-4555-8555-e0e0e0e0e0e0',
	childA: 'a9a9a9a9-1111-4111-8111-a9a9a9a9a9a9',
	childC: 'c9c9c9c9-3333-4333-8333-c9c9c9c9c9c9',
	childOutside: 'a0a9a0a9-1111-4111-8111-a0a9a0a9a0a9',
};
const USER_C = 'c3c3c3c3-3333-4333-8333-c3c3c3c3c3c3';
const DB = 'f0f0f0f0-6666-4666-8666-f0f0f0f0f0f0';

function marketRow(id, ownerId, visibility, parentId = MARKET_DB) {
	return {
		id, workspace_id: MARKET, owner_id: ownerId, visibility, parent_page_id: parentId, database_id: parentId === MARKET_DB ? MARKET_DB : null,
		title: `app ${id.slice(0, 4)}`, surface: 'app', collaborators: [], properties: [], content: [], archived_at: null,
		created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
	};
}

function marketWorld() {
	const world = teamWorld({ memberRole: 'editor' });
	world.osionos_pages.push(
		marketRow(APPS.publishedB, IDS.userB, 'public'),
		marketRow(APPS.childB, IDS.userB, 'private', APPS.publishedB),
		marketRow(APPS.draftB, IDS.userB, 'private'),
		marketRow(APPS.draftA, IDS.userA, 'private'),
		marketRow(APPS.ownerless, null, 'private'),
	);
	return world;
}

describe('sharing keys from a non-owner are ignored, never a 403', () => {
	it('stores a non-owner edit that repeats the stored workspace and visibility', async () => {
		const mock = createPostgrestMock(teamWorld({ memberRole: 'editor' }));
		const content = [{ id: 'b-edit', type: 'paragraph', content: 'written by B' }];
		await withBridge(config, mock.fetchImpl, async (base) => {
			const result = await send(base, `/api/pages/${IDS.sharedA}`, asB, patch({ content, title: 'Edited by B', workspaceId: IDS.team, visibility: 'shared' }));
			assert.equal(result.status, 200, result.text);
			assert.equal(result.body.ignored, undefined);
			assert.deepEqual(mock.page(IDS.sharedA).content, content);
			assert.equal(mock.page(IDS.sharedA).title, 'Edited by B');
		});
	});

	const attempts = [
		['visibility', { visibility: 'public' }],
		['collaborators', { collaborators: [{ userId: IDS.userB, role: 'editor' }] }],
		['workspaceId', { workspaceId: IDS.homeB }],
	];
	for (const [key, body] of attempts) {
		it(`ignores ${key} from a non-owner on a page they can read, and leaves the row unchanged`, async () => {
			const mock = createPostgrestMock(teamWorld({ memberRole: 'editor' }));
			const before = structuredClone(mock.page(IDS.sharedA));
			await withBridge(config, mock.fetchImpl, async (base) => {
				const result = await send(base, `/api/pages/${IDS.sharedA}`, asB, patch(body));
				assert.equal(result.status, 200, result.text);
				assert.deepEqual(result.body.ignored, [key]);
				assert.deepEqual(mock.page(IDS.sharedA), before);
			});
		});

		it(`404s ${key} from a non-owner on a page they cannot read, and the page stays unreadable`, async () => {
			const mock = createPostgrestMock(teamWorld({ memberRole: 'editor' }));
			const before = structuredClone(mock.page(IDS.privateA));
			await withBridge(config, mock.fetchImpl, async (base) => {
				const result = await send(base, `/api/pages/${IDS.privateA}`, asB, patch(body));
				assert.equal(result.status, 404, result.text);
				assert.deepEqual(mock.page(IDS.privateA), before);
				assert.equal((await send(base, `/api/pages/${IDS.privateA}`, asB)).status, 404);
			});
		});
	}

	it('lets the owner change visibility, collaborators and workspace', async () => {
		const mock = createPostgrestMock(teamWorld({ memberRole: 'editor' }));
		const collaborators = [{ userId: IDS.userB, role: 'viewer' }];
		await withBridge(config, mock.fetchImpl, async (base) => {
			const result = await send(base, `/api/pages/${IDS.privateA}`, asA, patch({ visibility: 'shared', collaborators, workspaceId: IDS.homeA }));
			assert.equal(result.status, 200, result.text);
			const stored = mock.page(IDS.privateA);
			assert.deepEqual([stored.visibility, stored.collaborators, stored.workspace_id], ['shared', collaborators, IDS.homeA]);
		});
	});
});

describe('marketplace publishing and app pages', () => {
	it('refuses to publish an ownerless app and leaves it unchanged', async () => {
		const mock = createPostgrestMock(marketWorld());
		const before = structuredClone(mock.page(APPS.ownerless));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const result = await send(base, '/api/marketplace/publish', asB, post({ pageId: APPS.ownerless }));
			assert.equal(result.status, 403, result.text);
			assert.deepEqual(mock.page(APPS.ownerless), before);
		});
	});

	it('refuses to publish a page outside the marketplace workspace, even the caller\'s own', async () => {
		const mock = createPostgrestMock(marketWorld());
		const before = structuredClone(mock.page(IDS.pageB));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const result = await send(base, '/api/marketplace/publish', asB, post({ pageId: IDS.pageB }));
			assert.equal(result.status, 404, result.text);
			assert.deepEqual(mock.page(IDS.pageB), before);
		});
	});

	it('still publishes the caller\'s own marketplace draft', async () => {
		const mock = createPostgrestMock(marketWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const result = await send(base, '/api/marketplace/publish', asB, post({ pageId: APPS.draftB }));
			assert.equal(result.status, 200, result.text);
			assert.equal(mock.page(APPS.draftB).visibility, 'public');
		});
	});

	it('publishes the app\'s own children with it, never a child owned by someone else', async () => {
		const world = marketWorld();
		const outside = { ...marketRow(APPS.childOutside, IDS.userA, 'private', APPS.draftA), workspace_id: IDS.team };
		world.osionos_pages.push(marketRow(APPS.childA, IDS.userA, 'private', APPS.draftA), marketRow(APPS.childC, USER_C, 'private', APPS.draftA), outside);
		const mock = createPostgrestMock(world);
		const untouched = [APPS.childC, APPS.childOutside].map((id) => structuredClone(mock.page(id)));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const published = await send(base, '/api/marketplace/publish', asA, post({ pageId: APPS.draftA }));
			assert.equal(published.status, 200, published.text);
			assert.equal(mock.page(APPS.childA).visibility, 'public');
			assert.deepEqual([APPS.childC, APPS.childOutside].map((id) => mock.page(id)), untouched);
			const app = await send(base, `/api/marketplace/apps/${APPS.draftA}`, asB);
			assert.equal(app.status, 200, app.text);
			assert.deepEqual(app.body.children.map((child) => child._id), [APPS.childA]);
		});
	});

	it('does not return another user\'s private page placed under the caller\'s app', async () => {
		const mock = createPostgrestMock(marketWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const byB = await send(base, `/api/pages/${IDS.privateA}`, asB, patch({ parentPageId: APPS.publishedB }));
			assert.equal(byB.status, 404, byB.text);
			const moved = await send(base, `/api/pages/${IDS.privateA}`, asA, patch({ parentPageId: APPS.publishedB }));
			assert.equal(moved.status, 200, moved.text);
			const app = await send(base, `/api/marketplace/apps/${APPS.publishedB}`, asB);
			assert.equal(app.status, 200, app.text);
			assert.deepEqual(app.body.children.map((child) => child._id), [APPS.childB]);
		});
	});

	it('404s another user\'s draft app exactly like a missing app, and serves it to its owner', async () => {
		const mock = createPostgrestMock(marketWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const denied = await send(base, `/api/marketplace/apps/${APPS.draftA}`, asB);
			const missing = await send(base, `/api/marketplace/apps/${IDS.missing}`, asB);
			assert.equal(denied.status, 404, denied.text);
			assert.deepEqual([denied.status, denied.body], [missing.status, missing.body]);
			assert.equal((await send(base, `/api/marketplace/apps/${APPS.draftA}`, asA)).status, 200);
		});
	});
});

describe('record note ownership', () => {
	it('keeps the first opener as owner when another member opens the same record', async () => {
		const world = teamWorld();
		world.osionos_workspace_databases = [{ workspace_id: IDS.team, db_id: DB, engine: 'postgresql', tables: ['tasks'], edges_table: null, label: 'Tasks' }];
		const mock = createPostgrestMock(world, { records: { [`${DB}/tasks`]: [{ id: 7, title: 'Row seven' }] } });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const first = await send(base, `/api/records/${DB}/tasks/7/open`, asA, { method: 'POST' });
			assert.equal(first.status, 200, first.text);
			const noteId = first.body._id;
			const second = await send(base, `/api/records/${DB}/tasks/7/open`, asB, { method: 'POST' });
			assert.equal(second.status, 200, second.text);
			assert.equal(mock.page(noteId).owner_id, IDS.userA);
			assert.equal((await send(base, `/api/pages/${noteId}`, asB)).status, 200);
			assert.equal((await send(base, `/api/pages/${noteId}`, asA)).status, 200);
		});
	});
});
