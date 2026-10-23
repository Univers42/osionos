/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-workspace-lifecycle.test.mjs               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { grantSudo } from '../../scripts/bridge-guard.mjs';
import { IDS, createPostgrestMock, harnessConfig, sessionHeaders, withBridge } from './support/bridge-harness.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { tokenClaims } from './support/session-signin.mjs';

const config = harnessConfig();
const WS = IDS.team;
const OTHER_WS = 'c2c2c2c2-3333-4333-8333-c2c2c2c2c2c2';
const OWNER = IDS.userA;
const ADMIN = 'cccccccc-3333-4333-8333-cccccccccccc';
const MEMBER = IDS.userB;
const STRANGER = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';
const OWNER_PERMISSIONS = ['create', 'read', 'update', 'delete', 'admin'];
const DAY_MS = 86_400_000;
const TRANSFER_RPC = 'rpc/osionos_workspace_transfer_ownership';
const MARK_RPC = 'rpc/osionos_workspace_mark_delete';

const actors = {
	owner: sessionHeaders(config, OWNER, IDS.homeA),
	admin: sessionHeaders(config, ADMIN, 'c1c1c1c1-3333-4333-8333-c1c1c1c1c1c1', [WS]),
	member: sessionHeaders(config, MEMBER, IDS.homeB, [WS]),
	stranger: sessionHeaders(config, STRANGER, 'e1e1e1e1-5555-4555-8555-e1e1e1e1e1e1'),
};

function world({ extra = {}, members } = {}) {
	return {
		osionos_workspaces: [
			{ id: WS, owner_id: OWNER, name: 'Team', slug: 'team', visibility: 'confidential' },
			{ id: OTHER_WS, owner_id: OWNER, name: 'Second', slug: 'second', visibility: 'confidential' },
		],
		osionos_workspace_members: members ?? [
			{ workspace_id: WS, user_id: OWNER, role: 'owner', permissions: OWNER_PERMISSIONS },
			{ workspace_id: WS, user_id: ADMIN, role: 'admin', permissions: OWNER_PERMISSIONS },
			{ workspace_id: WS, user_id: MEMBER, role: 'editor', permissions: ['read', 'update'] },
			{ workspace_id: OTHER_WS, user_id: OWNER, role: 'owner', permissions: OWNER_PERMISSIONS },
		],
		osionos_pages: ['p1', 'p2', 'p3'].map((id, index) => ({ id: `d${index}d${index}d${index}d${index}-0000-4000-8000-000000000000`, workspace_id: WS, title: id })),
		osionos_share_rules: [
			{ id: 'r1', workspace_id: WS, target_key: `user:${MEMBER}:` },
			{ id: 'r2', workspace_id: WS, target_key: `user:${ADMIN}:` },
			{ id: 'r3', workspace_id: WS, target_key: 'workspace::' },
		],
		...extra,
	};
}

/** One call against a fresh bridge; `sudo` names the actor whose session holds a sudo grant. */
async function call(actor, method, suffix, { body, sudo = false, seed = world(), mockOptions, id = WS, before } = {}) {
	const mock = createPostgrestMock(seed, mockOptions);
	// `before(mock, url, init)` runs just ahead of each upstream request: the way a test makes a
	// concurrent writer land between the bridge's read and its write.
	const fetchImpl = before ? (url, init) => { before(mock, String(url), init ?? {}); return mock.fetchImpl(url, init); } : mock.fetchImpl;
	const kv = kvStub();
	const result = await withBridge(config, fetchImpl, async (base) => {
		if (sudo) {
			const claims = tokenClaims(actors[actor].authorization.slice('Bearer '.length));
			await grantSudo(kv, { userId: claims.sub, raw: { jti: claims.jti } });
		}
		const response = await fetch(`${base}/api/workspaces/${id}${suffix}`, { method, headers: actors[actor], body: body === undefined ? undefined : JSON.stringify(body) });
		const text = await response.text();
		return { status: response.status, text, body: text ? JSON.parse(text) : null };
	}, { kv });
	return { ...result, mock, workspace: mock.rows('osionos_workspaces').find((row) => row.id === WS), members: mock.rows('osionos_workspace_members').filter((row) => row.workspace_id === WS) };
}

