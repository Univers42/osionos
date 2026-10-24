/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-social-connections-reads.test.mjs           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// How GET /api/connections reads: two concurrent reads (edges, blocks), then the people
// summaries. The response bodies are pinned by bridge-social-connections.test.mjs; this file
// pins the calls. Since P0-5b the route writes nothing and reads no co-member embed: the
// colleague edges are created by the database when a member joins a workspace.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { edgesNewestFirst } from '../../scripts/bridge-social-core.mjs';
import { createSocialStub, getConnections, uid } from './support/social-postgrest.mjs';

const ME = uid(1);
const [A, B] = [uid(11), uid(12)];
const NOW = '2026-10-19T12:00:00.000Z';
const edge = (n, requester, addressee) => ({
	id: uid(500 + n), requester_id: requester, addressee_id: addressee, status: 'accepted', source: 'manual', intro_message: null,
	created_at: `2026-10-0${n}T00:00:00.000Z`, responded_at: `2026-10-0${n}T01:00:00.000Z`,
});
const worldWith = ({ connections = [], blocks = [] }) => ({
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
	it('makes exactly 3 BaaS calls and writes nothing', async (t) => {
		clock(t);
		const stub = createSocialStub(worldWith({ connections: [edge(1, ME, A)] }));
		await getConnections(stub, ME);
		assert.deepEqual(stub.calls.map((call) => `${call.method} ${call.table}`), [
			'GET osionos_connections', 'GET osionos_user_blocks', 'GET osionos_people_directory',
		]);
		assert.deepEqual(stub.posts(), []);
	});

	it('never reads the co-member embed', async (t) => {
		clock(t);
		const stub = createSocialStub(worldWith({ connections: [edge(1, ME, A)] }));
		await getConnections(stub, ME);
		assert.equal(stub.calls.filter((call) => call.table === 'osionos_workspace_members').length, 0);
		assert.equal(stub.calls.filter((call) => call.query.includes('members:')).length, 0);
	});

	it('edges and blocks reads both 500 -> one error response, 0 unhandledRejection', async (t) => {
		clock(t);
		const reasons = unhandled(t);
		const stub = createSocialStub(worldWith({}), { failing: ['edges', 'blocks'] });
		const answer = await getConnections(stub, ME);
		await settle();
		assert.deepEqual(answer, { status: 502, body: { ok: false, message: 'BaaS request failed with 500: {"message":"stub failure"}' } });
		assert.deepEqual(reasons, []);
	});

	it('the edges are merged once per id, newest first', () => {
		const older = edge(1, ME, A);
		const newer = edge(3, ME, B);
		const undated = { ...edge(2, A, ME), created_at: null };
		assert.deepEqual(edgesNewestFirst([newer, { ...newer, status: 'pending' }, older, undated, newer]), [newer, older, undated]);
		assert.deepEqual(edgesNewestFirst([]), []);
		assert.deepEqual(edgesNewestFirst(null), []);
	});
});
