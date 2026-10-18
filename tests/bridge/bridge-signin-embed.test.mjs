/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-signin-embed.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Sign-in reads the user's member workspaces in ONE members -> workspace statement, anchored
// on user_id. The claims it mints are authorization on two routes, so every test below is about
// what that statement may let into the token (devil-SC S1-2, S1-3, S1-5, S1-6, S1-7).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { memberWorkspaceEntries } from '../../scripts/bridge-api.mjs';
import { readEmbed } from './support/embed-postgrest.mjs';
import { SUBJECT, PRIVATE_ID, createSigninStub, signIn, signinConfig, workspaceRow } from './support/signin-world.mjs';

const ALL_PERMISSIONS = ['create', 'read', 'update', 'delete', 'admin'];
const ORG = 'b1a0b1a0-0000-4000-8000-0000000000b1';
const TEAM = 'c2b1c2b1-0000-4000-8000-0000000000c2';
const OTHER_USER = 'f5e4f5e4-0000-4000-8000-0000000000f5';
const EMBED_SELECT = 'user_id,workspace_id,role,permissions,workspace:osionos_workspaces!workspace_id(id,owner_id,name,slug,settings,created_at,updated_at)';
const WARN_PREFIX = '[osionos-bridge] member workspaces unavailable';

const member = (workspaceId, role, permissions, userId = SUBJECT) => ({ workspace_id: workspaceId, user_id: userId, role, permissions });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const isEmbed = (entry) => entry.kind === 'embed';

function world(workspaces, members) {
	return {
		identities: [{ provider: 'prismatica', subject: SUBJECT, email_hash: 'unused', is_admin: false, workspace_id: PRIVATE_ID }],
		osionos_workspaces: [workspaceRow(PRIVATE_ID, SUBJECT, 'Home', '2026-10-01T00:00:00.000Z'), ...workspaces],
		osionos_workspace_members: [member(PRIVATE_ID, 'owner', ALL_PERMISSIONS), ...members],
	};
}

function spyOnWarn(t) {
	const lines = [];
	t.mock.method(console, 'warn', (...args) => { lines.push(args.join(' ')); });
	return lines;
}

describe('sign-in member workspaces: one anchored embed', () => {
	it('an ordinary sign-in makes one embed read and no ids read and no list rpc', async () => {
		const stub = createSigninStub(world([workspaceRow(ORG, OTHER_USER, 'Org', '2026-10-05T00:00:00.000Z')], [member(ORG, 'editor', ['read', 'update'])]));
		await signIn(stub);
		const reads = stub.log.filter((entry) => entry.name === 'osionos_workspace_members');
		assert.equal(reads.length, 1);
		assert.equal(reads[0].method, 'GET');
		assert.equal(reads[0].params.get('user_id'), `eq.${SUBJECT}`);
		assert.equal(reads[0].params.get('select'), EMBED_SELECT);
		assert.equal(stub.log.filter((entry) => entry.kind === 'rpc-list').length, 0);
		assert.equal(stub.log.filter((entry) => entry.kind === 'members-ids').length, 0);
		assert.deepEqual(stub.mock.stubErrors, []);
	});

	it('sign-in ignores a member embed that answers another user\'s rows', async (t) => {
		const warnings = spyOnWarn(t);
		const foreign = { ...member(ORG, 'owner', ALL_PERMISSIONS, OTHER_USER), workspace: workspaceRow(ORG, OTHER_USER, 'Org', '2026-10-05T00:00:00.000Z') };
		const own = { ...member(TEAM, 'editor', ['read']), workspace: workspaceRow(TEAM, OTHER_USER, 'Team', '2026-10-06T00:00:00.000Z') };
		const stub = createSigninStub(world([], []), { fail: (entry) => (isEmbed(entry) ? json([own, foreign]) : undefined) });
		const { claims } = await signIn(stub);
		assert.deepEqual(claims.raw.workspace_ids, [PRIVATE_ID]);
		assert.deepEqual(claims.roles, { [PRIVATE_ID]: 'owner' });
		const mine = warnings.filter((line) => line.startsWith(WARN_PREFIX));
		assert.equal(mine.length, 1);
		assert.ok(!mine[0].includes(OTHER_USER) && !mine[0].includes(SUBJECT) && !mine[0].includes(ORG), 'the warning names no id');
	});

	it('a row without a user_id is not the user\'s', async (t) => {
		spyOnWarn(t);
		const anonymous = { workspace_id: ORG, role: 'owner', permissions: ALL_PERMISSIONS, workspace: workspaceRow(ORG, OTHER_USER, 'Org', '2026-10-05T00:00:00.000Z') };
		const stub = createSigninStub(world([], []), { fail: (entry) => (isEmbed(entry) ? json([anonymous]) : undefined) });
		assert.deepEqual((await signIn(stub)).claims.raw.workspace_ids, [PRIVATE_ID]);
	});

	it('drops a member row whose workspace is null or names another id', async () => {
		const orphan = { ...member(ORG, 'editor', ['read']), workspace: null };
		const swapped = { ...member(TEAM, 'editor', ['read']), workspace: workspaceRow(ORG, OTHER_USER, 'Org', '2026-10-05T00:00:00.000Z') };
		const stub = createSigninStub(world([], []), { fail: (entry) => (isEmbed(entry) ? json([orphan, swapped]) : undefined) });
		assert.deepEqual((await signIn(stub)).claims.raw.workspace_ids, [PRIVATE_ID]);
	});

	it('drops a workspace id that is not a UUID', async () => {
		const stub = createSigninStub(world(
			[workspaceRow('legacy-workspace', OTHER_USER, 'Legacy', '2026-10-05T00:00:00.000Z'), workspaceRow(ORG, OTHER_USER, 'Org', '2026-10-04T00:00:00.000Z')],
			[member('legacy-workspace', 'editor', ['read']), member(ORG, 'editor', ['read'])],
		));
		const { claims, session } = await signIn(stub);
		assert.deepEqual(claims.raw.workspace_ids, [PRIVATE_ID, ORG]);
		assert.deepEqual(session.sharedWorkspaces.map((workspace) => workspace._id), [ORG]);
	});

	it('orders by instant, not by text', async () => {
		// 01:00+02:00 is 23:00Z on the 8th: older than 23:30Z, although it sorts later as text.
		const stub = createSigninStub(world(
			[workspaceRow(ORG, OTHER_USER, 'Org', '2026-10-09T01:00:00+02:00'), workspaceRow(TEAM, OTHER_USER, 'Team', '2026-10-08T23:30:00Z')],
			[member(ORG, 'editor', ['read']), member(TEAM, 'editor', ['read'])],
		));
		const { claims } = await signIn(stub);
		assert.deepEqual(claims.raw.workspace_ids, [PRIVATE_ID, TEAM, ORG]);
	});

	it('a refused embed mints a private-only token and says why, without an email or an id', async (t) => {
		const warnings = spyOnWarn(t);
		const stub = createSigninStub(world([workspaceRow(ORG, OTHER_USER, 'Org', '2026-10-05T00:00:00.000Z')], [member(ORG, 'editor', ['read'])]), {
			fail: (entry) => (isEmbed(entry) ? json({ message: 'blocked' }, 403) : undefined),
		});
		const { claims } = await signIn(stub, { email: 'owner@example.com' });
		assert.deepEqual(claims.raw.workspace_ids, [PRIVATE_ID]);
		assert.deepEqual(warnings.filter((line) => line.startsWith('[osionos-bridge] member')), [`${WARN_PREFIX}: 403`]);
		assert.ok(!warnings.some((line) => line.includes('owner@example.com') || line.includes(SUBJECT) || line.includes(ORG)));
	});
});