const remove = (actor, options) => call(actor, 'DELETE', '', options);
const leave = (actor, options) => call(actor, 'POST', '/leave', options);
const transfer = (actor, toUserId, options) => call(actor, 'POST', '/members/transfer-ownership', { body: { toUserId }, ...options });
const writesTo = (mock, table, methods = ['POST', 'PATCH', 'DELETE']) => mock.calls.filter((entry) => entry.table === table && methods.includes(entry.method));
const ownerRows = (members) => members.filter((row) => row.role === 'owner');

describe('DELETE /api/workspaces/:id (staged)', () => {
	it('without a sudo grant answers 403 sudo_required and writes nothing', async () => {
		const result = await remove('owner');
		assert.equal(result.status, 403, result.text);
		assert.equal(result.body.code, 'sudo_required');
		assert.equal(result.workspace.pending_delete_at, undefined);
		assert.equal(writesTo(result.mock, 'osionos_bridge_audit_events').length, 0);
		assert.equal(writesTo(result.mock, 'osionos_workspaces').length, 0);
	});

	it('with a grant marks the workspace pending for 14 days and touches no data', async () => {
		const before = Date.now();
		const result = await remove('owner', { sudo: true });
		assert.equal(result.status, 200, result.text);
		assert.deepEqual([result.body.ok, result.body.pendingDelete, result.body.workspaceId], [true, true, WS]);
		const deadline = Date.parse(result.body.deleteAfter);
		assert.ok(Math.abs(deadline - (before + 14 * DAY_MS)) < 60_000, result.body.deleteAfter);
		assert.equal(result.workspace.delete_after, result.body.deleteAfter);
		assert.ok(result.workspace.pending_delete_at);
		const deletes = result.mock.calls.filter((entry) => entry.method === 'DELETE');
		assert.deepEqual(deletes, []);
		assert.equal(result.mock.rows('osionos_pages').length, 3);
		assert.equal(result.mock.rows('osionos_share_rules').length, 3);
		assert.equal(result.members.length, 3);
	});

	for (const [label, actor, status, code] of [['an admin member', 'admin', 403, 'forbidden'], ['a plain member', 'member', 403, 'forbidden'], ['a stranger', 'stranger', 404, 'workspace_not_found']]) {
		it(`${label} cannot delete even with a sudo grant (${status} ${code})`, async () => {
			const result = await remove(actor, { sudo: true });
			assert.equal(result.status, status, result.text);
			assert.equal(result.body.code, code);
			assert.equal(result.workspace.pending_delete_at, undefined);
			assert.equal(result.text.includes(OTHER_WS), false);
			assert.equal(writesTo(result.mock, 'osionos_bridge_audit_events').length, 0);
		});
	}

	it('writes the audit row before the workspace is marked, with the id and page count', async () => {
		const result = await remove('owner', { sudo: true });
		const auditAt = result.mock.calls.findIndex((entry) => entry.table === 'osionos_bridge_audit_events' && entry.method === 'POST');
		const markAt = result.mock.calls.findIndex((entry) => entry.table === MARK_RPC);
		assert.ok(auditAt >= 0 && markAt > auditAt, `audit ${auditAt} mark ${markAt}`);
		const row = result.mock.calls[auditAt].body;
		assert.equal(row.event_type, 'workspace.deleted');
		assert.deepEqual(row.details, { workspaceId: WS, pageCount: 3 });
		const token = actors.owner.authorization.slice('Bearer '.length);
		assert.equal(JSON.stringify(row).includes(token), false);
	});

	it('keeps the owner with at least one workspace they own', async () => {
		const seed = world();
		seed.osionos_workspaces.pop();
		const result = await remove('owner', { sudo: true, seed });
		assert.equal(result.status, 409, result.text);
		assert.equal(result.body.code, 'last_workspace');
		assert.equal(result.workspace.pending_delete_at, undefined);
	});

	it('marks through the one SQL function, bound to the session user, with a 14 day deadline', async () => {
		const result = await remove('owner', { sudo: true });
		const marks = result.mock.calls.filter((entry) => entry.table === MARK_RPC);
		assert.equal(marks.length, 1);
		assert.equal(marks[0].body.p_workspace, WS);
		assert.equal(marks[0].body.p_owner, OWNER);
		assert.equal(Date.parse(marks[0].body.p_after) - Date.parse(marks[0].body.p_now), 14 * DAY_MS);
		assert.equal(writesTo(result.mock, 'osionos_workspaces').length, 0, 'no separate count or PATCH');
	});

	it('two deletes of an owner\'s two workspaces: the second is 409 last_workspace and one survives', async () => {
		const mock = createPostgrestMock(world());
		const kv = kvStub();
		const statuses = await withBridge(config, mock.fetchImpl, async (base) => {
			const claims = tokenClaims(actors.owner.authorization.slice('Bearer '.length));
			await grantSudo(kv, { userId: claims.sub, raw: { jti: claims.jti } });
			const seen = [];
			for (const id of [WS, OTHER_WS]) {
				const reply = await fetch(`${base}/api/workspaces/${id}`, { method: 'DELETE', headers: actors.owner });
				seen.push([reply.status, (await reply.json()).code]);
			}
			return seen;
		}, { kv });
		assert.deepEqual(statuses.map(([status]) => status), [200, 409]);
		assert.equal(statuses[1][1], 'last_workspace');
		const survivors = mock.rows('osionos_workspaces').filter((row) => row.owner_id === OWNER && !row.pending_delete_at);
		assert.ok(survivors.length >= 1, 'the owner keeps a live workspace');
	});

	it('answers 409 owner_changed and marks nothing when the owner changes between the check and the mark', async () => {
		const before = (mock, url) => {
			if (url.includes('osionos_workspace_mark_delete')) mock.rows('osionos_workspaces').find((row) => row.id === WS).owner_id = MEMBER;
		};
		const result = await remove('owner', { sudo: true, before });
		assert.equal(result.status, 409, result.text);
		assert.equal(result.body.code, 'owner_changed');
		assert.equal(result.workspace.pending_delete_at, undefined);
	});

	it('re-stamps a workspace whose grace passed with no sweep, and refuses one still inside it', async () => {
		const stale = world();
		Object.assign(stale.osionos_workspaces[0], { pending_delete_at: '2026-09-01T00:00:00.000Z', delete_after: '2026-09-15T00:00:00.000Z' });
		const again = await remove('owner', { sudo: true, seed: stale });
		assert.equal(again.status, 200, again.text);
		assert.ok(Date.parse(again.workspace.delete_after) > Date.now() + 13 * DAY_MS);
		const live = world();
		Object.assign(live.osionos_workspaces[0], { pending_delete_at: '2026-10-01T00:00:00.000Z', delete_after: new Date(Date.now() + 3 * DAY_MS).toISOString() });
		const inside = await remove('owner', { sudo: true, seed: live });
		assert.equal(inside.status, 409, inside.text);
		assert.equal(inside.body.code, 'already_pending_delete');
	});

	it('is limited to 5 an hour and refuses a second delete of the same workspace', async () => {
		const mock = createPostgrestMock(world());
		const kv = kvStub();
		const statuses = await withBridge(config, mock.fetchImpl, async (base) => {
			const claims = tokenClaims(actors.owner.authorization.slice('Bearer '.length));
			await grantSudo(kv, { userId: claims.sub, raw: { jti: claims.jti } });
			const seen = [];
			for (let attempt = 0; attempt < 6; attempt += 1) {
				seen.push((await fetch(`${base}/api/workspaces/${WS}`, { method: 'DELETE', headers: actors.owner })).status);
			}
			return seen;
		}, { kv });
		assert.deepEqual(statuses, [200, 409, 409, 409, 409, 429]);
	});
});

