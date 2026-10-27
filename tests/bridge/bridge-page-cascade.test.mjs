/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-cascade.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A delete, archive or restore of page P reaches a descendant exactly when the same
// caller's direct DELETE / PATCH archivedAt of that descendant would succeed, judged with
// the caller's own membership in the workspace. The walk stops at the first page it
// skips, so a skipped page keeps its whole subtree. The harness does not emulate
// ON DELETE SET NULL, so these tests assert the ids a write names, not parent nulling.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, patch, send, sessionHeaders, teamPage, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const ALL = ['create', 'read', 'update', 'delete', 'admin'];
const CALLER = '99999999-5555-4555-8555-999999999999';
const asCaller = sessionHeaders(config, CALLER, '98989898-5555-4555-8555-989898989898');
const PAGE = { parent: '9a9a9a9a-5555-4555-8555-9a9a9a9a9a9a', child: '9b9b9b9b-5555-4555-8555-9b9b9b9b9b9b', grandchild: '9c9c9c9c-5555-4555-8555-9c9c9c9c9c9c' };
const ARCHIVED_AT = '2026-10-13T00:00:00.000Z';
const EDITOR = { userId: CALLER, role: 'editor' };

const ROLES = {
	'a viewer who owns P': { member: { role: 'viewer', permissions: ['read'] } },
	'an update-only member': { member: { role: 'editor', permissions: ['create', 'read', 'update'] } },
	'an update and delete member': { member: { role: 'editor', permissions: ['create', 'read', 'update', 'delete'] } },
	'a workspace admin': { member: { role: 'admin', permissions: ALL } },
	'a viewer listed as editor collaborator on X': { member: { role: 'viewer', permissions: ['read'] }, collaborator: true },
	'a non-member who owns P': { member: null },
};
const VISIBILITIES = {
	shared: { visibility: 'shared', collaborators: [] },
	'private with the caller as collaborator': { visibility: 'private', collaborators: [EDITOR] },
	private: { visibility: 'private', collaborators: [] },
};
const OPS = {
	DELETE: { method: 'DELETE', init: { method: 'DELETE' }, permission: 'delete', seededArchivedAt: null },
	archive: { method: 'PATCH', init: patch({ archivedAt: ARCHIVED_AT }), permission: 'update', seededArchivedAt: null, writes: ARCHIVED_AT },
	restore: { method: 'PATCH', init: patch({ archivedAt: null }), permission: 'update', seededArchivedAt: ARCHIVED_AT, writes: null },
};

function under(row, parentId, archivedAt = null) {
	return { ...row, parent_page_id: parentId, archived_at: archivedAt };
}

/** A owns the team workspace; the caller has `member` (null: no membership) and owns P. */
function callerWorld(member, pages) {
	const world = teamWorld();
	if (member) world.osionos_workspace_members.push({ workspace_id: IDS.team, user_id: CALLER, ...member });
	world.osionos_pages.push(...pages);
	return world;
}

/** The id lists of the caller's cascading writes: DELETE / PATCH with `id=in.(…)`. */
function cascadeIds(mock, method) {
	return mock.calls
		.filter((call) => call.method === method && call.table === 'osionos_pages' && String(call.params.get('id')).startsWith('in.('))
		// The bridge quotes the ids of its `in` lists (inFilter), so the quotes come off here.
		.flatMap((call) => call.params.get('id').slice(4, -1).split(',').map((id) => id.replace(/^"(.*)"$/, '$1')));
}