describe('memberWorkspaceEntries, exported for the S1-8 deploy probe', () => {
	it('answers the entries of one user, newest first, in one read, and [] for a stranger', async () => {
		const stub = createSigninStub(world(
			[workspaceRow(ORG, OTHER_USER, 'Org', '2026-10-05T00:00:00.000Z'), workspaceRow(TEAM, OTHER_USER, 'Team', '2026-10-06T00:00:00.000Z')],
			[member(ORG, 'editor', ['read', 'update']), member(TEAM, 'viewer', ['read'])],
		));
		const entries = await memberWorkspaceEntries(SUBJECT, [PRIVATE_ID], signinConfig(), stub.fetchImpl);
		assert.deepEqual(entries.map((entry) => [entry._id, entry.role, entry.permissions]), [[TEAM, 'viewer', ['read']], [ORG, 'editor', ['read', 'update']]]);
		assert.equal(stub.log.length, 1);
		assert.deepEqual(await memberWorkspaceEntries(OTHER_USER, [], signinConfig(), stub.fetchImpl), []);
	});
});

describe('sign-in without BaaS configured', () => {
	it('reads nothing and warns about nothing', async (t) => {
		const warnings = spyOnWarn(t);
		const stub = createSigninStub(world([], []));
		const config = signinConfig({ OSIONOS_BAAS_URL: '', KONG_SERVICE_API_KEY: '', OSIONOS_BRIDGE_PERSISTENCE: 'memory' });
		const { claims } = await signIn(stub, { config });
		assert.equal(claims.raw.workspace_ids.length, 1);
		assert.deepEqual(stub.log, []);
		assert.deepEqual(warnings, []);
	});
});

describe('the strict embed stub declares the workspace columns the sign-in select emits', () => {
	const tables = { osionos_workspace_members: [member(ORG, 'editor', ['read'])], osionos_workspaces: [workspaceRow(ORG, OTHER_USER, 'Org', '2026-10-05T00:00:00.000Z')] };
	const table = (name) => tables[name] ?? [];

	it('answers exactly the emitted select', () => {
		const mine = readEmbed('osionos_workspace_members', new URLSearchParams({ user_id: `eq.${SUBJECT}`, select: EMBED_SELECT }), table);
		assert.deepEqual(mine, [{ user_id: SUBJECT, workspace_id: ORG, role: 'editor', permissions: ['read'], workspace: { id: ORG, owner_id: OTHER_USER, name: 'Org', slug: 'org', settings: { plan: 'Team' }, created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-10-05T00:00:00.000Z' } }]);
	});

	it('throws on a workspace column it does not declare', () => {
		const select = 'user_id,workspace:osionos_workspaces!workspace_id(id,deleted_at)';
		assert.throws(() => readEmbed('osionos_workspace_members', new URLSearchParams({ user_id: `eq.${SUBJECT}`, select }), table), /deleted_at is not declared/);
	});

	it('throws on an unhinted relationship', () => {
		const select = 'user_id,workspace:osionos_workspaces!owner_id(id)';
		assert.throws(() => readEmbed('osionos_workspace_members', new URLSearchParams({ user_id: `eq.${SUBJECT}`, select }), table), /no relationship/);
	});
});