describe('POST /api/workspaces/:id/cancel-delete', () => {
	const pending = (deleteAfter) => {
		const seed = world();
		Object.assign(seed.osionos_workspaces[0], { pending_delete_at: '2026-10-01T00:00:00.000Z', delete_after: deleteAfter });
		return seed;
	};
	const future = () => new Date(Date.now() + 5 * DAY_MS).toISOString();

	it('clears the flag inside the window', async () => {
		const result = await call('owner', 'POST', '/cancel-delete', { sudo: true, seed: pending(future()) });
		assert.equal(result.status, 200, result.text);
		assert.deepEqual([result.body.ok, result.body.cancelled], [true, true]);
		assert.equal(result.workspace.pending_delete_at, null);
		assert.equal(result.workspace.delete_after, null);
		const patch = result.mock.calls.find((entry) => entry.table === 'osionos_workspaces' && entry.method === 'PATCH');
		assert.equal(patch.params.get('pending_delete_at'), 'not.is.null');
	});

	it('answers 409 not_pending_delete when another cancel lands between the read and the write', async () => {
		const before = (mock, url, init) => {
			if (init.method === 'PATCH') mock.rows('osionos_workspaces').find((row) => row.id === WS).pending_delete_at = null;
		};
		const result = await call('owner', 'POST', '/cancel-delete', { sudo: true, seed: pending(future()), before });
		assert.equal(result.status, 409, result.text);
		assert.equal(result.body.code, 'not_pending_delete');
	});

	for (const [label, actor, sudo, seed, status, code] of [
		['without sudo', 'owner', false, pending(future()), 403, 'sudo_required'],
		['by an admin', 'admin', true, pending(future()), 403, 'forbidden'],
		['when nothing is pending', 'owner', true, world(), 409, 'not_pending_delete'],
		['after the window closed', 'owner', true, pending('2026-10-02T00:00:00.000Z'), 409, 'grace_expired'],
	]) {
		it(`${label} answers ${status} ${code} and leaves the flag`, async () => {
			const result = await call(actor, 'POST', '/cancel-delete', { sudo, seed });
			assert.equal(result.status, status, result.text);
			assert.equal(result.body.code, code);
			assert.equal(result.workspace.pending_delete_at, seed.osionos_workspaces[0].pending_delete_at);
		});
	}
});

