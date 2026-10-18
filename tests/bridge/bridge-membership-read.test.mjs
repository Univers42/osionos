/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   membership-world.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ADR 0004, read half: a page read takes the caller's own members row from the statement
// that reads the page (pages -> workspace -> members, filtered to the caller), so the page
// and the permission to read it share one snapshot, and a non-owner read costs one BaaS
// call, not two. Nothing below sleeps between a membership change and the next request.

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, send } from './support/bridge-harness.mjs';
import { readablePageAccess, requireWorkspaceAccess } from '../../scripts/bridge-api.mjs';
import {
	ALL_PERMISSIONS, asA, asB, asOutsider, assertNoPageIds, config, deleteWorkspace, inMembershipWorld, membershipWorld,
	removeMember, setMemberPermissions,
} from './support/membership-world.mjs';

const NOT_SCOPED = 'App session is not scoped to this workspace.';
const PERMISSION_DENIED = 'Workspace permission denied.';
const pageRead = (id) => `/api/pages/${id}`;
const asRequest = (headers) => ({ headers });
const ownerRow = { user_id: IDS.userA, role: 'owner', permissions: ALL_PERMISSIONS };
const viewerRow = { user_id: IDS.userB, role: 'viewer', permissions: ['read'] };

const publishWas = process.env.OSIONOS_PUBLISH_ENABLED;
afterEach(() => {
	if (publishWas === undefined) delete process.env.OSIONOS_PUBLISH_ENABLED;
	else process.env.OSIONOS_PUBLISH_ENABLED = publishWas;
});

describe('read: the member row comes with the page', () => {
	it('GET /api/pages/:id makes exactly 1 BaaS call, for a page owner and for a member', async () => {
		await inMembershipWorld(membershipWorld(), {}, async (base, mock) => {
			const owned = await send(base, pageRead(IDS.sharedA), asA());
			assert.equal(owned.status, 200);
			assert.equal(mock.calls.length, 1);
			const shared = await send(base, pageRead(IDS.sharedA), asB());
			assert.equal(shared.status, 200);
			assert.equal(shared.body._id, IDS.sharedA);
			assert.equal(mock.calls.length, 2);
			assert.equal(mock.calls.filter((call) => call.table !== 'osionos_pages').length, 0, 'no rpc and no bare members read');
		});
	});

	it('asks for the page and only the caller\'s member row, hinted on the FK column', async () => {
		await inMembershipWorld(membershipWorld(), {}, async (base, mock) => {
			await send(base, pageRead(IDS.sharedA), asB());
			const { params } = mock.calls[0];
			assert.equal(params.get('id'), `eq.${IDS.sharedA}`);
			assert.equal(params.get('workspace.members.user_id'), `eq.${IDS.userB}`);
			assert.equal(params.get('select'), '*,workspace:osionos_workspaces!workspace_id(members:osionos_workspace_members!workspace_id(user_id,role,permissions))');
		});
	});

	it('the entry answered carries neither the embed nor another member', async () => {
		await inMembershipWorld(membershipWorld(), {}, async (base) => {
			const shared = await send(base, pageRead(IDS.sharedA), asB());
			assert.ok(!('workspace' in shared.body));
			assert.ok(!shared.text.includes('"members"'));
		});
	});

	it('comments list makes 2 calls (page and member, then comments)', async () => {
		await inMembershipWorld(membershipWorld(), {}, async (base, mock) => {
			const listed = await send(base, `/api/comments?pageId=${IDS.sharedA}`, asB());
			assert.equal(listed.status, 200);
			assert.deepEqual(mock.calls.map((call) => call.table), ['osionos_pages', 'osionos_page_comments']);
		});
	});

	it('publish makes 1 read, then the write', async () => {
		process.env.OSIONOS_PUBLISH_ENABLED = '1';
		await inMembershipWorld(membershipWorld(), {}, async (base, mock) => {
			const published = await send(base, `/api/pages/${IDS.sharedA}/publish`, asA(), { method: 'POST' });
			assert.equal(published.status, 200, published.text);
			assert.deepEqual(mock.calls.map((call) => `${call.method} ${call.table}`), ['GET osionos_pages', 'POST osionos_published_pages']);
		});
	});
});

