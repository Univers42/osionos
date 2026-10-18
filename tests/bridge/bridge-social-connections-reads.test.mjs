/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-social-connections-reads.test.mjs           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// How GET /api/connections reads: three concurrent reads (co-members embed, edges, blocks),
// then one insert only when an edge is missing, then the people summaries. The response
// bodies are pinned by bridge-social-connections.test.mjs; this file pins the calls.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { coMemberPath, coMembersFromRows, insertColleagueEdges, mergeEdgesNewestFirst } from '../../scripts/bridge-social-core.mjs';
import { createSocialStub, getConnections, uid } from './support/social-postgrest.mjs';

const ME = uid(1);
const [A, B] = [uid(11), uid(12)];
const NOW = '2026-10-19T12:00:00.000Z';
const edge = (n, requester, addressee) => ({
	id: uid(500 + n), requester_id: requester, addressee_id: addressee, status: 'accepted', source: 'manual', intro_message: null,
	created_at: `2026-10-0${n}T00:00:00.000Z`, responded_at: `2026-10-0${n}T01:00:00.000Z`,
});
const worldWith = ({ coMembers, connections = [], blocks = [] }) => ({
	members: [{ workspace_id: uid(101), user_id: ME }, ...coMembers.map((user_id) => ({ workspace_id: uid(101), user_id }))],
	connections, blocks, people: [],
});
const clock = (t) => {
	t.mock.timers.enable({ apis: ['Date'], now: Date.parse(NOW) });
	return t.mock.method(console, 'warn', () => {});
};
const unhandled = (t) => {
	const reasons = [];
	const onRejection = (reason) => reasons.push(reason);
	process.on('unhandledRejection', onRejection);
	t.after(() => process.off('unhandledRejection', onRejection));
	return reasons;
};
const settle = async () => { for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

describe('connections read plan', () => {
	it('with no new edge it makes exactly 4 BaaS calls, none by workspace_id list or limit=1000', async (t) => {
		clock(t);
		const stub = createSocialStub(worldWith({ coMembers: [A], connections: [edge(1, ME, A)] }));
		await getConnections(stub, ME);
		assert.deepEqual(stub.calls.map((call) => `${call.method} ${call.table}`), [
			'GET osionos_workspace_members', 'GET osionos_connections', 'GET osionos_user_blocks', 'GET osionos_people_directory',
		]);
		assert.equal(stub.calls.filter((call) => call.query.includes('workspace_id=in.(') || call.query.includes('workspace_id=in.%28') || call.query.includes('limit=1000')).length, 0);
	});

	it('with a new edge it makes 5 calls and the POST keeps its fields', async (t) => {
		clock(t);
		const stub = createSocialStub(worldWith({ coMembers: [A, B], connections: [edge(1, ME, A)] }));
		await getConnections(stub, ME);
		assert.deepEqual(stub.calls.map((call) => `${call.method} ${call.table}`), [
			'GET osionos_workspace_members', 'GET osionos_connections', 'GET osionos_user_blocks',
			'POST osionos_connections', 'GET osionos_people_directory',
		]);
		const [post] = stub.posts();
		assert.equal(post.query, '?on_conflict=pair_key');
		assert.equal(post.prefer, 'resolution=ignore-duplicates,return=representation');
		assert.deepEqual(post.body, [{ requester_id: ME, addressee_id: B, status: 'accepted', source: 'colleague', responded_at: NOW }]);
	});

	it('bounds the embed and caps the insert at 500 rows when two workspaces hold 800 co-members', async (t) => {
		clock(t);
		const coMembers = Array.from({ length: 800 }, (_, i) => uid(1000 + i));
		const world = worldWith({ coMembers: coMembers.slice(0, 400) });
		world.members.push({ workspace_id: uid(102), user_id: ME }, ...coMembers.slice(400).map((user_id) => ({ workspace_id: uid(102), user_id })));
		const stub = createSocialStub(world);
		await getConnections(stub, ME);
		const query = new URLSearchParams(stub.calls[0].query);
		assert.equal(query.get('limit'), '200');
		assert.equal(query.get('workspace.members.limit'), '500');
		assert.equal(query.get('workspace.members.user_id'), `neq.${ME}`);
		const [post] = stub.posts();
		assert.equal(post.body.length, 500);
		assert.equal(new Set(post.body.map((row) => row.addressee_id)).size, 500);
	});

	it('skips the sync with one warn line when the embed answers another user\'s rows', async (t) => {
		const warnings = clock(t);
		const stored = [edge(1, ME, A)];
		const stub = createSocialStub(worldWith({ coMembers: [A, B], connections: stored }), { leakAnchor: true });
		const answer = await getConnections(stub, ME);
		assert.deepEqual(stub.posts(), []);
		assert.equal(answer.body.connections.length, 1);
		assert.deepEqual(warnings.mock.calls.map((call) => call.arguments[0]), ['[osionos-bridge] colleague sync skipped: the co-member read answered another user\'s rows']);
	});

	it('edges and blocks reads both 500 -> one error response, 0 unhandledRejection', async (t) => {
		clock(t);
		const reasons = unhandled(t);
		const stub = createSocialStub(worldWith({ coMembers: [A] }), { failing: ['edges', 'blocks'] });
		const answer = await getConnections(stub, ME);
		await settle();
		assert.deepEqual(answer, { status: 502, body: { ok: false, message: 'BaaS request failed with 500: {"message":"stub failure"}' } });
		assert.deepEqual(reasons, []);
	});

	it('inserted and read rows are merged once per id, newest first', () => {
		const older = edge(1, ME, A);
		const newer = edge(3, ME, B);
		const undated = { ...edge(2, A, ME), created_at: null };
		assert.deepEqual(mergeEdgesNewestFirst([newer, { ...newer, status: 'pending' }], [older, undated, newer]), [newer, older, undated]);
		assert.deepEqual(mergeEdgesNewestFirst([], []), []);
	});

	it('the co-member path and answer parser keep their anchor and bounds', () => {
		const query = new URLSearchParams(coMemberPath(ME).split('?')[1]);
		assert.deepEqual(Object.fromEntries(query), {
			user_id: `eq.${ME}`,
			select: 'user_id,workspace_id,workspace:osionos_workspaces!workspace_id(members:osionos_workspace_members!workspace_id(user_id))',
			limit: '200',
			'workspace.members.user_id': `neq.${ME}`,
			'workspace.members.limit': '500',
		});
		const row = (user_id, members, workspace_id = uid(101)) => ({ user_id, workspace_id, workspace: { members: members.map((id) => ({ user_id: id })) } });
		assert.deepEqual(coMembersFromRows([row(ME, [A, B, ME, 'not-a-uuid']), row(ME, [A], 'bad'), { user_id: ME, workspace_id: uid(102), workspace: null }], ME), [A, B]);
		assert.equal(coMembersFromRows([row(ME, [A]), row(A, [B])], ME), null);
		assert.deepEqual(coMembersFromRows(null, ME), []);
	});

	it('an insert answered without a body returns no rows and posts nothing for no peers', async (t) => {
		clock(t);
		const calls = [];
		const empty = async (_url, init) => { calls.push(init.method); return { ok: true, status: 201, text: async () => '' }; };
		const config = { baasUrl: 'http://baas.test', serviceKey: 'svc' };
		assert.deepEqual(await insertColleagueEdges(config, empty, ME, [A]), []);
		assert.deepEqual(await insertColleagueEdges(config, empty, ME, []), []);
		assert.deepEqual(calls, ['POST']);
	});
});
