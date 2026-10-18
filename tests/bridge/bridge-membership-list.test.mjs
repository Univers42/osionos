/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-membership-list.test.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ADR 0004, list half: /api/pages and /api/pages/all read the caller's members row and the
// workspace's pages in ONE statement, so a membership change is seen by the very next
// request (no sleep anywhere below) and the list costs one BaaS round trip, not two.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, send } from './support/bridge-harness.mjs';
import {
	ALL_PERMISSIONS, OTHER_PAGE, OTHER_WORKSPACE, asA, asB, asOutsider, assertNoPageIds, deleteWorkspace, inMembershipWorld,
	membershipWorld, removeMember, setMemberPermissions,
} from './support/membership-world.mjs';

const TEAM_ALL = `/api/pages/all?workspaceId=${IDS.team}`;
const TEAM_LIST = `/api/pages?workspaceId=${IDS.team}`;
const NOT_SCOPED = 'App session is not scoped to this workspace.';
const PERMISSION_DENIED = 'Workspace permission denied.';
const idsOf = (result) => result.body.map((entry) => entry._id).sort();

describe('list: membership and pages in one statement', () => {
	it('a member lists exactly what they may read, from their own workspace only', async () => {
		const world = membershipWorld();
		await inMembershipWorld(world, {}, async (base) => {
			const result = await send(base, TEAM_ALL, asB());
			assert.equal(result.status, 200);
			assert.deepEqual(idsOf(result), [IDS.pageB, IDS.sharedA, IDS.sharedMemoA].sort());
			assert.ok(!result.text.includes(OTHER_PAGE), 'no page of another workspace');
		});
	});

	it('/api/pages/all makes exactly 1 BaaS call and the meter reports baas_n=1', async () => {
		const lines = [];
		await inMembershipWorld(membershipWorld(), {}, async (base, mock) => {
			const response = await fetch(`${base}${TEAM_ALL}`, { headers: asB() });
			assert.equal(response.status, 200);
			await response.arrayBuffer();
			assert.equal(mock.calls.length, 1);
			assert.equal(mock.calls[0].table, 'osionos_workspace_members');
			// The meter logs on the response's 'close', a tick after the client has the body.
			for (let tries = 0; lines.length === 0 && tries < 50; tries++) await new Promise((resolve) => setTimeout(resolve, 10));
			const line = JSON.parse(lines.find((entry) => entry.includes('/api/pages/all')));
			assert.equal(line.baas_n, 1);
		}, { perf: true, perfLog: (entry) => lines.push(entry) });
	});

	it('a token workspace needs no rpc: 0 calls to rpc/osionos_bridge_list_workspaces', async () => {
		await inMembershipWorld(membershipWorld(), {}, async (base, mock) => {
			await send(base, TEAM_ALL, asB([IDS.team]));
			await send(base, TEAM_LIST, asB([IDS.team]));
			assert.equal(mock.calls.filter((call) => call.table.startsWith('rpc/')).length, 0);
		});
	});

	for (const [name, path] of [['bad token', 'bad'], ['missing token', null]]) {
		it(`${name}: 401 with 0 BaaS calls`, async () => {
			await inMembershipWorld(membershipWorld(), {}, async (base, mock) => {
				const headers = path === null ? {} : { authorization: 'Bearer not-a-session' };
				for (const route of [TEAM_ALL, TEAM_LIST]) {
					const result = await send(base, route, headers);
					assert.equal(result.status, 401);
					assertNoPageIds(result, membershipWorld());
				}
				assert.equal(mock.calls.length, 0);
			});
		});
	}

	it('every filter shape the list emits is served in the one statement', async () => {
		const world = membershipWorld({ memberRole: 'editor' });
		world.osionos_pages.push({ ...world.osionos_pages[1], id: 'a9a9a9a9-1111-4111-8111-a9a9a9a9a9a9', database_id: 'db-1', surface: 'wiki', parent_page_id: IDS.sharedA });
		await inMembershipWorld(world, {}, async (base, mock) => {
			const filtered = await send(base, `${TEAM_LIST}&databaseId=db-1&parentPageId=${IDS.sharedA}&surface=wiki`, asB());
			assert.equal(filtered.status, 200);
			assert.deepEqual(idsOf(filtered), ['a9a9a9a9-1111-4111-8111-a9a9a9a9a9a9']);
			const noDatabase = await send(base, `${TEAM_LIST}&databaseId=&parentPageId=`, asB());
			assert.equal(noDatabase.status, 200);
			assert.ok(!idsOf(noDatabase).includes('a9a9a9a9-1111-4111-8111-a9a9a9a9a9a9'));
			assert.equal(mock.calls.length, 2);
		});
	});
});

