/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-writes.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Writing a page requires reading it first: a page the caller cannot read answers
// PATCH and DELETE exactly like a missing id, whatever their workspace role, and a
// cascade (archive, restore, delete) only reaches descendants the caller can read.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, patch, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const ALL = ['create', 'read', 'update', 'delete', 'admin'];
const ROLES = {
	'workspace owner': { userId: IDS.userA, home: IDS.homeA, role: 'owner', permissions: ALL },
	admin: { userId: 'd1d1d1d1-7777-4777-8777-d1d1d1d1d1d1', home: 'd0d0d0d0-7777-4777-8777-d0d0d0d0d0d0', role: 'admin', permissions: ALL },
	'update member': { userId: 'e1e1e1e1-7777-4777-8777-e1e1e1e1e1e1', home: 'e0e0e0e0-7777-4777-8777-e0e0e0e0e0e0', role: 'editor', permissions: ['create', 'read', 'update'] },
	viewer: { userId: 'f1f1f1f1-7777-4777-8777-f1f1f1f1f1f1', home: 'f0f0f0f0-7777-4777-8777-f0f0f0f0f0f0', role: 'viewer', permissions: ['read'] },
};
const WRITES = {
	'content PATCH': patch({ content: [{ id: 'x', type: 'paragraph', content: 'overwritten' }] }),
	archivedAt: patch({ archivedAt: '2026-10-13T00:00:00.000Z' }),
	'archivedAt:null': patch({ archivedAt: null }),
	parentPageId: patch({ parentPageId: IDS.sharedA }),
	DELETE: { method: 'DELETE' },
};
const CHILD = { mine: 'a6a6a6a6-1111-4111-8111-a6a6a6a6a6a6', foreign: 'b6b6b6b6-2222-4222-8222-b6b6b6b6b6b6' };
const CONTENT = [{ id: 'outbox-b1', type: 'paragraph', content: 'saved by the outbox' }];

function rolesWorld() {
	const world = teamWorld();
	for (const { userId, role, permissions } of Object.values(ROLES).slice(1)) {
		world.osionos_workspace_members.push({ workspace_id: IDS.team, user_id: userId, role, permissions });
	}
	return world;
}

function childPage(id, ownerId, archivedAt) {
	return {
		id, workspace_id: IDS.team, owner_id: ownerId, visibility: 'private', parent_page_id: IDS.sharedA, title: `child ${id.slice(0, 4)}`,
		collaborators: [], properties: [], content: [], archived_at: archivedAt, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
	};
}

/** The client outbox's PATCH body (src/store/sync/pageOutbox.ts pageToPatchBody). */
function outboxBody(visibility) {
	return {
		title: 'Edited through the outbox', parentPageId: null, sortOrder: null, workspaceId: IDS.team, visibility,
		icon: null, cover: null, properties: [], updatedAt: '2026-10-13T09:00:00.000Z', content: CONTENT,
	};
}

describe('a page the caller cannot read answers writes like a missing id', () => {
	for (const [roleName, { userId, home }] of Object.entries(ROLES)) {
		for (const [writeName, init] of Object.entries(WRITES)) {
			it(`${roleName}: ${writeName} on another member's private page`, async () => {
				const mock = createPostgrestMock(rolesWorld());
				const before = structuredClone(mock.rows('osionos_pages'));
				const headers = sessionHeaders(config, userId, home);
				await withBridge(config, mock.fetchImpl, async (base) => {
					const denied = await send(base, `/api/pages/${IDS.pageB}`, headers, init);
					const missing = await send(base, `/api/pages/${IDS.missing}`, headers, init);
					assert.equal(denied.status, 404, denied.text);
					assert.deepEqual([denied.status, denied.body], [missing.status, missing.body]);
					assert.deepEqual(mock.rows('osionos_pages'), before);
				});
			});
		}
	}
});

