/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-write-rule.test.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The bridge decides a page write in three places (the workspace gate, the membership
// permission, the page-level rule); canWritePageRow names that decision as ONE predicate
// so the client can mirror it. This walks the whole table — membership × owner ×
// visibility × collaborators × published × permission — and asserts the real PATCH and
// DELETE routes answer 200 on exactly the rows the predicate allows.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canWritePageRow } from '../../scripts/bridge-api.mjs';
import { IDS, createPostgrestMock, harnessConfig, patch, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const ALL = ['create', 'read', 'update', 'delete', 'admin'];
const SELF = IDS.userB;
const OTHER = IDS.userA;
const WS = IDS.team;
const PAGE = 'e1e1e1e1-1111-4111-8111-e1e1e1e1e1e1';
const MEMBERS = {
	owner: { role: 'owner', permissions: ALL }, admin: { role: 'admin', permissions: ALL },
	editor: { role: 'editor', permissions: ['create', 'read', 'update'] },
	'editor+delete': { role: 'editor', permissions: ['create', 'read', 'update', 'delete'] },
	'admin-perm-only': { role: 'editor', permissions: ['read', 'admin'] },
	viewer: { role: 'viewer', permissions: ['read'] }, none: null,
};
const OWNERS = { null: null, self: SELF, other: OTHER };
const COLLABS = {
	none: [], editor: [{ userId: SELF, role: 'editor' }],
	viewer: [{ userId: SELF, role: 'viewer' }], owner: [{ userId: SELF, role: 'owner' }],
};
const VISIBILITIES = ['private', 'shared', 'public'];
const PERMISSIONS = ['update', 'delete'];
const AXES = [
	Object.entries(MEMBERS).map(([member, membership]) => ({ member, membership })),
	Object.entries(OWNERS).map(([owner, ownerId]) => ({ owner, ownerId })),
	VISIBILITIES.map((visibility) => ({ visibility })),
	Object.entries(COLLABS).map(([collab, collaborators]) => ({ collab, collaborators })),
	[false, true].map((published) => ({ published })),
	PERMISSIONS.map((permission) => ({ permission })),
];

function crossAxis(rows, axis) {
	return rows.flatMap((row) => axis.map((value) => ({ ...row, ...value })));
}

/** One entry per cell of the table: the six axes crossed, so no combination goes unvisited. */
function tableRows() {
	let rows = [{}];
	for (const axis of AXES) rows = crossAxis(rows, axis);
	return rows;
}

function pageRow({ ownerId, visibility, collaborators, published }) {
	return {
		id: PAGE, workspace_id: WS, owner_id: ownerId, visibility, collaborators, title: 't',
		parent_page_id: null, archived_at: null, properties: published ? [{ key: 'published', value: true }] : [],
		content: [], updated_at: '2026-10-01T00:00:00.000Z',
	};
}

/**
 * The status the real route answers for one table row, through the whole bridge. The mock
 * structuredClones its seed, so the DELETE removes the row from the mock's copy only — the
 * same `row` object is still the one the predicate is asked about, unedited.
 */
async function routeStatus(row, { membership, permission }) {
	const members = [
		// The caller always has a home owner row, so the membership RPC never answers []
		// for the home workspace; the team row exists, and the token lists the team, only
		// when there is a membership to give.
		{ workspace_id: IDS.homeB, user_id: SELF, role: 'owner', permissions: ALL },
		...(membership ? [{ workspace_id: WS, user_id: SELF, ...membership }] : []),
	];
	const mock = createPostgrestMock({ osionos_workspace_members: members, osionos_pages: [row], osionos_workspaces: [] }, { realWorkspaceRpc: true });
	const headers = sessionHeaders(config, SELF, IDS.homeB, membership ? [WS] : []);
	const init = permission === 'update' ? patch({ title: 'changed' }) : { method: 'DELETE' };
	const response = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/pages/${PAGE}`, headers, init));
	return response.status;
}

describe('the page write rule and the PATCH/DELETE routes answer the same', () => {
	it('the PATCH and DELETE routes answer 200 exactly when canWritePageRow allows', async () => {
		const rows = tableRows();
		const disagreements = [];
		let agreed = 0;
		let allowed = 0;
		for (const entry of rows) {
			const row = pageRow(entry);
			const status = await routeStatus(row, entry);
			const rule = canWritePageRow(row, SELF, entry.membership, entry.permission);
			if (status === 200) allowed += 1;
			if ((status === 200) === rule) agreed += 1;
			else {
				disagreements.push(`${entry.permission} member=${entry.member} owner=${entry.owner} vis=${entry.visibility}`
					+ ` collab=${entry.collab} pub=${entry.published}  status=${status} rule=${rule}`);
			}
		}
		assert.ok(allowed > 0 && allowed < rows.length, `the table must hold both answers, not just one (200 on ${allowed} of ${rows.length} rows)`);
		assert.deepEqual({ agreed, disagreements: disagreements.slice(0, 5) }, { agreed: 1008, disagreements: [] });
	});
});