describe('list: denial, in the next request', () => {
	for (const [label, memberWorkspaces, message] of [['token-scoped workspace', [IDS.team], PERMISSION_DENIED], ['workspace outside the token', [], NOT_SCOPED]]) {
		it(`removed member: next /api/pages/all is 403 (${label})`, async () => {
			const world = membershipWorld();
			await inMembershipWorld(world, {}, async (base, mock) => {
				assert.equal((await send(base, TEAM_ALL, asB(memberWorkspaces))).status, 200);
				removeMember(mock, IDS.team, IDS.userB);
				const denied = await send(base, TEAM_ALL, asB(memberWorkspaces));
				assert.equal(denied.status, 403);
				assert.equal(denied.body.message, message);
				assertNoPageIds(denied, world);
			});
		});

		it(`non-member 403 (${label})`, async () => {
			const world = membershipWorld();
			await inMembershipWorld(world, {}, async (base) => {
				for (const route of [TEAM_ALL, TEAM_LIST]) {
					const denied = await send(base, route, asOutsider(memberWorkspaces));
					assert.equal(denied.status, 403);
					assert.equal(denied.body.message, message);
					assertNoPageIds(denied, world);
				}
			});
		});

		it(`role downgraded to permissions [] → 403 (${label})`, async () => {
			const world = membershipWorld();
			await inMembershipWorld(world, {}, async (base, mock) => {
				assert.equal((await send(base, TEAM_ALL, asB(memberWorkspaces))).status, 200);
				setMemberPermissions(mock, IDS.team, IDS.userB, []);
				const denied = await send(base, TEAM_ALL, asB(memberWorkspaces));
				assert.equal(denied.status, 403);
				assert.equal(denied.body.message, message);
				assertNoPageIds(denied, world);
			});
		});

		it(`deleted workspace (cascade in stub) → 403 (${label})`, async () => {
			const world = membershipWorld();
			await inMembershipWorld(world, {}, async (base, mock) => {
				deleteWorkspace(mock, IDS.team);
				const denied = await send(base, TEAM_ALL, asA(memberWorkspaces));
				assert.equal(denied.status, 403);
				assert.equal(denied.body.message, message);
				assertNoPageIds(denied, world);
			});
		});
	}

	it('a member without the read permission is refused even though the statement found the row', async () => {
		const world = membershipWorld();
		world.osionos_workspace_members.find((row) => row.user_id === IDS.userB).permissions = ['create'];
		await inMembershipWorld(world, {}, async (base) => {
			const denied = await send(base, TEAM_ALL, asB());
			assert.equal(denied.status, 403);
			assertNoPageIds(denied, world);
		});
	});

	it('a member of another workspace cannot list this one by naming it', async () => {
		const world = membershipWorld();
		await inMembershipWorld(world, {}, async (base) => {
			const denied = await send(base, `/api/pages/all?workspaceId=${IDS.team}`, asOutsider([OTHER_WORKSPACE]));
			assert.equal(denied.status, 403);
			assertNoPageIds(denied, world);
		});
	});
});

