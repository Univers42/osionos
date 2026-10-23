/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-workspace-teams.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDS, createPostgrestMock, harnessConfig, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const WS = IDS.team;
const OTHER_WS = 'c2c2c2c2-3333-4333-8333-c2c2c2c2c2c2';
const OWNER = IDS.userA;
const ADMIN = 'cccccccc-3333-4333-8333-cccccccccccc';
const MEMBER = IDS.userB;
const PEER = 'dededede-3333-4333-8333-dededededede';
const STRANGER = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';
const OWNER_PERMISSIONS = ['create', 'read', 'update', 'delete', 'admin'];
const teamId = (n) => `7e7e7e7${n}-0000-4000-8000-000000000000`;
const [T1, T2, T3, T4, T5] = [1, 2, 3, 4, 5].map(teamId);
const TEAM_KEYS = ['createdAt', 'description', 'id', 'memberCount', 'myRole', 'name', 'updatedAt'];

const actors = {
	owner: sessionHeaders(config, OWNER, IDS.homeA),
	admin: sessionHeaders(config, ADMIN, 'c1c1c1c1-3333-4333-8333-c1c1c1c1c1c1', [WS]),
	member: sessionHeaders(config, MEMBER, IDS.homeB, [WS]),
	stranger: sessionHeaders(config, STRANGER, 'e1e1e1e1-5555-4555-8555-e1e1e1e1e1e1'),
};

