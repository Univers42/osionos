/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-workspace-roster.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// G6 F9 + F10: the member roster is read only after the caller passes the membership gate,
// and GET /api/workspaces/:id follows live membership, not the list frozen into the token.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA);
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);

function world({ bIsMember }) {
	const members = [{ workspace_id: IDS.team, user_id: IDS.userA, role: 'owner', permissions: ['read'] }];
	if (bIsMember) members.push({ workspace_id: IDS.team, user_id: IDS.userB, role: 'member', permissions: ['read'] });
	return createPostgrestMock({
		osionos_workspaces: [{ id: IDS.team, owner_id: IDS.userA, name: 'Team', slug: 'team' }],
		osionos_workspace_members: members,
	}, { realWorkspaceRpc: true });
}

describe('GET /api/workspaces/:id/members', () => {
	it('refuses a stranger before the roster is read', async () => {
		const mock = world({ bIsMember: false });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const denied = await send(base, `/api/workspaces/${IDS.team}/members`, asB);
			assert.equal(denied.status, 403, denied.text);
			const rosterReads = mock.calls.filter((call) => call.table === 'osionos_workspace_members' && !call.params.has('user_id'));
			assert.deepEqual(rosterReads, []);
		});
	});

	it('lists the roster for a member', async () => {
		await withBridge(config, world({ bIsMember: true }).fetchImpl, async (base) => {
			const listed = await send(base, `/api/workspaces/${IDS.team}/members`, asB);
			assert.equal(listed.status, 200, listed.text);
			assert.equal(listed.body.members.length, 2);
		});
	});
});

describe('GET /api/workspaces/:id', () => {
	it('answers a member whose token predates the membership', async () => {
		await withBridge(config, world({ bIsMember: true }).fetchImpl, async (base) => {
			const found = await send(base, `/api/workspaces/${IDS.team}`, asB);
			assert.equal(found.status, 200, found.text);
			assert.equal(found.body._id ?? found.body.id, IDS.team);
		});
	});

	it('still refuses a stranger', async () => {
		await withBridge(config, world({ bIsMember: false }).fetchImpl, async (base) => {
			assert.equal((await send(base, `/api/workspaces/${IDS.team}`, asB)).status, 403);
		});
	});

	it('still answers the owner', async () => {
		await withBridge(config, world({ bIsMember: false }).fetchImpl, async (base) => {
			assert.equal((await send(base, `/api/workspaces/${IDS.team}`, asA)).status, 200);
		});
	});
});
