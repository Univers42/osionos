/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   membership-world.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Seeds and helpers for the membership-in-statement tests (ADR 0004). Membership comes
// from seeded osionos_workspace_members rows only: these tests never use the harness's
// owner-for-every-workspace RPC default, and the embed stub is the strict one.

import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, sessionHeaders, teamWorld, withBridge } from './bridge-harness.mjs';

export const config = harnessConfig();
export const OUTSIDER = { userId: 'cccccccc-5555-4555-8555-cccccccccccc', home: 'c1c1c1c1-5555-4555-8555-c1c1c1c1c1c1' };
export const OTHER_WORKSPACE = 'd0d0d0d0-6666-4666-8666-d0d0d0d0d0d0';
export const OTHER_PAGE = 'e1e1e1e1-6666-4666-8666-e1e1e1e1e1e1';
export const ALL_PERMISSIONS = ['create', 'read', 'update', 'delete', 'admin'];

/** teamWorld (A owns the team workspace, B is a viewer) plus a second workspace the outsider owns. */
export function membershipWorld({ memberRole = 'viewer' } = {}) {
	const world = teamWorld({ memberRole });
	world.osionos_workspaces = [{ id: IDS.team }, { id: OTHER_WORKSPACE }];
	world.osionos_workspace_members.push({ workspace_id: OTHER_WORKSPACE, user_id: OUTSIDER.userId, role: 'owner', permissions: ALL_PERMISSIONS });
	world.osionos_pages.push({
		id: OTHER_PAGE, workspace_id: OTHER_WORKSPACE, owner_id: OUTSIDER.userId, visibility: 'shared', title: 'Other workspace', collaborators: [],
		properties: [], parent_page_id: null, archived_at: null, content: [], created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
	});
	return world;
}

/** Every page id of a seed: none may appear in a denial body. */
export const pageIdsOf = (world) => world.osionos_pages.map((page) => page.id);

export function assertNoPageIds(result, world) {
	for (const id of pageIdsOf(world)) assert.ok(!result.text.includes(id), `denial body leaks page id ${id}: ${result.text}`);
}

export const asB = (memberWorkspaces = [IDS.team]) => sessionHeaders(config, IDS.userB, IDS.homeB, memberWorkspaces);
export const asA = (memberWorkspaces = [IDS.team]) => sessionHeaders(config, IDS.userA, IDS.homeA, memberWorkspaces);
export const asOutsider = (memberWorkspaces = []) => sessionHeaders(config, OUTSIDER.userId, OUTSIDER.home, memberWorkspaces);

/** Remove a workspace and what the FKs cascade with it (members, pages). */
export function deleteWorkspace(mock, workspaceId) {
	for (const name of ['osionos_workspace_members', 'osionos_pages', 'osionos_workspaces']) {
		const rows = mock.rows(name);
		const keep = rows.filter((row) => (row.workspace_id ?? row.id) !== workspaceId);
		rows.splice(0, rows.length, ...keep);
	}
}

export function removeMember(mock, workspaceId, userId) {
	const rows = mock.rows('osionos_workspace_members');
	const keep = rows.filter((row) => !(row.workspace_id === workspaceId && row.user_id === userId));
	rows.splice(0, rows.length, ...keep);
}

export function setMemberPermissions(mock, workspaceId, userId, permissions) {
	const row = mock.rows('osionos_workspace_members').find((member) => member.workspace_id === workspaceId && member.user_id === userId);
	row.permissions = permissions;
}

/**
 * Run `body(base, mock)` against a bridge over the strict stub; the stub saw no unsupported
 * shape. `mockOptions.failWhen(call, mock)` may answer a call itself or change the tables
 * before the stub reads them (a revocation landing between two requests of one call).
 */
export async function inMembershipWorld(world, mockOptions, body, serverOptions) {
	const failWhen = mockOptions.failWhen && ((call) => mockOptions.failWhen(call, mock));
	const mock = createPostgrestMock(world, { ...mockOptions, failWhen });
	await withBridge(config, mock.fetchImpl, (base) => body(base, mock), serverOptions);
	assert.deepEqual(mock.stubErrors, [], 'the strict stub rejected a query shape');
}
