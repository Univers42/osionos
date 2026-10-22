/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-unowned-legacy-page.test.mjs                  :+:      :+:    :+:   */
/*                                                    +#+#+#+#+#+   +#+           */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A page with no owner was writable by anybody the workspace gate let through:
// the bridge's mayModifyPage answered "yes" for an owner_id IS NULL row, so a
// membership carrying 'admin' but not 'update'/'delete' wrote a page nobody could
// re-share, restore or take back. An ownerless page now answers like an owned one —
// the ordinary rule: the page owner, a workspace owner/admin, a membership carrying
// the route's permission, or an explicit editor/owner collaborator.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, patch, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const ALL = ['create', 'read', 'update', 'delete', 'admin'];
const SELF = IDS.userB;
const WS = IDS.team;
const PAGE = 'e1e1e1e1-1111-4111-8111-e1e1e1e1e1e1';
const WRITE = { update: patch({ title: 'changed' }), delete: { method: 'DELETE' } };

/** The ownerless page: no owner, shared with its workspace, so it is READABLE and writable only by the rule. */
function ownerlessPage(collaborators = []) {
	return {
		id: PAGE, workspace_id: WS, owner_id: null, visibility: 'shared', collaborators,
		title: 'Legacy page', parent_page_id: null, archived_at: null, properties: [], content: [],
		created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
	};
}

/** The caller's home workspace is always an owner row; the team row is the membership under test. */
function world(membership, collaborators = []) {
	return {
		osionos_workspace_members: [
			{ workspace_id: IDS.homeB, user_id: SELF, role: 'owner', permissions: ALL },
			{ workspace_id: WS, user_id: SELF, ...membership },
		],
		osionos_pages: [ownerlessPage(collaborators)],
		osionos_workspaces: [],
	};
}

/** One PATCH or DELETE against the ownerless page, through the whole bridge. */
async function write(membership, permission, collaborators = []) {
	const mock = createPostgrestMock(world(membership, collaborators), { realWorkspaceRpc: true });
	const before = structuredClone(mock.rows('osionos_pages'));
	const headers = sessionHeaders(config, SELF, IDS.homeB, [WS]);
	const response = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/pages/${PAGE}`, headers, WRITE[permission]));
	return { ...response, rows: mock.rows('osionos_pages'), before };
}

const ADMIN_ONLY = { role: 'editor', permissions: ['read', 'admin'] };
const UPDATE_ONLY = { role: 'editor', permissions: ['create', 'read', 'update'] };
const WORKSPACE_OWNER = { role: 'owner', permissions: ALL };
const WORKSPACE_ADMIN = { role: 'admin', permissions: ALL };

describe('an ownerless page follows the ordinary page write rule', () => {
	it('an admin-only membership may not PATCH it', async () => {
		const response = await write(ADMIN_ONLY, 'update');
		assert.equal(response.status, 403, response.text);
		assert.deepEqual(response.body, { ok: false, message: 'You do not have permission to modify this page.' });
	});

	it('an admin-only membership may not DELETE it', async () => {
		const response = await write(ADMIN_ONLY, 'delete');
		assert.equal(response.status, 403, response.text);
		assert.deepEqual(response.body, { ok: false, message: 'You do not have permission to modify this page.' });
	});

	it('a refusal leaves the page row untouched', async () => {
		for (const permission of ['update', 'delete']) {
			const response = await write(ADMIN_ONLY, permission);
			assert.equal(response.status, 403, response.text);
			assert.deepEqual(response.rows, response.before, `${permission} changed the row`);
		}
	});

	it('a membership carrying update still PATCHes it', async () => {
		const response = await write(UPDATE_ONLY, 'update');
		assert.equal(response.status, 200, response.text);
	});

	it('a workspace owner still PATCHes it', async () => {
		const response = await write(WORKSPACE_OWNER, 'update');
		assert.equal(response.status, 200, response.text);
	});

	it('a workspace admin still PATCHes it', async () => {
		const response = await write(WORKSPACE_ADMIN, 'update');
		assert.equal(response.status, 200, response.text);
	});

	it('an explicit editor collaborator still PATCHes it', async () => {
		const response = await write(ADMIN_ONLY, 'update', [{ userId: SELF, role: 'editor' }]);
		assert.equal(response.status, 200, response.text);
	});

	it('an explicit owner collaborator still PATCHes it', async () => {
		const response = await write(ADMIN_ONLY, 'update', [{ userId: SELF, role: 'owner' }]);
		assert.equal(response.status, 200, response.text);
	});
});

describe('an ownerless page is read like an owned one', () => {
	async function readPage(ownerId, visibility) {
		const mock = createPostgrestMock({
			osionos_workspace_members: [
				{ workspace_id: IDS.homeB, user_id: SELF, role: 'owner', permissions: ALL },
				{ workspace_id: WS, user_id: SELF, ...ADMIN_ONLY },
			],
			osionos_pages: [{ ...ownerlessPage(), owner_id: ownerId, visibility }],
			osionos_workspaces: [],
		}, { realWorkspaceRpc: true });
		const headers = sessionHeaders(config, SELF, IDS.homeB, [WS]);
		return withBridge(config, mock.fetchImpl, (base) => send(base, `/api/pages/${PAGE}`, headers));
	}

	it('a private ownerless page is a 404, exactly like a private owned one', async () => {
		const ownerless = await readPage(null, 'private');
		const owned = await readPage(IDS.userA, 'private');
		assert.equal(ownerless.status, 404, ownerless.text);
		assert.deepEqual([ownerless.status, ownerless.body], [owned.status, owned.body]);
	});
});