describe('POST /api/workspaces/:id/leave', () => {
	it('lets a plain member leave without sudo, drops only their membership and share rules', async () => {
		const result = await leave('member');
		assert.equal(result.status, 200, result.text);
		assert.deepEqual([result.body.ok, result.body.left], [true, true]);
		assert.deepEqual(result.members.map((row) => row.user_id).sort(), [ADMIN, OWNER].sort());
		assert.deepEqual(result.mock.rows('osionos_share_rules').map((row) => row.id), ['r2', 'r3']);
		assert.equal(result.text.includes(OTHER_WS), false);
		assert.equal(result.mock.calls.some((entry) => String(entry.params).includes(OTHER_WS)), false);
	});

	it('refuses the owner with 409 is_owner and keeps exactly one owner row', async () => {
		const result = await leave('owner');
		assert.equal(result.status, 409, result.text);
		assert.equal(result.body.code, 'is_owner');
		assert.match(result.body.message, /Transfer ownership before you leave\./);
		assert.equal(ownerRows(result.members).length, 1);
	});

	it('refuses the owner of a one-member workspace', async () => {
		const members = [{ workspace_id: WS, user_id: OWNER, role: 'owner', permissions: OWNER_PERMISSIONS }];
		const result = await leave('owner', { seed: world({ members }) });
		assert.equal(result.status, 409, result.text);
		assert.equal(result.body.code, 'is_owner');
		assert.equal(ownerRows(result.members).length, 1);
	});

	it('does not remove a member who became the owner after the read (409 is_owner)', async () => {
		const before = (mock, url, init) => {
			if (init.method === 'DELETE' && url.includes('osionos_workspace_members')) {
				mock.rows('osionos_workspace_members').find((row) => row.user_id === MEMBER).role = 'owner';
			}
		};
		const result = await leave('member', { before });
		assert.equal(result.status, 409, result.text);
		assert.equal(result.body.code, 'is_owner');
		assert.ok(result.members.some((row) => row.user_id === MEMBER), 'the new owner keeps their row');
	});

	it('drops a share rule whose key carries an upper-case user id', async () => {
		const seed = world();
		seed.osionos_share_rules[0].target_key = `user:${MEMBER.toUpperCase()}:`;
		const result = await leave('member', { seed });
		assert.equal(result.status, 200, result.text);
		assert.deepEqual(result.mock.rows('osionos_share_rules').map((row) => row.id), ['r2', 'r3']);
	});

	it('answers an unknown workspace id like a non-member, not 404 workspace_not_found', async () => {
		const result = await leave('stranger', { id: 'f0f0f0f0-6666-4666-8666-f0f0f0f0f0f0' });
		assert.equal(result.status, 404, result.text);
		assert.equal(result.body.code, 'not_a_member');
	});

	it('answers a non-member 404 not_a_member and removes nothing', async () => {
		const result = await leave('stranger');
		assert.equal(result.status, 404, result.text);
		assert.equal(result.body.code, 'not_a_member');
		assert.equal(result.members.length, 3);
		assert.equal(result.mock.rows('osionos_share_rules').length, 3);
	});
});