describe('editors keep saving pages they can read through the outbox', () => {
	const cases = [
		['an update member on a shared page', IDS.sharedA, [IDS.userB, IDS.homeB], (world) => world],
		['an update member who is an editor collaborator on a private page', IDS.privateA, [IDS.userB, IDS.homeB], (world) => {
			world.osionos_pages.find((row) => row.id === IDS.privateA).collaborators = [{ userId: IDS.userB, role: 'editor' }];
			return world;
		}],
		['the owner with an upper-case token id', IDS.privateA, [IDS.userA.toUpperCase(), IDS.homeA], (world) => world],
	];
	for (const [name, pageId, [userId, home], shape] of cases) {
		it(`stores the full outbox body from ${name}`, async () => {
			const mock = createPostgrestMock(shape(teamWorld({ memberRole: 'editor' })));
			const visibility = mock.page(pageId).visibility;
			await withBridge(config, mock.fetchImpl, async (base) => {
				const saved = await send(base, `/api/pages/${pageId}`, sessionHeaders(config, userId, home), patch(outboxBody(visibility)));
				assert.equal(saved.status, 200, saved.text);
				assert.deepEqual(mock.page(pageId).content, CONTENT);
			});
		});
	}
});

describe('cascades reach only the descendants the caller can read', () => {
	const cascadeWorld = () => {
		const world = teamWorld();
		world.osionos_pages.push(childPage(CHILD.mine, IDS.userA, null), childPage(CHILD.foreign, IDS.userB, '2026-10-02T00:00:00.000Z'));
		return world;
	};
	const asA = sessionHeaders(config, IDS.userA, IDS.homeA);
	const writesTouching = (mock, id) => mock.calls.filter((call) => call.method !== 'GET' && call.table === 'osionos_pages' && String(call.params.get('id')).includes(id));
	const authFetch = (mock) => mock.calls.find((call) => call.method === 'GET' && String(call.params.get('id')).startsWith('in.('));

	it('archives and restores the readable child, never the unreadable one', async () => {
		const mock = createPostgrestMock(cascadeWorld());
		const foreign = structuredClone(mock.page(CHILD.foreign));
		await withBridge(config, mock.fetchImpl, async (base) => {
			assert.equal((await send(base, `/api/pages/${IDS.sharedA}`, asA, patch({ archivedAt: '2026-10-13T00:00:00.000Z' }))).status, 200);
			assert.equal(mock.page(CHILD.mine).archived_at, '2026-10-13T00:00:00.000Z');
			assert.equal((await send(base, `/api/pages/${IDS.sharedA}`, asA, patch({ archivedAt: null }))).status, 200);
			assert.equal(mock.page(CHILD.mine).archived_at, null);
			assert.deepEqual(mock.page(CHILD.foreign), foreign);
			assert.deepEqual(writesTouching(mock, CHILD.foreign), []);
			assert.deepEqual(authFetch(mock).params.get('id').slice(4, -1).split(',').sort(), [CHILD.mine, CHILD.foreign].sort());
		});
	});

	it('deletes the page and its readable child, never the unreadable one', async () => {
		const mock = createPostgrestMock(cascadeWorld());
		const foreign = structuredClone(mock.page(CHILD.foreign));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const deleted = await send(base, `/api/pages/${IDS.sharedA}`, asA, { method: 'DELETE' });
			assert.equal(deleted.status, 200, deleted.text);
			assert.deepEqual(deleted.body.deletedIds.sort(), [IDS.sharedA, CHILD.mine].sort());
			assert.deepEqual(mock.page(CHILD.foreign), foreign);
			assert.deepEqual(writesTouching(mock, CHILD.foreign), []);
		});
	});
});

describe('page owners are matched case-insensitively', () => {
	it('lets a viewer whose token id is upper-case edit and delete their own private page', async () => {
		const mock = createPostgrestMock(teamWorld());
		const asUpperB = sessionHeaders(config, IDS.userB.toUpperCase(), IDS.homeB);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const edited = await send(base, `/api/pages/${IDS.pageB}`, asUpperB, patch({ content: CONTENT }));
			assert.equal(edited.status, 200, edited.text);
			assert.deepEqual(mock.page(IDS.pageB).content, CONTENT);
			const deleted = await send(base, `/api/pages/${IDS.pageB}`, asUpperB, { method: 'DELETE' });
			assert.equal(deleted.status, 200, deleted.text);
			assert.equal(mock.page(IDS.pageB), undefined);
		});
	});
});
