/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-list-gate-proof.test.mjs               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// osionos#243 D′: /api/pages/all reads its pages flat, bracketed by a membership gate before
// and a proof after. The gate keeps a non-member from costing a page read (the timing oracle
// that blocked D); the proof makes a revocation that lands during the read a 403; the read
// itself must prove it is complete and from this workspace, or nothing is served.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, send, withBridge } from './support/bridge-harness.mjs';
import {
	ALL_PERMISSIONS, OTHER_PAGE, OTHER_WORKSPACE, OUTSIDER, asB, asOutsider, assertGateReadProof, assertNoPageIds, config, inMembershipWorld, isAnchor, isPageRead,
	membershipWorld, removeMember,
} from './support/membership-world.mjs';

const TEAM_ALL = `/api/pages/all?workspaceId=${IDS.team}`;
const NOT_SCOPED = 'App session is not scoped to this workspace.';
const PERMISSION_DENIED = 'Workspace permission denied.';
const DENIALS = [['token-scoped workspace', [IDS.team], PERMISSION_DENIED], ['workspace outside the token', [], NOT_SCOPED]];

const anchorsSoFar = (mock) => mock.calls.filter(isAnchor).length;
const pageReads = (mock) => mock.calls.filter(isPageRead).length;
const teamRows = (world) => world.osionos_pages.filter((page) => page.workspace_id === IDS.team);
const memberB = { user_id: IDS.userB, workspace_id: IDS.team, role: 'viewer', permissions: ['read'] };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A bridge over the strict stub whose fetch is `wrap(inner, mock)`: how a test acts after a call was answered. */
async function inWrappedWorld(world, wrap, body) {
	const mock = createPostgrestMock(world);
	await withBridge(config, wrap(mock.fetchImpl, mock), (base) => body(base, mock));
	assert.deepEqual(mock.stubErrors, [], 'the strict stub rejected a query shape');
}

const tableOf = (url) => new URL(String(url)).pathname.replace('/rest/v1/', '');
const paramsOf = (url) => new URL(String(url)).searchParams;

describe('/api/pages/all: the gate comes before any page read', () => {
	it('the flat read asks for this workspace, newest first with an id tiebreak, an exact count and no limit', async () => {
		await inMembershipWorld(membershipWorld(), {}, async (base, mock) => {
			assert.equal((await send(base, TEAM_ALL, asB())).status, 200);
			assertGateReadProof(mock.calls);
			const read = mock.calls[1];
			assert.equal(read.params.get('workspace_id'), `eq.${IDS.team}`);
			assert.equal(read.params.get('order'), 'updated_at.desc,id.asc');
			assert.equal(read.params.has('limit'), false);
			assert.equal(read.params.get('select').includes('('), false, 'no embed');
			assert.match(read.prefer, /count=exact/);
		});
	});

	for (const [label, memberWorkspaces, message] of DENIALS) {
		it(`a non-member is a 403 with ZERO page reads (${label})`, async () => {
			const world = membershipWorld();
			await inMembershipWorld(world, {}, async (base, mock) => {
				const denied = await send(base, TEAM_ALL, asOutsider(memberWorkspaces));
				assert.equal(denied.status, 403);
				assert.equal(denied.body.message, message);
				assertNoPageIds(denied, world);
				assert.equal(pageReads(mock), 0);
			});
		});
	}

	it('a membership granted right after the gate still finds no page read: the gate already refused', async () => {
		const world = membershipWorld();
		const grantAfterGate = (inner, mock) => async (url, init) => {
			const answer = await inner(url, init);
			if (isAnchor({ table: tableOf(url), params: paramsOf(url) }) && anchorsSoFar(mock) === 1) {
				mock.rows('osionos_workspace_members').push({ workspace_id: IDS.team, user_id: OUTSIDER.userId, role: 'viewer', permissions: ['read'] });
			}
			return answer;
		};
		await inWrappedWorld(world, grantAfterGate, async (base, mock) => {
			const denied = await send(base, TEAM_ALL, asOutsider());
			assert.equal(denied.status, 403);
			assert.equal(denied.body.message, NOT_SCOPED);
			assertNoPageIds(denied, world);
			assert.equal(pageReads(mock), 0);
			assert.equal(anchorsSoFar(mock), 1, 'the refusal ends the request at the gate');
		});
	});

	it('a workspace id that does not exist is a 403 with zero page reads', async () => {
		const world = membershipWorld();
		await inMembershipWorld(world, {}, async (base, mock) => {
			const denied = await send(base, `/api/pages/all?workspaceId=${IDS.missing}`, asB());
			assert.equal(denied.status, 403);
			assert.equal(denied.body.message, NOT_SCOPED);
			assert.equal(pageReads(mock), 0);
		});
	});

	it('an empty workspace is a 200 [] after all three calls: gate, read, proof', async () => {
		const world = membershipWorld();
		world.osionos_pages = world.osionos_pages.filter((page) => page.workspace_id !== IDS.team);
		await inMembershipWorld(world, {}, async (base, mock) => {
			const listed = await send(base, TEAM_ALL, asB());
			assert.equal(listed.status, 200, listed.text);
			assert.deepEqual(listed.body, []);
			assert.equal(mock.calls.length, 3);
			assertGateReadProof(mock.calls);
		});
	});
});