describe('read: find the caller\'s row, never index', () => {
	const sharedWith = (world, members) => (call) => (call.table === 'osionos_pages'
		? { status: 200, body: [{ ...world.osionos_pages.find((page) => page.id === IDS.sharedA), workspace: { members } }] }
		: null);

	it('a stub that ignores the nested user filter cannot admit a non-member', async () => {
		const world = membershipWorld();
		const failWhen = sharedWith(world, [ownerRow, viewerRow]);
		await inMembershipWorld(world, { failWhen }, async (base) => {
			for (const memberWorkspaces of [[], [IDS.team]]) {
				const denied = await send(base, pageRead(IDS.sharedA), asOutsider(memberWorkspaces));
				assert.equal(denied.status, 403);
				assert.equal(denied.body.message, memberWorkspaces.length ? PERMISSION_DENIED : NOT_SCOPED);
				assertNoPageIds(denied, world);
			}
		});
	});

	it('the same unfiltered answer still finds the caller\'s own row by user_id', async () => {
		const world = membershipWorld();
		const failWhen = sharedWith(world, [ownerRow, viewerRow]);
		await inMembershipWorld(world, { failWhen }, async (base) => {
			assert.equal((await send(base, pageRead(IDS.sharedA), asB())).status, 200);
		});
	});

	it('a member row without a user_id never matches', async () => {
		const world = membershipWorld();
		const failWhen = sharedWith(world, [{ role: 'owner', permissions: ALL_PERMISSIONS }]);
		await inMembershipWorld(world, { failWhen }, async (base) => {
			assert.equal((await send(base, pageRead(IDS.sharedA), asB())).status, 403);
		});
	});
});

describe('read: 404 before 403, owner kept', () => {
	it('a non-member asking for another member\'s private page gets 404, not 403', async () => {
		const world = membershipWorld();
		await inMembershipWorld(world, {}, async (base) => {
			for (const asNobody of [asOutsider(), asOutsider([IDS.team]), asA()]) {
				const missing = await send(base, pageRead(IDS.pageB), asNobody);
				assert.equal(missing.status, 404);
				assert.equal(missing.body.message, 'Page not found.');
			}
			const absent = await send(base, pageRead(IDS.missing), asOutsider());
			assert.equal(absent.status, 404);
		});
	});

	it('a page owner who left the workspace still reads their own page', async () => {
		await inMembershipWorld(membershipWorld(), {}, async (base, mock) => {
			removeMember(mock, IDS.team, IDS.userB);
			const own = await send(base, pageRead(IDS.pageB), asB());
			assert.equal(own.status, 200);
			assert.equal(own.body._id, IDS.pageB);
			assert.equal(mock.calls.length, 1);
		});
	});

	it('the page entry is answered before any permission is weighed: a viewer asking to update a private page is a 404', async () => {
		await inMembershipWorld(membershipWorld(), {}, async (base) => {
			const edit = await send(base, pageRead(IDS.privateA), asB(), { method: 'PATCH', body: JSON.stringify({ title: 'x' }) });
			assert.equal(edit.status, 404);
		});
	});
});

