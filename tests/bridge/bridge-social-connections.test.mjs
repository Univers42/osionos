/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-social-connections.test.mjs                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Characterization of GET /api/connections: what the response body is today, written before
// the colleague sync and the list read were restructured and passing unchanged after. Each
// test deep-equals the whole body against a strict stub (support/social-postgrest.mjs).
// The clock is frozen because a new colleague edge carries responded_at = new Date().

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NEW_EDGE_CREATED_AT, createSocialStub, expectedEdge, getConnections, newEdgeId, uid } from './support/social-postgrest.mjs';

const ME = uid(1);
const [A, B, C, D, E, F] = [uid(11), uid(12), uid(13), uid(14), uid(15), uid(16)];
const NOW = '2026-10-19T12:00:00.000Z';
const PEERS = {
	[A]: { name: 'Ada', avatar: 'ada.png' },
	[B]: { name: 'Bo', avatar: null },
	[C]: { name: 'Cy', avatar: 'cy.png' },
	[D]: { name: 'Di', avatar: null },
};
const edge = (n, requester, addressee, status, source = 'manual') => ({
	id: uid(500 + n), requester_id: requester, addressee_id: addressee, status, source, intro_message: null,
	created_at: `2026-10-0${n}T00:00:00.000Z`, responded_at: status === 'pending' ? null : `2026-10-0${n}T01:00:00.000Z`,
});

/** ME shares `team` with each of `coMembers`; `connections` and `blocks` are the stored rows. */
function world({ coMembers = [], connections = [], blocks = [] }) {
	const members = [{ workspace_id: uid(101), user_id: ME }, { workspace_id: uid(102), user_id: A }];
	for (const peer of coMembers) members.push({ workspace_id: uid(101), user_id: peer });
	const people = Object.entries(PEERS).map(([user_id, { name, avatar }]) => ({
		user_id, display_name: name, profile: avatar ? { avatar } : {}, last_seen_at: '2020-01-01T00:00:00.000Z',
	}));
	return { members, connections, blocks, people };
}

const run = async (t, setup, query = '', stubOptions) => {
	t.mock.timers.enable({ apis: ['Date'], now: Date.parse(NOW) });
	t.mock.method(console, 'warn', () => {});
	const stub = createSocialStub(world(setup), stubOptions);
	return { stub, answer: await getConnections(stub, ME, query) };
};
const seen = (row) => expectedEdge(row, ME, PEERS);
const asNew = (peer) => ({ ...edge(1, ME, peer, 'accepted', 'colleague'), id: newEdgeId(peer), created_at: NEW_EDGE_CREATED_AT, responded_at: NOW });

describe('GET /api/connections', () => {
	it('connections: status=accepted lists only accepted edges', async (t) => {
		const stored = [edge(1, ME, A, 'accepted'), edge(2, B, ME, 'pending'), edge(3, ME, C, 'declined'), edge(4, E, ME, 'accepted'), edge(5, ME, D, 'withdrawn')];
		const { answer } = await run(t, { coMembers: [A, B, C, D], connections: stored }, '?status=accepted');
		assert.deepEqual(answer, { status: 200, body: { ok: true, connections: [seen(stored[3]), seen(stored[0])] } });
	});

	it('connections: status=pending omits a colleague edge inserted in the same call', async (t) => {
		const stored = [edge(2, B, ME, 'pending')];
		const { stub, answer } = await run(t, { coMembers: [B, C], connections: stored }, '?status=pending');
		assert.deepEqual(answer, { status: 200, body: { ok: true, connections: [seen(stored[0])] } });
		assert.deepEqual(stub.posts().map((post) => post.body.map((row) => row.addressee_id)), [[C]]);
	});

	it('connections: unknown status answers 200 with no edges', async (t) => {
		const { answer } = await run(t, { coMembers: [B, C], connections: [edge(2, B, ME, 'pending')] }, '?status=bogus');
		assert.deepEqual(answer, { status: 200, body: { ok: true, connections: [] } });
	});

	it('connections: direction=incoming omits outgoing edges, including a new colleague edge', async (t) => {
		const stored = [edge(1, A, ME, 'accepted'), edge(2, ME, B, 'pending'), edge(3, E, ME, 'pending')];
		const { stub, answer } = await run(t, { coMembers: [A, B, C], connections: stored }, '?direction=incoming');
		assert.deepEqual(answer, { status: 200, body: { ok: true, connections: [seen(stored[2]), seen(stored[0])] } });
		assert.equal(stub.posts().length, 1);
	});

	it('connections: a co-member blocked before any edge existed is not listed after the colleague insert', async (t) => {
		const blocks = [{ blocker_id: ME, blocked_id: B }, { blocker_id: C, blocked_id: ME }];
		const { answer } = await run(t, { coMembers: [B, C, D], connections: [], blocks });
		assert.deepEqual(answer, { status: 200, body: { ok: true, connections: [seen(asNew(D))] } });
	});

	it('connections: a new colleague edge is listed first in the same response', async (t) => {
		const stored = [edge(1, ME, A, 'accepted'), edge(2, E, ME, 'accepted')];
		const { answer } = await run(t, { coMembers: [A, C], connections: stored });
		assert.deepEqual(answer, { status: 200, body: { ok: true, connections: [seen(asNew(C)), seen(stored[1]), seen(stored[0])] } });
	});

	it('connections: an edge in either direction with any status is not re-inserted', async (t) => {
		const peers = Array.from({ length: 8 }, (_, i) => uid(60 + i));
		const statuses = ['pending', 'declined', 'withdrawn', 'blocked'];
		const stored = peers.map((peer, i) => (i % 2 === 0 ? edge(i + 1, ME, peer, statuses[i >> 1]) : edge(i + 1, peer, ME, statuses[i >> 1])));
		const { stub, answer } = await run(t, { coMembers: peers, connections: stored });
		assert.deepEqual(answer, { status: 200, body: { ok: true, connections: stored.map(seen).reverse() } });
		assert.deepEqual(stub.posts(), []);
	});

	it('connections: colleague sync failure answers 200 with stored edges and posts nothing', async (t) => {
		const stored = [edge(1, ME, A, 'accepted')];
		const { stub, answer } = await run(t, { coMembers: [A, C], connections: stored }, '', { failing: ['members'] });
		assert.deepEqual(answer, { status: 200, body: { ok: true, connections: [seen(stored[0])] } });
		assert.deepEqual(stub.posts(), []);
	});

	it('connections: colleague insert failure answers 200 without the new edges', async (t) => {
		const stored = [edge(1, ME, A, 'accepted')];
		const { stub, answer } = await run(t, { coMembers: [A, C], connections: stored }, '', { failing: ['insert'] });
		assert.deepEqual(answer, { status: 200, body: { ok: true, connections: [seen(stored[0])] } });
		assert.equal(stub.posts().length, 1);
	});

	it('connections: edges read failure answers today\'s status', async (t) => {
		const { answer } = await run(t, { coMembers: [A, C], connections: [edge(1, ME, A, 'accepted')] }, '', { failing: ['edges'] });
		assert.deepEqual(answer, { status: 502, body: { ok: false, message: 'BaaS request failed with 500: {"message":"stub failure"}' } });
	});

	it('connections: no shared workspace, no POST', async (t) => {
		const stored = [edge(1, E, ME, 'accepted')];
		const { stub, answer } = await run(t, { coMembers: [], connections: stored });
		assert.deepEqual(answer, { status: 200, body: { ok: true, connections: [seen(stored[0])] } });
		assert.deepEqual(stub.posts(), []);
	});
});