async function run(world, pageId, init, headers = asCaller) {
	const mock = createPostgrestMock(world);
	const response = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/pages/${pageId}`, headers, init));
	return { mock, response };
}

describe('a cascade reaches a descendant exactly when the direct route would accept it', () => {
	for (const [roleName, role] of Object.entries(ROLES)) {
		for (const xOwner of ['caller', 'other']) {
			for (const [visibilityName, sharing] of Object.entries(VISIBILITIES)) {
				for (const [opName, op] of Object.entries(OPS)) {
					it(`${roleName}, X owned by the ${xOwner}, X ${visibilityName}: ${opName}`, async () => {
						const collaborators = role.collaborator ? [EDITOR] : sharing.collaborators;
						const child = { ...teamPage(PAGE.child, xOwner === 'caller' ? CALLER : IDS.userA, sharing.visibility, 'X', 'x text'), collaborators };
						const pages = () => [
							under(teamPage(PAGE.parent, CALLER, 'private', 'P', 'p text'), null, op.seededArchivedAt),
							under(child, PAGE.parent, op.seededArchivedAt),
						];
						const readable = sharing.visibility === 'shared' || collaborators.length > 0;
						const held = role.member?.permissions.includes(op.permission) ?? false;
						const expected = role.member !== null && (xOwner === 'caller' || (readable && held));
						const direct = await run(callerWorld(role.member, pages()), PAGE.child, op.init);
						const cascade = await run(callerWorld(role.member, pages()), PAGE.parent, op.init);
						assert.equal(cascade.response.status, role.member === null ? 404 : 200, cascade.response.text);
						assert.equal(direct.response.status === 200, expected, `direct ${opName} of X: ${direct.response.status}`);
						assert.equal(cascadeIds(cascade.mock, op.method).includes(PAGE.child), expected);
						const stored = cascade.mock.page(PAGE.child);
						if (opName === 'DELETE') assert.equal(stored === undefined, expected);
						else assert.equal(stored.archived_at, expected ? op.writes : op.seededArchivedAt);
					});
				}
			}
		}
	}
});

describe('a page moved under another member\'s page stays out of that page\'s cascade', () => {
	it('an update-only member moves a shared page under their own page, deletes it, and the moved page stays', async () => {
		const world = teamWorld({ memberRole: 'editor' });
		world.osionos_pages.push(teamPage(PAGE.parent, IDS.userB, 'shared', 'B parent', 'b text'));
		const mock = createPostgrestMock(world);
		const asB = sessionHeaders(config, IDS.userB, IDS.homeB);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const moved = await send(base, `/api/pages/${IDS.sharedA}`, asB, patch({ parentPageId: PAGE.parent }));
			assert.equal(moved.status, 200, moved.text);
			assert.equal(mock.page(IDS.sharedA).parent_page_id, PAGE.parent);
			const deleted = await send(base, `/api/pages/${PAGE.parent}`, asB, { method: 'DELETE' });
			assert.equal(deleted.status, 200, deleted.text);
			assert.deepEqual(cascadeIds(mock, 'DELETE'), [PAGE.parent]);
			assert.notEqual(mock.page(IDS.sharedA), undefined);
		});
	});

	it('a viewer who owns P archives it and another member\'s shared child stays live', async () => {
		const world = teamWorld();
		world.osionos_pages.push(teamPage(PAGE.parent, IDS.userB, 'private', 'B parent', 'b text'), under(teamPage(PAGE.child, IDS.userA, 'shared', 'X', 'x text'), PAGE.parent));
		const mock = createPostgrestMock(world);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const archived = await send(base, `/api/pages/${PAGE.parent}`, sessionHeaders(config, IDS.userB, IDS.homeB), patch({ archivedAt: ARCHIVED_AT }));
			assert.equal(archived.status, 200, archived.text);
			assert.equal(mock.page(PAGE.parent).archived_at, ARCHIVED_AT);
			assert.equal(mock.page(PAGE.child).archived_at, null);
			assert.deepEqual(cascadeIds(mock, 'PATCH'), []);
		});
	});
});

describe('a cascade stays inside P\'s workspace and ends on a parent_page_id cycle', () => {
	const asA = sessionHeaders(config, IDS.userA, IDS.homeA);
	/** A owns the team and P; B's shared X sits under P in `xWorkspace`. */
	function crossWorkspaceMock(xWorkspace) {
		const world = teamWorld();
		world.osionos_pages.push(teamPage(PAGE.parent, IDS.userA, 'shared', 'P', 'p text'), { ...under(teamPage(PAGE.child, IDS.userB, 'shared', 'X', 'x text'), PAGE.parent), workspace_id: xWorkspace });
		return createPostgrestMock(world);
	}
	for (const [opName, op] of Object.entries({ DELETE: OPS.DELETE, archive: OPS.archive })) {
		it(`${opName} of P leaves another user's child that moved to another workspace between the walk's two reads`, async () => {
			const mock = crossWorkspaceMock(IDS.team);
			const movingFetch = async (url, init) => {
				const answer = await mock.fetchImpl(url, init);
				if (new URL(url).searchParams.get('select') === 'id,parent_page_id') mock.page(PAGE.child).workspace_id = IDS.homeB;
				return answer;
			};
			const response = await withBridge(config, movingFetch, (base) => send(base, `/api/pages/${PAGE.parent}`, asA, op.init));
			assert.equal(response.status, 200, response.text);
			assert.equal(cascadeIds(mock, op.method).includes(PAGE.child), false);
			assert.equal(mock.page(PAGE.child)?.archived_at, null);
		});

		it(`${opName} of P neither reads nor writes a child that lives in another workspace`, async () => {
			const mock = crossWorkspaceMock(IDS.homeB);
			const response = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/pages/${PAGE.parent}`, asA, op.init));
			assert.equal(response.status, 200, response.text);
			assert.equal([...cascadeIds(mock, 'GET'), ...cascadeIds(mock, op.method)].includes(PAGE.child), false);
			assert.equal(mock.page(PAGE.child)?.archived_at, null);
		});

		it(`${opName} of P inside a P → X → Y → P cycle ends and names each page once`, async () => {
			const world = teamWorld();
			const [P, X, Y] = [PAGE.parent, PAGE.child, PAGE.grandchild];
			world.osionos_pages.push(under(teamPage(P, IDS.userA, 'private', 'P', 'p'), Y), under(teamPage(X, IDS.userA, 'private', 'X', 'x'), P), under(teamPage(Y, IDS.userA, 'private', 'Y', 'y'), X));
			const { mock, response } = await run(world, P, op.init, asA);
			assert.equal(response.status, 200, response.text);
			assert.deepEqual(cascadeIds(mock, op.method).toSorted(), (opName === 'DELETE' ? [P, X, Y] : [X, Y]).toSorted());
			if (opName === 'archive') assert.deepEqual([P, X, Y].map((id) => mock.page(id).archived_at), [ARCHIVED_AT, ARCHIVED_AT, ARCHIVED_AT]);
		});
	}
});