describe('read: denial, in the next request', () => {
	for (const [label, memberWorkspaces, message] of [['token-scoped workspace', [IDS.team], PERMISSION_DENIED], ['workspace outside the token', [], NOT_SCOPED]]) {
		it(`removed member: next GET /api/pages/:id of a shared page is 403 (${label})`, async () => {
			const world = membershipWorld();
			await inMembershipWorld(world, {}, async (base, mock) => {
				assert.equal((await send(base, pageRead(IDS.sharedA), asB(memberWorkspaces))).status, 200);
				removeMember(mock, IDS.team, IDS.userB);
				const denied = await send(base, pageRead(IDS.sharedA), asB(memberWorkspaces));
				assert.equal(denied.status, 403);
				assert.equal(denied.body.message, message);
				assertNoPageIds(denied, world);
			});
		});

		it(`non-member 403 on a shared page (${label})`, async () => {
			const world = membershipWorld();
			await inMembershipWorld(world, {}, async (base) => {
				const denied = await send(base, pageRead(IDS.sharedA), asOutsider(memberWorkspaces));
				assert.equal(denied.status, 403);
				assert.equal(denied.body.message, message);
				assertNoPageIds(denied, world);
			});
		});

		it(`downgrade to no 'update' → publish 403 (${label})`, async () => {
			process.env.OSIONOS_PUBLISH_ENABLED = '1';
			const world = membershipWorld({ memberRole: 'editor' });
			await inMembershipWorld(world, {}, async (base, mock) => {
				setMemberPermissions(mock, IDS.team, IDS.userB, ['read']);
				const denied = await send(base, `/api/pages/${IDS.sharedA}/publish`, asB(memberWorkspaces), { method: 'POST' });
				assert.equal(denied.status, 403);
				assert.equal(denied.body.message, message);
				assert.equal(mock.calls.some((call) => call.table === 'osionos_published_pages'), false);
			});
		});

		it(`deleted workspace → 404 (${label})`, async () => {
			const world = membershipWorld();
			await inMembershipWorld(world, {}, async (base, mock) => {
				deleteWorkspace(mock, IDS.team);
				const gone = await send(base, pageRead(IDS.sharedA), asB(memberWorkspaces));
				assert.equal(gone.status, 404);
			});
		});
	}

	it('a member without the read permission is refused', async () => {
		const world = membershipWorld();
		world.osionos_workspace_members.find((row) => row.user_id === IDS.userB).permissions = [];
		await inMembershipWorld(world, {}, async (base) => {
			const denied = await send(base, pageRead(IDS.sharedA), asB());
			assert.equal(denied.status, 403);
			assertNoPageIds(denied, world);
		});
	});

	it('denials are 403 or 404, never a 502', async () => {
		const world = membershipWorld();
		await inMembershipWorld(world, {}, async (base) => {
			const statuses = [];
			for (const [id, headers] of [[IDS.sharedA, asOutsider()], [IDS.pageB, asOutsider()], [IDS.missing, asB()]]) {
				statuses.push((await send(base, pageRead(id), headers)).status);
			}
			assert.deepEqual(statuses, [403, 404, 404]);
		});
	});
});

describe('read: the access context is the one requireWorkspaceAccess builds', () => {
	it('authContext has the same shape for a member, and the row carries no embed key', async () => {
		// realWorkspaceRpc: requireWorkspaceAccess's token branch asks the rpc, which must answer from the seeded rows.
		await inMembershipWorld(membershipWorld(), { realWorkspaceRpc: true }, async (base, mock) => {
			for (const memberWorkspaces of [[IDS.team], []]) {
				const request = asRequest(asB(memberWorkspaces));
				const { authContext, row } = await readablePageAccess(request, IDS.sharedA, 'read', config, mock.fetchImpl);
				const expected = await requireWorkspaceAccess(request, IDS.team, 'read', config, mock.fetchImpl);
				assert.deepEqual(authContext, expected);
				assert.equal(Object.hasOwn(row, 'workspace'), false);
			}
			const owned = await readablePageAccess(asRequest(asB()), IDS.pageB, 'read', config, mock.fetchImpl);
			assert.equal(Object.hasOwn(owned.row, 'workspace'), false);
			assert.deepEqual(Object.keys(owned.authContext).sort(), Object.keys(await requireWorkspaceAccess(asRequest(asB()), IDS.team, 'read', config, mock.fetchImpl)).sort());
			assert.equal(owned.authContext.role, 'owner');
		});
	});

	it('readablePageAccess refuses with 403 or 404 itself', async () => {
		await inMembershipWorld(membershipWorld(), {}, async (base, mock) => {
			const attempt = (id, headers) => readablePageAccess(asRequest(headers), id, 'read', config, mock.fetchImpl).catch((error) => error.status);
			assert.equal(await attempt(IDS.sharedA, asOutsider()), 403);
			assert.equal(await attempt(IDS.pageB, asOutsider()), 404);
		});
	});
});