describe('POST /api/workspaces/:id/members/transfer-ownership', () => {
	it('without sudo answers 403 sudo_required and changes neither row', async () => {
		const result = await transfer('owner', MEMBER);
		assert.equal(result.status, 403, result.text);
		assert.equal(result.body.code, 'sudo_required');
		assert.equal(result.workspace.owner_id, OWNER);
		assert.deepEqual(result.members.map((row) => row.role), ['owner', 'admin', 'editor']);
		assert.equal(result.mock.calls.some((entry) => entry.table === TRANSFER_RPC), false);
	});

	it('with sudo hands the workspace over in one call and keeps exactly one owner', async () => {
		const result = await transfer('owner', MEMBER, { sudo: true });
		assert.equal(result.status, 200, result.text);
		const roleOf = (userId) => result.members.find((row) => row.user_id === userId).role;
		assert.deepEqual([roleOf(MEMBER), roleOf(OWNER)], ['owner', 'admin']);
		assert.deepEqual(result.members.find((row) => row.user_id === MEMBER).permissions, OWNER_PERMISSIONS);
		assert.equal(result.workspace.owner_id, MEMBER);
		assert.equal(ownerRows(result.members).length, 1);
		assert.deepEqual(result.body.members.find((row) => row.userId === MEMBER).role, 'owner');
		const rpcCalls = result.mock.calls.filter((entry) => entry.table === TRANSFER_RPC);
		assert.equal(rpcCalls.length, 1);
		assert.deepEqual(rpcCalls[0].body, { p_workspace: WS, p_from: OWNER, p_to: MEMBER });
		assert.equal(writesTo(result.mock, 'osionos_workspace_members').length, 0, 'two requests would not be atomic');
	});

	it('gives an owner who has no member row an admin row', async () => {
		const members = [{ workspace_id: WS, user_id: MEMBER, role: 'editor', permissions: ['read'] }];
		const result = await transfer('owner', MEMBER, { sudo: true, seed: world({ members }) });
		assert.equal(result.status, 200, result.text);
		assert.deepEqual(result.members.map((row) => [row.user_id, row.role]).sort(), [[MEMBER, 'owner'], [OWNER, 'admin']].sort());
	});

	it('refuses a target that is not a member with 404 member_not_found', async () => {
		const result = await transfer('owner', STRANGER, { sudo: true });
		assert.equal(result.status, 404, result.text);
		assert.equal(result.body.code, 'member_not_found');
		assert.equal(result.workspace.owner_id, OWNER);
	});

	for (const [actor, status, code] of [['admin', 403, 'forbidden'], ['member', 403, 'forbidden'], ['stranger', 404, 'workspace_not_found']]) {
		it(`refuses ${actor} with ${status} ${code}`, async () => {
			const result = await transfer(actor, ADMIN, { sudo: true });
			assert.equal(result.status, status, result.text);
			assert.equal(result.body.code, code);
			assert.equal(result.workspace.owner_id, OWNER);
			assert.equal(result.text.includes(OTHER_WS), false);
		});
	}

	for (const [label, toUserId, status, code] of [['a malformed target', 'not-a-uuid', 422, 'invalid_target'], ['the owner as target', OWNER, 409, 'already_owner']]) {
		it(`refuses ${label}`, async () => {
			const result = await transfer('owner', toUserId, { sudo: true });
			assert.equal(result.status, status, result.text);
			assert.equal(result.body.code, code);
			assert.equal(result.mock.calls.some((entry) => entry.table === TRANSFER_RPC), false);
		});
	}

	it('refuses a workspace scheduled for deletion with 409 pending_delete and never calls the function', async () => {
		const seed = world();
		Object.assign(seed.osionos_workspaces[0], { pending_delete_at: '2026-10-01T00:00:00.000Z', delete_after: new Date(Date.now() + 5 * DAY_MS).toISOString() });
		const result = await transfer('owner', MEMBER, { sudo: true, seed });
		assert.equal(result.status, 409, result.text);
		assert.equal(result.body.code, 'pending_delete');
		assert.equal(result.workspace.owner_id, OWNER);
		assert.equal(result.mock.calls.some((entry) => entry.table === TRANSFER_RPC), false);
	});

	it('answers 409 transfer_conflict when the function refuses under its locks', async () => {
		const result = await transfer('owner', MEMBER, { sudo: true, mockOptions: { rpc: { osionos_workspace_transfer_ownership: () => false } } });
		assert.equal(result.status, 409, result.text);
		assert.equal(result.body.code, 'transfer_conflict');
	});
});