describe('a cascade stops at the first descendant it skips', () => {
	const middles = {
		'a middle page the caller cannot read': teamPage(PAGE.child, IDS.userA, 'private', 'X', 'x text'),
		'a readable middle page the caller may not change': teamPage(PAGE.child, IDS.userA, 'shared', 'X', 'x text'),
	};
	for (const [middleName, middle] of Object.entries(middles)) {
		for (const opName of ['DELETE', 'archive']) {
			it(`${opName} of P skips ${middleName} and the caller's own page below it`, async () => {
				const op = OPS[opName];
				const pages = [
					teamPage(PAGE.parent, CALLER, 'private', 'P', 'p text'),
					under(middle, PAGE.parent),
					under(teamPage(PAGE.grandchild, CALLER, 'private', 'Y', 'y text'), PAGE.child),
				];
				const { mock, response } = await run(callerWorld(ROLES['a viewer who owns P'].member, pages), PAGE.parent, op.init);
				assert.equal(response.status, 200, response.text);
				assert.deepEqual(cascadeIds(mock, op.method).filter((id) => id !== PAGE.parent), []);
				assert.equal(mock.page(PAGE.grandchild)?.archived_at, null);
				assert.equal(mock.page(PAGE.child)?.archived_at, null);
			});
		}
	}
});

