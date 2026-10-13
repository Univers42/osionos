/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-workspace-gate.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The workspace gate behind a page write decides from the caller's own membership row,
// not from the workspaces their app token happens to list: a token that lists a team
// workspace grants no rights of its own, so when the member row cannot be read the
// write is refused and nothing is stored. The page owner keeps editing their own page
// through the owner path, which never consults the membership.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requireWorkspaceAccess } from '../../scripts/bridge-api.mjs';
import { IDS, createPostgrestMock, harnessConfig, patch, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const WORKSPACE_RPC = 'rpc/osionos_bridge_list_workspaces';
const asA = sessionHeaders(config, IDS.userA, IDS.homeA, [IDS.team]);
const asB = sessionHeaders(config, IDS.userB, IDS.homeB, [IDS.team]);

/** A owns the team workspace and B is its viewer member; `memberRow: false` drops B's row. */
function gateWorld({ memberRow = true } = {}) {
	const world = teamWorld();
	if (!memberRow) world.osionos_workspace_members = world.osionos_workspace_members.filter((row) => row.user_id !== IDS.userB);
	return world;
}

const workspaceRpcDown = (call) => (call.table === WORKSPACE_RPC ? { status: 503 } : null);

/** The seeded member rows answer the workspace RPC, as the database function does. */
function gateMock(world, failWhen = () => null) {
	return createPostgrestMock(world, { failWhen, realWorkspaceRpc: true });
}

describe('the workspace gate refuses a page write whose membership it cannot read', () => {
	it('a viewer whose token lists the team workspace cannot write when membership cannot be read', async () => {
		const mock = gateMock(gateWorld(), workspaceRpcDown);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const patched = await send(base, `/api/pages/${IDS.sharedA}`, asB, patch({ title: 'B wrote this' }));
			assert.equal(patched.status, 503, patched.text);
			assert.equal(mock.page(IDS.sharedA).title, 'Team notes');
			const deleted = await send(base, `/api/pages/${IDS.sharedA}`, asB, { method: 'DELETE' });
			assert.equal(deleted.status, 503, deleted.text);
			assert.notEqual(mock.page(IDS.sharedA), undefined);
		});
	});

	it('a viewer is refused when membership reads normally', async () => {
		const mock = gateMock(gateWorld());
		const response = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/pages/${IDS.sharedA}`, asB, patch({ title: 'B wrote this' })));
		assert.equal(response.status, 403, response.text);
		assert.equal(mock.page(IDS.sharedA).title, 'Team notes');
	});

	it('a member row missing for the target workspace refuses', async () => {
		const mock = gateMock(gateWorld({ memberRow: false }));
		const response = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/pages/${IDS.sharedA}`, asB, patch({ title: 'B wrote this' })));
		assert.equal(response.status, 403, response.text);
		assert.equal(mock.page(IDS.sharedA).title, 'Team notes');
	});

	it('the page owner writes their own page while membership cannot be read', async () => {
		const mock = gateMock(gateWorld(), workspaceRpcDown);
		const response = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/pages/${IDS.sharedA}`, asA, patch({ title: 'A wrote this' })));
		assert.equal(response.status, 200, response.text);
		assert.equal(mock.page(IDS.sharedA).title, 'A wrote this');
	});

	it('without a configured BaaS the token workspaces are still granted', async () => {
		const access = await requireWorkspaceAccess({ headers: asB }, IDS.team, 'update', { ...config, serviceKey: '' }, async () => {
			throw new Error('the gate contacted the backend without a service key');
		});
		assert.equal(access.role, 'owner');
		assert.equal(access.workspaceId, IDS.team);
	});
});
