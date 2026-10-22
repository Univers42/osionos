/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-social-connections.test.mjs                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Characterization of GET /api/connections: what the response body is today, written before
// the colleague sync and the list read were restructured and passing unchanged after. Each
// test deep-equals the whole body against a strict stub (support/social-postgrest.mjs).
// The route is a READ since P0-5b: the colleague edges are created by the database when a
// member joins a workspace, so the list shows the stored edges and nothing else.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSocialStub, expectedEdge, getConnections, uid } from './support/social-postgrest.mjs';

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

/** `connections` and `blocks` are the stored rows; `people` is the directory answer. */
function world({ connections = [], blocks = [] }) {
	const people = Object.entries(PEERS).map(([user_id, { name, avatar }]) => ({
		user_id, display_name: name, profile: avatar ? { avatar } : {}, last_seen_at: '2020-01-01T00:00:00.000Z',
	}));
	return { connections, blocks, people };
}

const run = async (t, setup, query = '', stubOptions) => {
	t.mock.timers.enable({ apis: ['Date'], now: Date.parse(NOW) });
	t.mock.method(console, 'warn', () => {});
	const stub = createSocialStub(world(setup), stubOptions);
	return { stub, answer: await getConnections(stub, ME, query) };
};
const seen = (row) => expectedEdge(row, ME, PEERS);

describe('GET /api/connections', () => {
	it('connections: status=accepted lists only accepted edges', async (t) => {
		const stored = [edge(1, ME, A, 'accepted'), edge(2, B, ME, 'pending'), edge(3, ME, C, 'declined'), edge(4, E, ME, 'accepted'), edge(5, ME, D, 'withdrawn')];
		const { answer } = await run(t, { connections: stored }, '?status=accepted');
		assert.deepEqual(answer, { status: 200, body: { ok: true, connections: [seen(stored[3]), seen(stored[0])] } });
	});

	it('connections: a peer without an edge is not listed — the database creates the edge', async (t) => {
		const stored = [edge(2, B, ME, 'pending')];
		const { stub, answer } = await run(t, { connections: stored }, '?status=pending');
		assert.deepEqual(answer, { status: 200, body: { ok: true, connections: [seen(stored[0])] } });
		assert.deepEqual(stub.posts(), []);
	});

	it('connections: unknown status answers 200 with no edges', async (t) => {
		const { answer } = await run(t, { connections: [edge(2, B, ME, 'pending')] }, '?status=bogus');
		assert.deepEqual(answer, { status: 200, body: { ok: true, connections: [] } });
	});

	it('connections: direction=incoming omits outgoing edges', async (t) => {
		const stored = [edge(1, A, ME, 'accepted'), edge(2, ME, B, 'pending'), edge(3, E, ME, 'pending')];
		const { stub, answer } = await run(t, { connections: stored }, '?direction=incoming');
		assert.deepEqual(answer, { status: 200, body: { ok: true, connections: [seen(stored[2]), seen(stored[0])] } });
		assert.deepEqual(stub.posts(), []);
	});

	it('connections: a co-member blocked before any edge existed is not listed', async (t) => {
		const blocks = [{ blocker_id: ME, blocked_id: B }, { blocker_id: C, blocker_id: ME }];
		const { answer } = await run(t, { connections: [], blocks });
		assert.deepEqual(answer, { status: 200, body: { ok: true, connections: [] } });
	});

	it('connections: the stored edges are listed newest first', async (t) => {
		const stored = [edge(1, ME, A, 'accepted'), edge(2, E, ME, 'accepted')];
		const { answer } = await run(t, { connections: stored });
		assert.deepEqual(answer, { status: 200, body: { ok: true, connections: [seen(stored[1]), seen(stored[0])] } });
	});

	it('connections: an edge in either direction with any status is listed once', async (t) => {
		const peers = Array.from({ length: 8 }, (_, i) => uid(60 + i));
		const statuses = ['pending', 'declined', 'withdrawn', 'blocked'];
		const stored = peers.map((peer, i) => (i % 2 === 0 ? edge(i + 1, ME, peer, statuses[i >> 1]) : edge(i + 1, peer, ME, statuses[i >> 1])));
		const { stub, answer } = await run(t, { connections: stored });
		assert.deepEqual(answer, { status: 200, body: { ok: true, connections: stored.map(seen).reverse() } });
		assert.deepEqual(stub.posts(), []);
	});

	it('connections: edges read failure answers today\'s status', async (t) => {
		const { answer } = await run(t, { connections: [edge(1, ME, A, 'accepted')] }, '', { failing: ['edges'] });
		assert.deepEqual(answer, { status: 502, body: { ok: false, message: 'BaaS request failed with 500: {"message":"stub failure"}' } });
	});

	it('connections: the route never posts an edge', async (t) => {
		const stored = [edge(1, E, ME, 'accepted')];
		const { stub, answer } = await run(t, { connections: stored });
		assert.deepEqual(answer, { status: 200, body: { ok: true, connections: [seen(stored[0])] } });
		assert.deepEqual(stub.posts(), []);
	});
});