describe('/api/pages/all: the proof comes after the read', () => {
	it('the proof is asked only once the read has answered, never alongside it', async () => {
		const events = [];
		const slowRead = (inner) => async (url, init) => {
			const call = { table: tableOf(url), params: paramsOf(url) };
			if (isAnchor(call)) events.push('anchor asked');
			const answer = await inner(url, init);
			if (isPageRead(call)) {
				await delay(40);
				events.push('read answered');
			}
			return answer;
		};
		await inWrappedWorld(membershipWorld(), slowRead, async (base) => {
			assert.equal((await send(base, TEAM_ALL, asB())).status, 200);
			assert.deepEqual(events, ['anchor asked', 'read answered', 'anchor asked']);
		});
	});

	for (const [label, memberWorkspaces, message] of DENIALS) {
		for (const [moment, revokeOn] of [['between gate and read', isPageRead], ['between read and proof', (call, mock) => isAnchor(call) && anchorsSoFar(mock) === 2]]) {
			it(`a member revoked ${moment} is a 403 with no page ids (${label})`, async () => {
				const world = membershipWorld();
				const failWhen = (call, mock) => {
					if (revokeOn(call, mock)) removeMember(mock, IDS.team, IDS.userB);
					return null;
				};
				await inMembershipWorld(world, { failWhen }, async (base, mock) => {
					const denied = await send(base, TEAM_ALL, asB(memberWorkspaces));
					assert.equal(denied.status, 403);
					assert.equal(denied.body.message, message);
					assertNoPageIds(denied, world);
					assert.equal(pageReads(mock), 1, 'the rows were read, then discarded');
				});
			});
		}
	}
});

describe('/api/pages/all: an anchor nobody can vouch for is a 403', () => {
	const cases = [
		['a duplicate anchor at the gate', 1, [memberB, memberB]],
		['a duplicate anchor at the proof', 2, [memberB, memberB]],
		['another user\'s anchor at the proof', 2, [{ ...memberB, user_id: IDS.userA, role: 'owner', permissions: ALL_PERMISSIONS }]],
		['another workspace\'s anchor at the proof', 2, [{ ...memberB, workspace_id: OTHER_WORKSPACE }]],
	];
	for (const [label, nth, body] of cases) {
		it(`${label} is a 403 with no page ids`, async () => {
			const world = membershipWorld();
			const failWhen = (call, mock) => (isAnchor(call) && anchorsSoFar(mock) === nth ? { status: 200, body } : null);
			await inMembershipWorld(world, { failWhen }, async (base, mock) => {
				const denied = await send(base, TEAM_ALL, asB());
				assert.equal(denied.status, 403);
				assert.equal(denied.body.message, PERMISSION_DENIED);
				assertNoPageIds(denied, world);
				assert.equal(pageReads(mock), nth === 1 ? 0 : 1);
			});
		});
	}
});

describe('/api/pages/all: a read that cannot prove itself complete and in-workspace is a 502', () => {
	const range = (rows, total = rows.length) => ({ 'content-range': rows.length ? `0-${rows.length - 1}/${total}` : `*/${total}` });
	const cases = [
		['a body-less 2xx', () => ({ status: 200, body: undefined })],
		['a non-array 2xx', () => ({ status: 200, body: {} })],
		['a row of another workspace', (world) => {
			const rows = [...teamRows(world), world.osionos_pages.find((page) => page.id === OTHER_PAGE)];
			return { status: 200, body: rows, headers: range(rows) };
		}],
		['a db-max-rows truncated read', (world) => {
			const rows = teamRows(world).slice(0, 2);
			return { status: 200, body: rows, headers: range(rows, teamRows(world).length) };
		}],
		['a read without a Content-Range total', (world) => ({ status: 200, body: teamRows(world) })],
	];
	for (const [label, answer] of cases) {
		it(`${label} is a 502 with no page ids`, async () => {
			const world = membershipWorld();
			const failWhen = (call) => (isPageRead(call) ? answer(world) : null);
			await inMembershipWorld(world, { failWhen }, async (base) => {
				const failed = await send(base, TEAM_ALL, asB());
				assert.equal(failed.status, 502, failed.text);
				assert.equal(Array.isArray(failed.body), false);
				assertNoPageIds(failed, world);
			});
		});
	}
});

describe('/api/pages/all: a failing call maps as every BaaS failure does, never to a 200', () => {
	const cases = [
		['the gate', 500, 502, (call, mock) => isAnchor(call) && anchorsSoFar(mock) === 1],
		['the read', 500, 502, isPageRead],
		['the proof', 500, 502, (call, mock) => isAnchor(call) && anchorsSoFar(mock) === 2],
		['the proof', 429, 429, (call, mock) => isAnchor(call) && anchorsSoFar(mock) === 2],
	];
	for (const [label, upstream, expected, failOn] of cases) {
		it(`${label} answering ${upstream} is a ${expected} with no page ids`, async () => {
			const world = membershipWorld();
			const failWhen = (call, mock) => (failOn(call, mock) ? { status: upstream, body: { message: 'upstream refused' } } : null);
			await inMembershipWorld(world, { failWhen }, async (base) => {
				const failed = await send(base, TEAM_ALL, asB());
				assert.equal(failed.status, expected, failed.text);
				assertNoPageIds(failed, world);
			});
		});
	}
});