describe('C551: an inherited no_access rule skips the descendant and its subtree', () => {
	const P = 'c3000000-0000-4000-8000-000000000001';
	const M = 'c3000000-0000-4000-8000-000000000002';
	const H = 'c3000000-0000-4000-8000-000000000003';
	const RULE = 'c3000000-0000-4000-8000-0000000000f1';

	function page(id, parent) {
		return { id, workspace_id: IDS.team, owner_id: IDS.userA, visibility: 'shared', title: `p ${id.slice(-4)}`, collaborators: [], properties: [], parent_page_id: parent, archived_at: null, content: [], created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' };
	}

	function world(withRule) {
		const base = teamWorld({ memberRole: 'editor' });
		// give B delete permission
		const m = base.osionos_workspace_members.find((r) => r.user_id === IDS.userB);
		if (m) m.permissions = ['create', 'read', 'update', 'delete'];
		base.osionos_pages.push(page(P, null), page(M, P), page(H, M));
		if (withRule) {
			base.osionos_share_rules = [{
				id: RULE, workspace_id: IDS.team, resource_type: 'page', resource_id: M,
				target: { type: 'user', userId: IDS.userB }, permission: 'no_access', explicit: true,
			}];
		}
		return base;
	}

	it('DELETE skips the rule-hidden descendant and its subtree, then deletes it once the rule is gone', async () => {
		const mock = createPostgrestMock(world(true));
		const asB = sessionHeaders(config, IDS.userB, IDS.homeB);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const deleted = await send(base, `/api/pages/${P}`, asB, { method: 'DELETE' });
			assert.equal(deleted.status, 200, deleted.text);
			// P and M deleted; H (hidden) kept.
			assert.equal(mock.page(H) !== undefined, true);
			assert.equal(mock.page(P), undefined);
		});
		// rule removed -> H deleted too
		const mock2 = createPostgrestMock(world(false));
		await withBridge(config, mock2.fetchImpl, async (base) => {
			const deleted = await send(base, `/api/pages/${P}`, sessionHeaders(config, IDS.userB, IDS.homeB), { method: 'DELETE' });
			assert.equal(deleted.status, 200, deleted.text);
			assert.equal(mock2.page(H), undefined);
		});
	});

	it('archive skips the rule-hidden descendant', async () => {
		const mock = createPostgrestMock(world(true));
		const asB = sessionHeaders(config, IDS.userB, IDS.homeB);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const archived = await send(base, `/api/pages/${P}`, asB, patch({ archivedAt: '2026-10-13T00:00:00.000Z' }));
			assert.equal(archived.status, 200, archived.text);
			assert.equal(mock.page(H).archived_at, null);
			assert.equal(mock.page(M).archived_at, null);
		});
	});
});

describe('C553: a truncated page-ref read fails the cascade with 503 and writes nothing', () => {
	it('DELETE returns 503 and writes nothing when the ref read hits the cap', async () => {
		const base = teamWorld();
		const P = 'c4000000-0000-4000-8000-000000000001';
		const C = 'c4000000-0000-4000-8000-000000000002';
		base.osionos_pages.push({ id: P, workspace_id: IDS.team, owner_id: IDS.userA, visibility: 'shared', title: 'P', collaborators: [], properties: [], parent_page_id: null, archived_at: null, content: [], created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' });
		base.osionos_pages.push({ id: C, workspace_id: IDS.team, owner_id: IDS.userA, visibility: 'shared', title: 'C', collaborators: [], properties: [], parent_page_id: P, archived_at: null, content: [], created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' });
		const mock = createPostgrestMock(base);
		const wrapped = async (url, init) => {
			const u = new URL(String(url));
			if (u.pathname.endsWith('/osionos_pages') && u.searchParams.get('select') === 'id,parent_page_id') {
				const rows = Array.from({ length: 20001 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, parent_page_id: null }));
				return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
			}
			return mock.fetchImpl(url, init);
		};
		await withBridge(config, wrapped, async (b) => {
			const r = await send(b, `/api/pages/${P}`, sessionHeaders(config, IDS.userA, IDS.homeA), { method: 'DELETE' });
			assert.equal(r.status, 503, r.text);
		});
	});
});
