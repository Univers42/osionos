/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-parent.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A page nests only under a parent the caller can read as a member of its workspace.
// Creating under any other parent answers one 404, whatever the reason; a PATCH that
// MOVES a page there drops the parentPageId key and still writes the rest of the edit.
// A PATCH that resends the stored parent is not checked: the outbox resends it on every
// edit, and a member may edit a page whose parent they cannot read.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, patch, post, send, sessionHeaders, teamPage, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);
const OUTSIDE = 'a5a5a5a5-1111-4111-8111-a5a5a5a5a5a5';
const CHILD = 'a7a7a7a7-1111-4111-8111-a7a7a7a7a7a7';
const CONTENT = [{ id: 'edit-b1', type: 'paragraph', content: 'edited by B' }];
const BAD_PARENTS = {
	'a missing page': IDS.missing,
	'a page the caller cannot read': IDS.privateA,
	'a shared page in a workspace the caller is not a member of': OUTSIDE,
};

/** B is an `update` member of the team; OUTSIDE is A's shared page in A's own workspace. */
function parentWorld() {
	const world = teamWorld({ memberRole: 'editor' });
	world.osionos_pages.push({ ...teamPage(OUTSIDE, IDS.userA, 'shared', 'A home page', 'home text'), workspace_id: IDS.homeA });
	return world;
}

const pageWrites = (mock) => mock.calls.filter((call) => call.method !== 'GET' && call.table === 'osionos_pages');

describe('creating a page under a parent', () => {
	it('answers every parent the caller may not nest under with one identical 404 and inserts nothing', async () => {
		const mock = createPostgrestMock(parentWorld());
		const before = structuredClone(mock.rows('osionos_pages'));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answers = [];
			for (const [name, parentPageId] of Object.entries(BAD_PARENTS)) {
				const created = await send(base, '/api/pages', asB, post({ workspaceId: IDS.team, title: 'Nested', parentPageId }));
				assert.equal(created.status, 404, `${name}: ${created.text}`);
				answers.push([created.status, created.body]);
			}
			assert.deepEqual(answers[1], answers[0]);
			assert.deepEqual(answers[2], answers[0]);
			assert.deepEqual(pageWrites(mock), []);
			assert.deepEqual(mock.rows('osionos_pages'), before);
		});
	});

	it('creates a page under a parent the caller can read, and at the root', async () => {
		const mock = createPostgrestMock(parentWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const nested = await send(base, '/api/pages', asB, post({ workspaceId: IDS.team, title: 'Nested', parentPageId: IDS.sharedA }));
			assert.equal(nested.status, 201, nested.text);
			assert.equal(nested.body.parentPageId, IDS.sharedA);
			const root = await send(base, '/api/pages', asB, post({ workspaceId: IDS.team, title: 'Root', parentPageId: null }));
			assert.equal(root.status, 201, root.text);
		});
	});
});

describe('moving a page with PATCH parentPageId', () => {
	for (const [name, parentPageId] of Object.entries(BAD_PARENTS)) {
		it(`drops a move under ${name} and writes the rest of the edit`, async () => {
			const mock = createPostgrestMock(parentWorld());
			await withBridge(config, mock.fetchImpl, async (base) => {
				const moved = await send(base, `/api/pages/${IDS.pageB}`, asB, patch({ parentPageId, content: CONTENT }));
				assert.equal(moved.status, 200, moved.text);
				assert.deepEqual(moved.body.ignored, ['parentPageId']);
				assert.deepEqual([mock.page(IDS.pageB).parent_page_id, mock.page(IDS.pageB).content], [null, CONTENT]);
			});
		});
	}

	it('moves a page under a parent the caller can read', async () => {
		const mock = createPostgrestMock(parentWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const moved = await send(base, `/api/pages/${IDS.pageB}`, asB, patch({ parentPageId: IDS.sharedA }));
			assert.equal(moved.status, 200, moved.text);
			assert.equal(moved.body.ignored, undefined);
			assert.equal(mock.page(IDS.pageB).parent_page_id, IDS.sharedA);
		});
	});

	it('stores the full outbox body for a shared page whose stored parent the caller cannot read', async () => {
		const world = parentWorld();
		world.osionos_pages.push({ ...teamPage(CHILD, IDS.userA, 'shared', 'Shared child', 'child text'), parent_page_id: IDS.privateA });
		const mock = createPostgrestMock(world);
		const outboxBody = {
			title: 'Shared child', parentPageId: IDS.privateA, sortOrder: null, workspaceId: IDS.team, visibility: 'shared',
			icon: null, cover: null, properties: [], updatedAt: '2026-10-13T09:00:00.000Z', content: CONTENT,
		};
		await withBridge(config, mock.fetchImpl, async (base) => {
			const saved = await send(base, `/api/pages/${CHILD}`, asB, patch(outboxBody));
			assert.equal(saved.status, 200, saved.text);
			assert.equal(saved.body.ignored, undefined);
			assert.deepEqual([mock.page(CHILD).content, mock.page(CHILD).parent_page_id], [CONTENT, IDS.privateA]);
			assert.equal(mock.calls.some((call) => call.method === 'GET' && call.params.get('id') === `eq.${IDS.privateA}`), false);
		});
	});
});
