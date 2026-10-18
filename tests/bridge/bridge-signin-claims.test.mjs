/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-signin-claims.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Characterization of the claims a sign-in mints (workspace_ids, roles, is_admin) and of the
// order of its BaaS calls. Two routes trust these claims as authorization without re-reading
// membership, so this file pins what today's code answers before the reads are restructured:
// it must pass on the base and after every later change, except the one marked step below.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_WORKSPACE_ID } from '../../scripts/bridge-api.mjs';
import { SUBJECT, PRIVATE_ID, createSigninStub, hashOf, signIn, signinConfig, workspaceRow } from './support/signin-world.mjs';

const ALL_PERMISSIONS = ['create', 'read', 'update', 'delete', 'admin'];
const ORG = 'b1a0b1a0-0000-4000-8000-0000000000b1';
const TEAM = 'c2b1c2b1-0000-4000-8000-0000000000c2';
const VIEWER = 'd3c2d3c2-0000-4000-8000-0000000000d3';
const OUTSIDE = 'e4d3e4d3-0000-4000-8000-0000000000e4';
const OTHER_USER = 'f5e4f5e4-0000-4000-8000-0000000000f5';
const EMAIL = 'owner@example.com';

const member = (workspaceId, role, permissions, userId = SUBJECT) => ({ workspace_id: workspaceId, user_id: userId, role, permissions });
const home = () => workspaceRow(PRIVATE_ID, SUBJECT, 'Home', '2026-10-01T00:00:00.000Z');
const identity = (email = EMAIL, isAdmin = false) => ({ provider: 'prismatica', subject: SUBJECT, email_hash: hashOf(email), is_admin: isAdmin, workspace_id: PRIVATE_ID });

/** Private home, an org (editor), a team the user owns, a viewer workspace, and one the user is not in. */
function sharedWorld() {
	return {
		identities: [identity()],
		osionos_workspaces: [
			home(),
			workspaceRow(ORG, OTHER_USER, 'Org', '2026-10-05T00:00:00.000Z'),
			workspaceRow(TEAM, SUBJECT, 'Team', '2026-10-09T00:00:00.000Z'),
			workspaceRow(VIEWER, OTHER_USER, 'Viewer', '2026-10-07T00:00:00.000Z'),
			workspaceRow(OUTSIDE, OTHER_USER, 'Outside', '2026-10-11T00:00:00.000Z'),
		],
		osionos_workspace_members: [
			member(PRIVATE_ID, 'owner', ALL_PERMISSIONS),
			member(ORG, 'editor', ['read', 'update']),
			member(TEAM, 'admin', ['read', 'update', 'admin']),
			member(VIEWER, 'viewer', ['read']),
			member(OUTSIDE, 'owner', ALL_PERMISSIONS, OTHER_USER),
		],
	};
}

const shape = (workspace) => ({ id: workspace._id, role: workspace.role, permissions: workspace.permissions });

describe('sign-in claims', () => {
	it('sign-in claims for a member of org, team and viewer workspaces', async () => {
		const { session, claims } = await signIn(createSigninStub(sharedWorld()));
		assert.deepEqual(claims.raw.workspace_ids, [PRIVATE_ID, TEAM, VIEWER, ORG]);
		assert.deepEqual(claims.roles, { [PRIVATE_ID]: 'owner', [TEAM]: 'admin', [VIEWER]: 'viewer', [ORG]: 'editor' });
		assert.equal(claims.isAdmin, false);
		assert.deepEqual(session.privateWorkspaces.map(shape), [
			{ id: PRIVATE_ID, role: undefined, permissions: undefined },
			{ id: TEAM, role: 'admin', permissions: ['read', 'update', 'admin'] },
		]);
		assert.deepEqual(session.sharedWorkspaces.map(shape), [
			{ id: VIEWER, role: 'viewer', permissions: ['read'] },
			{ id: ORG, role: 'editor', permissions: ['read', 'update'] },
		]);
		assert.ok(!claims.raw.workspace_ids.includes(OUTSIDE), 'a workspace the user is not a member of never rides the token');
	});
});

describe('env-admin sign-in order', () => {
	it('env-admin sign-in keeps upsert → PATCH → GET is_admin → POST members → embed', async () => {
		const world = { osionos_workspaces: [workspaceRow(ADMIN_WORKSPACE_ID, OTHER_USER, 'Admin', '2026-10-02T00:00:00.000Z')] };
		const stub = createSigninStub(world);
		const { claims } = await signIn(stub, { email: 'boss@example.com' });
		const kinds = stub.kinds();
		assert.deepEqual(kinds.slice(0, 4), ['persist', 'patch-admin', 'get-admin', 'ensure']);
		// The only step that changed with the member read: ids then the RPC became one embed.
		assert.deepEqual(kinds.slice(4), ['embed']);
		assert.equal(claims.isAdmin, true);
		assert.equal(claims.roles[ADMIN_WORKSPACE_ID], 'admin');
	});
});

const BASELINES = [
	{
		name: 'a new user',
		seed: () => ({}),
		expected: { workspaceIds: [PRIVATE_ID], isAdmin: false },
	},
	{
		name: 'a returning user',
		seed: () => ({ ...sharedWorld(), osionos_workspace_members: [member(PRIVATE_ID, 'owner', ALL_PERMISSIONS), member(ORG, 'editor', ['read', 'update'])] }),
		expected: { workspaceIds: [PRIVATE_ID, ORG], isAdmin: false },
	},
	{
		name: 'a DB-recorded admin signing in with an unverified env email',
		email: 'boss@example.com',
		emailVerified: false,
		seed: () => ({ identities: [identity('boss@example.com', true)], osionos_workspaces: [home(), workspaceRow(ADMIN_WORKSPACE_ID, OTHER_USER, 'Admin', '2026-10-02T00:00:00.000Z')] }),
		expected: { workspaceIds: [PRIVATE_ID, ADMIN_WORKSPACE_ID], isAdmin: true },
	},
	{
		name: 'a DB-recorded admin whose email changed',
		email: 'new@example.com',
		options: { persistCommitsAfterReads: true },
		seed: () => ({ identities: [identity('old@example.com', true)], osionos_workspaces: [home(), workspaceRow(ADMIN_WORKSPACE_ID, OTHER_USER, 'Admin', '2026-10-02T00:00:00.000Z')] }),
		expected: { workspaceIds: [PRIVATE_ID, ADMIN_WORKSPACE_ID], isAdmin: true },
	},
	{
		name: 'a user with 3 shared workspaces',
		seed: sharedWorld,
		expected: { workspaceIds: [PRIVATE_ID, TEAM, VIEWER, ORG], isAdmin: false },
	},
];

describe('sequential claim baselines', () => {
	for (const fixture of BASELINES) {
		it(`${fixture.name}: workspace_ids and is_admin`, async () => {
			const stub = createSigninStub(fixture.seed(), fixture.options);
			const { claims } = await signIn(stub, { email: fixture.email ?? EMAIL, emailVerified: fixture.emailVerified ?? true, config: signinConfig() });
			assert.deepEqual({ workspaceIds: claims.raw.workspace_ids, isAdmin: claims.isAdmin }, fixture.expected);
		});
	}
});
