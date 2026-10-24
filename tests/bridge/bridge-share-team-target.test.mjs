/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-share-team-target.test.mjs                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * A team as a share-rule target: the writer accepts {type:'team', teamId}, keys it apart from
 * a user rule, refuses a team that is not a live team of the rule's own workspace, and the
 * per-request team read (teamIdsFor) fails closed instead of answering an empty set.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createShareRuleStore, normalizeShareRule } from '../../scripts/bridge-perms-rules.mjs';
import { createPostgrestMock, harnessConfig, patch, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const WS = '33333333-3333-4333-8333-333333333333';
const OTHER_WS = '77777777-7777-4777-8777-777777777777';
const TEAM = '88888888-8888-4888-8888-888888888888';
const CALLER = '44444444-4444-4444-8444-444444444444';
const CONFIG = { baasUrl: 'http://kong.test', serviceKey: 'svc-key' };

const teamRule = (over = {}) => ({ workspaceId: WS, resourceId: 'p1', permission: 'can_edit', target: { type: 'team', teamId: TEAM }, ...over });

/** A PostgREST double: osionos_teams rows by (id, workspace), team members, and the rule upsert. */
function fakeServer({ teams = [{ id: TEAM, workspace_id: WS, archived_at: null }], members = [], failMembers = false } = {}) {
	const calls = [];
	const fetchImpl = async (url, init = {}) => {
		const target = new URL(url);
		const table = target.pathname.split('/').pop();
		calls.push({ table, method: init.method ?? 'GET', params: target.searchParams, body: init.body ? JSON.parse(init.body) : undefined });
		if (table === 'osionos_teams') {
			const id = target.searchParams.get('id').replace('eq.', '');
			const workspace = target.searchParams.get('workspace_id').replace('eq.', '');
			return Response.json(teams.filter((team) => team.id === id && team.workspace_id === workspace && team.archived_at === null));
		}
		if (table === 'osionos_team_members') return failMembers ? new Response('boom', { status: 500 }) : Response.json(members);
		return Response.json([{ id: 'r1', workspace_id: WS, resource_type: 'page', resource_id: 'p1', target: calls.at(-1).body.target, permission: 'can_edit', explicit: true }]);
	};
	return { calls, store: createShareRuleStore({ fetchImpl, log: () => {} }) };
}

describe('the rule writer knows a team target', () => {
	it('rebuilds a team target and drops everything else on it', () => {
		const rule = normalizeShareRule(teamRule({ target: { type: 'team', teamId: TEAM.toUpperCase(), userId: 'sneaky' } }));
		assert.deepEqual(rule.target, { type: 'team', teamId: TEAM });
	});

	it('refuses a team target with no id or an oversized id (400), and an unknown type', () => {
		for (const target of [{ type: 'team' }, { type: 'team', teamId: '' }, { type: 'team', teamId: 'x'.repeat(65) }, { type: 'squad', teamId: TEAM }]) {
			assert.throws(() => normalizeShareRule(teamRule({ target })), (error) => error.status === 400, JSON.stringify(target));
		}
	});

	it('keys a team rule apart from a user rule with the same id, within the 200-char column', () => {
		const team = normalizeShareRule(teamRule());
		const user = normalizeShareRule(teamRule({ target: { type: 'user', userId: TEAM } }));
		assert.equal(team.target_key, `team:::${TEAM}`);
		assert.equal(user.target_key, `user:${TEAM}:`);
		assert.notEqual(team.target_key, user.target_key);
		assert.equal(team.target_key.length, 43);
		assert.ok(normalizeShareRule(teamRule({ target: { type: 'team', teamId: 't'.repeat(64) } })).target_key.length <= 200);
	});

	it('keeps the stored 3-part key of user and role rules, so a re-save still replaces them', () => {
		assert.equal(normalizeShareRule(teamRule({ target: { type: 'user', userId: 'u1' } })).target_key, 'user:u1:');
		assert.equal(normalizeShareRule(teamRule({ target: { type: 'role', role: 'viewer' } })).target_key, 'role::viewer');
	});
});

describe('a team rule is written only for a live team of its workspace (C23)', () => {
	it('writes the rule for a team of the same workspace', async () => {
		const { store, calls } = fakeServer();
		const saved = await store.upsert(CONFIG, normalizeShareRule(teamRule()));
		assert.deepEqual(saved.target, { type: 'team', teamId: TEAM });
		const lookup = calls.find((call) => call.table === 'osionos_teams');
		assert.equal(lookup.params.get('workspace_id'), `eq.${WS}`);
		assert.equal(lookup.params.get('archived_at'), 'is.null');
	});

	it('refuses an unknown team and a team of another workspace with 422 team_not_found, writing nothing', async () => {
		const foreign = fakeServer({ teams: [{ id: TEAM, workspace_id: OTHER_WS, archived_at: null }] });
		const unknown = fakeServer({ teams: [] });
		const archived = fakeServer({ teams: [{ id: TEAM, workspace_id: WS, archived_at: '2026-10-01' }] });
		for (const { store, calls } of [foreign, unknown, archived]) {
			await assert.rejects(store.upsert(CONFIG, normalizeShareRule(teamRule())), (error) => error.status === 422 && error.code === 'team_not_found');
			assert.equal(calls.some((call) => call.method === 'POST'), false);
		}
	});

	it('refuses a team id that is not a uuid without a lookup', async () => {
		const { store, calls } = fakeServer();
		await assert.rejects(store.upsert(CONFIG, normalizeShareRule(teamRule({ target: { type: 'team', teamId: 'not-a-uuid' } }))), (error) => error.code === 'team_not_found');
		assert.equal(calls.length, 0);
	});

	it('does not look up a team for a user rule', async () => {
		const { store, calls } = fakeServer();
		await store.upsert(CONFIG, normalizeShareRule(teamRule({ target: { type: 'user', userId: 'u1' } })));
		assert.equal(calls.some((call) => call.table === 'osionos_teams'), false);
	});
});

describe('teamIdsFor is read per request and fails closed (C21, C22)', () => {
	it('answers the caller team ids of that workspace, lower-case, filtered by workspace and user', async () => {
		const { store, calls } = fakeServer({ members: [{ team_id: TEAM.toUpperCase() }] });
		assert.deepEqual(await store.teamIdsFor(CONFIG, WS, CALLER), [TEAM]);
		assert.equal(calls[0].params.get('workspace_id'), `eq.${WS}`);
		assert.equal(calls[0].params.get('user_id'), `eq.${CALLER}`);
	});

	it('reads again on every call: a removed member loses the team on the next request', async () => {
		let members = [{ team_id: TEAM }];
		const store = createShareRuleStore({ log: () => {}, fetchImpl: async () => Response.json(members) });
		assert.deepEqual(await store.teamIdsFor(CONFIG, WS, CALLER), [TEAM]);
		members = [];
		assert.deepEqual(await store.teamIdsFor(CONFIG, WS, CALLER), []);
	});

	it('answers null, never [], when the read fails, the table is missing or the body is broken', async () => {
		assert.equal(await fakeServer({ failMembers: true }).store.teamIdsFor(CONFIG, WS, CALLER), null);
		const missing = createShareRuleStore({ log: () => {}, fetchImpl: async () => Response.json({ code: '42P01' }, { status: 404 }) });
		assert.equal(await missing.teamIdsFor(CONFIG, WS, CALLER), null);
		const broken = createShareRuleStore({ log: () => {}, fetchImpl: async () => new Response('', { status: 200 }) });
		assert.equal(await broken.teamIdsFor(CONFIG, WS, CALLER), null);
		assert.equal(await createShareRuleStore({ log: () => {} }).teamIdsFor({}, WS, CALLER), null);
	});
});

// The real bridge over a seeded world: the team read feeds the evaluator on reads, writes and favorites.
const HTTP_CONFIG = harnessConfig();
const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const MEMBER = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const OUTSIDER = 'cccccccc-3333-4333-8333-cccccccccccc';
const HOME = 'f0000000-1111-4111-8111-f00000000f00';
const HWS = 'a1000000-1111-4111-8111-a10000000f01';
const HTEAM = '88888888-8888-4888-8888-888888888888';
const PAGES = ['c3000000-1111-4111-8111-c30000000f03', 'e5000000-1111-4111-8111-e50000000f05', 'f6000000-1111-4111-8111-f60000000f06'];
const EDITOR = { role: 'editor', permissions: ['create', 'read', 'update', 'delete'] };

const pageRow = (id) => ({
	id, workspace_id: HWS, owner_id: OWNER, visibility: 'private', title: 'Plan', collaborators: [], properties: [],
	content: [], parent_page_id: null, archived_at: null, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
});
const storedRule = (permission, target, resourceId = PAGES[0]) => ({
	id: crypto.randomUUID(), workspace_id: HWS, resource_type: 'page', resource_id: resourceId, target, permission, explicit: true,
});
const onTeam = (permission, resourceId) => storedRule(permission, { type: 'team', teamId: HTEAM }, resourceId);

async function askBridge(route, { as, rules, inTeam = [MEMBER], failMembers = false }) {
	const mock = createPostgrestMock({
		osionos_workspace_members: [HOME, HWS].flatMap((workspace_id) => [MEMBER, OUTSIDER, OWNER].map((user_id) => ({ workspace_id, user_id, ...EDITOR }))),
		osionos_pages: PAGES.map(pageRow),
		osionos_share_rules: rules,
		osionos_team_members: inTeam.map((user_id) => ({ workspace_id: HWS, user_id, team_id: HTEAM })),
		osionos_page_favorites: PAGES.map((page_id) => ({ user_id: as, page_id })),
	}, { realWorkspaceRpc: true, failWhen: (call) => failMembers && call.table === 'osionos_team_members' ? { status: 500, body: {} } : null });
	const headers = sessionHeaders(HTTP_CONFIG, as, HOME, [HWS]);
	const answer = await withBridge(HTTP_CONFIG, mock.fetchImpl, (base) => route(base, headers));
	return { ...answer, teamReads: mock.calls.filter((call) => call.table === 'osionos_team_members').length };
}
const readPage = (base, headers) => send(base, `/api/pages/${PAGES[0]}`, headers);
const writePage = (base, headers) => send(base, `/api/pages/${PAGES[0]}`, headers, patch({ title: 'changed' }));

describe('the bridge evaluates a team rule on page reads, writes and favorites', () => {
	it('a team grant reads and writes for a member, and does nothing for a non-member', async () => {
		const rules = [onTeam('can_edit')];
		assert.equal((await askBridge(readPage, { as: MEMBER, rules })).status, 200);
		assert.equal((await askBridge(writePage, { as: MEMBER, rules })).status, 200);
		assert.equal((await askBridge(readPage, { as: OUTSIDER, rules })).status, 404);
		assert.equal((await askBridge(writePage, { as: OUTSIDER, rules })).status, 404);
	});

	it('a no_access team rule blocks a member and leaves a non-member existing grant alone', async () => {
		const rules = [onTeam('no_access'), storedRule('can_view', { type: 'user', userId: MEMBER }), storedRule('can_view', { type: 'user', userId: OUTSIDER })];
		assert.equal((await askBridge(readPage, { as: MEMBER, rules })).status, 404);
		assert.equal((await askBridge(readPage, { as: OUTSIDER, rules })).status, 200);
	});

	it('fails closed when the team read fails: a team deny blocks, a team grant gives nothing', async () => {
		assert.equal((await askBridge(readPage, { as: MEMBER, rules: [onTeam('no_access')], failMembers: true })).status, 404);
		assert.equal((await askBridge(readPage, { as: MEMBER, rules: [onTeam('can_view')], failMembers: true })).status, 404);
	});

	it('does not read teams when no rule names one', async () => {
		const { teamReads } = await askBridge(readPage, { as: MEMBER, rules: [storedRule('can_view', { type: 'user', userId: MEMBER })] });
		assert.equal(teamReads, 0);
	});

	it('favorites over 3 pages read the caller teams once and keep only the granted pages', async () => {
		const rules = [onTeam('can_view', PAGES[0]), onTeam('can_view', PAGES[1]), onTeam('can_view', PAGES[2])];
		const list = (base, headers) => send(base, '/api/favorites', headers);
		const member = await askBridge(list, { as: MEMBER, rules });
		assert.deepEqual([...member.body.pageIds].sort(), [...PAGES].sort());
		assert.equal(member.teamReads, 1);
		assert.deepEqual((await askBridge(list, { as: OUTSIDER, rules })).body.pageIds, []);
	});
});