const workspaceMember = (workspace, user, role) => ({ workspace_id: workspace, user_id: user, role, permissions: OWNER_PERMISSIONS });
const team = (id, name, workspace = WS) => ({ id, workspace_id: workspace, name, description: '', created_by: OWNER, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', archived_at: null });
const teamMember = (teamRowId, user, role = 'member') => ({ workspace_id: WS, team_id: teamRowId, user_id: user, role, added_by: OWNER, created_at: '2026-10-02T00:00:00Z' });

function world() {
	return {
		osionos_workspaces: [
			{ id: WS, owner_id: OWNER, name: 'Team', slug: 'team', visibility: 'confidential' },
			{ id: OTHER_WS, owner_id: OWNER, name: 'Second', slug: 'second', visibility: 'confidential' },
		],
		osionos_workspace_members: [
			workspaceMember(WS, OWNER, 'owner'), workspaceMember(WS, ADMIN, 'admin'),
			workspaceMember(WS, MEMBER, 'editor'), workspaceMember(WS, PEER, 'editor'),
			workspaceMember(OTHER_WS, OWNER, 'owner'),
		],
		osionos_people_directory: [{ user_id: MEMBER, display_name: 'Maya Member', profile: {} }],
		osionos_teams: [team(T1, 'design'), team(T2, 'eng'), team(T3, 'ops'), team(T4, 'sales'), team(T5, 'legal'), team(teamId(9), 'elsewhere', OTHER_WS)],
		osionos_team_members: [teamMember(T1, ADMIN), teamMember(T1, MEMBER, 'lead'), teamMember(T1, PEER), teamMember(T2, MEMBER)],
	};
}

// The mock compares a quoted cursor value with its quotes on; real PostgREST unquotes it.
const unquoteKeysetCursor = (fetchImpl) => (url, init) => fetchImpl(String(url).replace(/or=\([^&]*\)/, (found) => found.replaceAll('%22', '')), init);

/** One call against a fresh bridge. `seed` may be a world the test already shaped. */
async function call(actor, method, path, { body, seed = world(), id = WS } = {}) {
	const mock = createPostgrestMock(seed);
	const result = await withBridge(config, unquoteKeysetCursor(mock.fetchImpl), async (base) => {
		const response = await fetch(`${base}/api/workspaces/${id}${path}`, { method, headers: actors[actor], body: body === undefined ? undefined : JSON.stringify(body) });
		const text = await response.text();
		return { status: response.status, text, body: text ? JSON.parse(text) : null };
	});
	return { ...result, mock };
}

const writesTo = (mock, table) => mock.calls.filter((entry) => entry.table === table && entry.method !== 'GET');
const keysOf = (object) => Object.keys(object).sort();

describe('GET /teams', () => {
	it('answers a member the workspace teams with counts and their own role, exactly', async () => {
		const result = await call('member', 'GET', '/teams');
		assert.equal(result.status, 200, result.text);
		assert.deepEqual(keysOf(result.body), ['nextCursor', 'ok', 'teams']);
		assert.equal(result.body.nextCursor, null);
		assert.deepEqual(result.body.teams.map((entry) => entry.name), ['design', 'eng', 'ops', 'sales', 'legal']);
		for (const entry of result.body.teams) assert.deepEqual(keysOf(entry), TEAM_KEYS);
		const [design, eng, ops] = result.body.teams;
		assert.deepEqual([design.memberCount, design.myRole], [3, 'lead']);
		assert.deepEqual([eng.memberCount, eng.myRole], [1, 'member']);
		assert.deepEqual([ops.memberCount, ops.myRole], [0, null]);
		assert.equal(result.text.includes('elsewhere'), false);
	});

	it('walks teams with the cursor: every team once, in id order, ending on null', async () => {
		const seen = [];
		let cursor = null;
		for (let guard = 0; guard < 5; guard += 1) {
			const result = await call('owner', 'GET', `/teams?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
			assert.equal(result.status, 200, result.text);
			seen.push(...result.body.teams.map((entry) => entry.id));
			cursor = result.body.nextCursor;
			if (!cursor) break;
		}
		assert.deepEqual(seen, [T1, T2, T3, T4, T5]);
		assert.equal(cursor, null);
	});

	for (const [label, path] of [['teams', '/teams?cursor=not-a-cursor'], ['members', `/teams/${T1}/members?cursor=%25%25`]]) {
		it(`refuses a malformed ${label} cursor with 422`, async () => {
			const result = await call('owner', 'GET', path);
			assert.equal(result.status, 422, result.text);
		});
	}
});

describe('team writes by an owner or an admin', () => {
	for (const actor of ['owner', 'admin']) {
		it(`${actor}: creates, renames and deletes a team`, async () => {
			const created = await call(actor, 'POST', '/teams', { body: { name: '  growth  ', description: 'go' } });
			assert.equal(created.status, 201, created.text);
			assert.deepEqual(keysOf(created.body), ['ok', 'team']);
			assert.deepEqual(keysOf(created.body.team), TEAM_KEYS);
			assert.deepEqual([created.body.team.name, created.body.team.description, created.body.team.memberCount, created.body.team.myRole], ['growth', 'go', 0, null]);
			const row = created.mock.rows('osionos_teams').find((entry) => entry.name === 'growth');
			assert.equal(row.workspace_id, WS);
			assert.equal(row.created_by, actor === 'owner' ? OWNER : ADMIN);

			const renamed = await call(actor, 'PATCH', `/teams/${T2}`, { body: { name: 'platform' } });
			assert.equal(renamed.status, 200, renamed.text);
			assert.deepEqual(keysOf(renamed.body.team), TEAM_KEYS);
			assert.deepEqual([renamed.body.team.name, renamed.body.team.memberCount], ['platform', 1]);
			assert.equal(renamed.mock.rows('osionos_teams').find((entry) => entry.id === T2).name, 'platform');

			const removed = await call(actor, 'DELETE', `/teams/${T2}`);
			assert.equal(removed.status, 200, removed.text);
			assert.deepEqual(removed.body, { ok: true, deleted: true });
			assert.equal(removed.mock.rows('osionos_teams').some((entry) => entry.id === T2), false);
		});
	}

	it('adds a member, answers 200 updated on a second add, and removes them', async () => {
		const added = await call('admin', 'POST', `/teams/${T3}/members`, { body: { userId: MEMBER.toUpperCase(), role: 'lead' } });
		assert.equal(added.status, 201, added.text);
		assert.deepEqual(added.body, { ok: true, status: 'added', member: { userId: MEMBER, role: 'lead' } });
		const row = added.mock.rows('osionos_team_members').find((entry) => entry.team_id === T3);
		assert.deepEqual([row.user_id, row.workspace_id, row.added_by], [MEMBER, WS, ADMIN]);

		const again = await call('owner', 'POST', `/teams/${T1}/members`, { body: { userId: MEMBER } });
		assert.equal(again.status, 200, again.text);
		assert.deepEqual(again.body, { ok: true, status: 'updated', member: { userId: MEMBER, role: 'member' } });
		const rows = again.mock.rows('osionos_team_members').filter((entry) => entry.team_id === T1 && entry.user_id === MEMBER);
		assert.deepEqual(rows.map((entry) => entry.role), ['member']);

		const removed = await call('owner', 'DELETE', `/teams/${T1}/members/${MEMBER}`);
		assert.equal(removed.status, 200, removed.text);
		assert.deepEqual(removed.body, { ok: true, removed: true });
		assert.equal(removed.mock.rows('osionos_team_members').some((entry) => entry.team_id === T1 && entry.user_id === MEMBER), false);
	});
});

describe('who may change a team', () => {
	const writes = [
		['create a team', 'POST', '/teams', { name: 'x' }],
		['rename a team', 'PATCH', `/teams/${T1}`, { name: 'x' }],
		['delete a team', 'DELETE', `/teams/${T1}`],
		['add a member', 'POST', `/teams/${T3}/members`, { userId: PEER }],
		['remove a member', 'DELETE', `/teams/${T1}/members/${ADMIN}`],
	];
	for (const [label, method, path, body] of writes) {
		it(`a plain member cannot ${label}: 403 and nothing is written`, async () => {
			const result = await call('member', method, path, { body });
			assert.equal(result.status, 403, result.text);
			assert.equal(result.body.code, 'forbidden');
			assert.equal(writesTo(result.mock, 'osionos_teams').length + writesTo(result.mock, 'osionos_team_members').length, 0);
		});
		it(`a stranger cannot ${label}: 404 and nothing is written`, async () => {
			const result = await call('stranger', method, path, { body });
			assert.equal(result.status, 404, result.text);
			assert.equal(result.body.code, 'workspace_not_found');
			assert.equal(writesTo(result.mock, 'osionos_teams').length + writesTo(result.mock, 'osionos_team_members').length, 0);
		});
	}

	for (const path of ['/teams', `/teams/${T1}/members`]) {
		it(`a stranger cannot read ${path}`, async () => {
			const result = await call('stranger', 'GET', path);
			assert.equal(result.status, 404, result.text);
		});
	}
});

describe('validation', () => {
	it('answers a duplicate team name 409 team_exists, on create and on rename', async () => {
		const created = await call('owner', 'POST', '/teams', { body: { name: 'design' } });
		assert.equal(created.status, 409, created.text);
		assert.equal(created.body.code, 'team_exists');
		assert.equal(writesTo(created.mock, 'osionos_teams').length, 0);
		const renamed = await call('owner', 'PATCH', `/teams/${T2}`, { body: { name: 'design' } });
		assert.equal(renamed.status, 409, renamed.text);
		assert.equal(renamed.body.code, 'team_exists');
		const same = await call('owner', 'PATCH', `/teams/${T2}`, { body: { name: 'eng', description: 'kept' } });
		assert.equal(same.status, 200, same.text);
	});

	for (const [label, body] of [
		['an empty name', { name: '   ' }],
		['an 81-character name', { name: 'n'.repeat(81) }],
		['a numeric name', { name: 5 }],
		['no name', {}],
		['a description over 500 characters', { name: 'ok', description: 'd'.repeat(501) }],
	]) {
		it(`refuses ${label} with 422 invalid_field`, async () => {
			const result = await call('owner', 'POST', '/teams', { body });
			assert.equal(result.status, 422, result.text);
			assert.equal(result.body.code, 'invalid_field');
			assert.equal(writesTo(result.mock, 'osionos_teams').length, 0);
		});
	}

	it('accepts an 80-character name', async () => {
		const result = await call('owner', 'POST', '/teams', { body: { name: 'n'.repeat(80) } });
		assert.equal(result.status, 201, result.text);
	});

	it('refuses to add someone who is not a member of the workspace', async () => {
		const result = await call('owner', 'POST', `/teams/${T3}/members`, { body: { userId: STRANGER } });
		assert.equal(result.status, 422, result.text);
		assert.equal(result.body.code, 'not_a_workspace_member');
		assert.equal(writesTo(result.mock, 'osionos_team_members').length, 0);
	});

	for (const [label, body] of [['no user id', {}], ['a malformed user id', { userId: 'nope' }], ['an unknown role', { userId: PEER, role: 'owner' }]]) {
		it(`refuses ${label} with 422 invalid_field`, async () => {
			const result = await call('owner', 'POST', `/teams/${T3}/members`, { body });
			assert.equal(result.status, 422, result.text);
			assert.equal(result.body.code, 'invalid_field');
		});
	}

	it('answers 404 team_not_found for a team of another workspace and for an unknown one', async () => {
		for (const id of [teamId(9), IDS.missing]) {
			const result = await call('owner', 'DELETE', `/teams/${id}`);
			assert.equal(result.status, 404, result.text);
			assert.equal(result.body.code, 'team_not_found');
		}
	});

	it('answers 404 member_not_found when the user is not in the team', async () => {
		const result = await call('owner', 'DELETE', `/teams/${T3}/members/${PEER}`);
		assert.equal(result.status, 404, result.text);
		assert.equal(result.body.code, 'member_not_found');
	});
});

describe('GET /teams/:teamId/members', () => {
	it('answers user id, name and role, exactly; a missing directory row is "Member"', async () => {
		const result = await call('member', 'GET', `/teams/${T1}/members`);
		assert.equal(result.status, 200, result.text);
		assert.deepEqual(keysOf(result.body), ['members', 'nextCursor', 'ok']);
		assert.deepEqual(result.body.members.map(keysOf), [['addedAt', 'name', 'role', 'userId'], ['addedAt', 'name', 'role', 'userId'], ['addedAt', 'name', 'role', 'userId']]);
		const byUser = Object.fromEntries(result.body.members.map((entry) => [entry.userId, entry]));
		assert.deepEqual([byUser[MEMBER].name, byUser[MEMBER].role], ['Maya Member', 'lead']);
		assert.equal(byUser[ADMIN].name, 'Member');
	});

	it('walks members with the cursor in user id order', async () => {
		const seen = [];
		let cursor = null;
		for (let guard = 0; guard < 4; guard += 1) {
			const result = await call('owner', 'GET', `/teams/${T1}/members?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
			assert.equal(result.status, 200, result.text);
			assert.ok(result.body.members.length <= 2);
			seen.push(...result.body.members.map((entry) => entry.userId));
			cursor = result.body.nextCursor;
			if (!cursor) break;
		}
		assert.deepEqual(seen, [ADMIN, MEMBER, PEER].sort());
	});
});