describe('list: the anchor cross-check', () => {
	const ownerRow = (pages) => ({ user_id: IDS.userA, workspace_id: IDS.team, role: 'owner', permissions: ALL_PERMISSIONS, workspace: { pages } });
	const memberRow = (pages) => ({ user_id: IDS.userB, workspace_id: IDS.team, role: 'viewer', permissions: ['read'], workspace: { pages } });

	it('list refuses when the anchor returns another member\'s row', async () => {
		const world = membershipWorld();
		const leaked = world.osionos_pages.filter((page) => page.workspace_id === IDS.team);
		const failWhen = (call) => (call.table === 'osionos_workspace_members' ? { status: 200, body: [ownerRow(leaked), memberRow(leaked)] } : null);
		await inMembershipWorld(world, { failWhen }, async (base) => {
			for (const route of [TEAM_ALL, TEAM_LIST]) {
				const denied = await send(base, route, asB());
				assert.equal(denied.status, 403);
				assertNoPageIds(denied, world);
			}
		});
	});

	it('two anchor rows, the caller\'s own first, are a 403: the user filter did not apply', async () => {
		const world = membershipWorld();
		const pages = world.osionos_pages.filter((page) => page.workspace_id === IDS.team);
		const failWhen = (call) => (call.table === 'osionos_workspace_members' ? { status: 200, body: [memberRow(pages), ownerRow(pages)] } : null);
		await inMembershipWorld(world, { failWhen }, async (base) => {
			for (const route of [TEAM_ALL, TEAM_LIST]) {
				const denied = await send(base, route, asB());
				assert.equal(denied.status, 403);
				assertNoPageIds(denied, world);
			}
		});
	});

	it('the caller\'s own anchor row without its workspace embed is a 403', async () => {
		const world = membershipWorld();
		const failWhen = (call) => (call.table === 'osionos_workspace_members' ? { status: 200, body: [{ ...memberRow([]), workspace: null }] } : null);
		await inMembershipWorld(world, { failWhen }, async (base) => {
			const denied = await send(base, TEAM_ALL, asB());
			assert.equal(denied.status, 403);
			assertNoPageIds(denied, world);
		});
	});

	for (const [label, row] of [
		['another user', { ...ownerRow([]), user_id: IDS.userA }],
		['another workspace', { ...memberRow([]), workspace_id: OTHER_WORKSPACE }],
	]) {
		it(`a single anchor row belonging to ${label} is a 403`, async () => {
			const world = membershipWorld();
			const failWhen = (call) => (call.table === 'osionos_workspace_members' ? { status: 200, body: [{ ...row, workspace: { pages: world.osionos_pages } }] } : null);
			await inMembershipWorld(world, { failWhen }, async (base) => {
				const denied = await send(base, TEAM_ALL, asB());
				assert.equal(denied.status, 403);
				assertNoPageIds(denied, world);
			});
		});
	}

	it('the anchor asks for the caller and the workspace, and for two rows at most', async () => {
		await inMembershipWorld(membershipWorld(), {}, async (base, mock) => {
			await send(base, TEAM_ALL, asB());
			const { params } = mock.calls[0];
			assert.equal(params.get('user_id'), `eq.${IDS.userB}`);
			assert.equal(params.get('workspace_id'), `eq.${IDS.team}`);
			assert.equal(params.get('limit'), '2');
			assert.match(params.get('select'), /^user_id,workspace_id,role,permissions,workspace:osionos_workspaces!workspace_id\(pages:osionos_pages!workspace_id\(/);
		});
	});
});

describe('list: the chunked path', () => {
	const uuidFor = (index) => `f0000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
	const bigWorld = (count) => {
		const world = membershipWorld();
		const template = world.osionos_pages[1];
		for (let index = 0; index < count; index += 1) world.osionos_pages.push({ ...template, id: uuidFor(index), title: `bulk ${index}` });
		return world;
	};

	it('n chunks make exactly n BaaS calls, each anchored, none to the rpc or the bare members table', async () => {
		await inMembershipWorld(bigWorld(450), {}, async (base, mock) => {
			const result = await send(base, TEAM_LIST, asB());
			assert.equal(result.status, 200);
			assert.equal(result.body.length, 450 + 3);
			assert.equal(mock.calls.length, 3);
			for (const call of mock.calls) {
				assert.equal(call.table, 'osionos_workspace_members');
				assert.match(call.params.get('select'), /osionos_pages!workspace_id\(/);
				assert.equal(call.params.get('user_id'), `eq.${IDS.userB}`);
			}
			assert.equal(mock.calls[1].params.get('workspace.pages.id') !== null, true);
		});
	});

	it('revocation between chunk 1 and chunk 2 → 403, never a truncated 200', async () => {
		const world = bigWorld(450);
		const failWhen = (_call, mock) => {
			if (mock.calls.length === 2) removeMember(mock, IDS.team, IDS.userB);
			return null;
		};
		await inMembershipWorld(world, { failWhen }, async (base, mock) => {
			const denied = await send(base, TEAM_LIST, asB());
			assert.equal(denied.status, 403);
			assert.equal(denied.body.message, PERMISSION_DENIED);
			assertNoPageIds(denied, world);
			assert.equal(mock.calls.length, 2);
		});
	});

	it('a permission lost between chunks is a 403 too', async () => {
		const world = bigWorld(450);
		const failWhen = (_call, mock) => {
			if (mock.calls.length === 2) setMemberPermissions(mock, IDS.team, IDS.userB, []);
			return null;
		};
		await inMembershipWorld(world, { failWhen }, async (base) => {
			const denied = await send(base, TEAM_LIST, asB());
			assert.equal(denied.status, 403);
			assertNoPageIds(denied, world);
		});
	});

	it('an empty anchor on chunk 1 is a 403 as well', async () => {
		const world = bigWorld(250);
		await inMembershipWorld(world, {}, async (base, mock) => {
			removeMember(mock, IDS.team, IDS.userB);
			const denied = await send(base, TEAM_LIST, asB());
			assert.equal(denied.status, 403);
			assert.equal(mock.calls.length, 1);
		});
	});
});
