/* ************************************************************************** */
/*                                                                            */
/*   bridge-workspace-invites.test.mjs                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Server-side email invites: only an owner/admin may invite, the account must
// exist (exact email match — GoTrue's filter is a containment search), the
// membership upsert is the only write, and the invitee hears it on `user:<id>`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDS, createPostgrestMock, harnessConfig, patch, post, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const OWNER = IDS.userA;
const INVITEE = IDS.userB;
const ADMIN = 'cccccccc-3333-4333-8333-cccccccccccc';
const STRANGER = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';
const RATE_OWNER = 'ffffffff-6666-4666-8666-ffffffffffff';
const HOME_ADMIN = 'c1c1c1c1-3333-4333-8333-c1c1c1c1c1c1';
const HOME_STRANGER = 'e1e1e1e1-5555-4555-8555-e1e1e1e1e1e1';
const HOME_RATE = 'f1f1f1f1-6666-4666-8666-f1f1f1f1f1f1';

const asOwner = sessionHeaders(config, OWNER, IDS.homeA);
const asInvitee = sessionHeaders(config, INVITEE, IDS.homeB);
const asAdmin = sessionHeaders(config, ADMIN, HOME_ADMIN);
const asStranger = sessionHeaders(config, STRANGER, HOME_STRANGER);
const asRateOwner = sessionHeaders(config, RATE_OWNER, HOME_RATE);

const OWNER_EMAIL = 'alice@example.com';
const INVITEE_EMAIL = 'bob@example.com';
const ALL_PERMISSIONS = ['create', 'read', 'update', 'delete', 'admin'];

function json(value, status = 200) {
	return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function world({ owner = OWNER, members = [] } = {}) {
	return {
		osionos_workspaces: [{ id: IDS.team, owner_id: owner, name: 'Team', slug: 'team', visibility: 'confidential' }],
		osionos_workspace_members: members,
		osionos_people_directory: [
			{ user_id: OWNER, display_name: 'Alice', profile: { avatar: 'alice.png' } },
			{ user_id: INVITEE, display_name: 'Bob', profile: { avatar: 'bob.png' } },
		],
	};
}

/** PostgREST harness + a GoTrue admin list + a publish recorder. */
function backend({ seed = world(), users = [{ id: INVITEE, email: INVITEE_EMAIL, user_metadata: { full_name: 'Bob' } }], lookupStatus = 200 } = {}) {
	const mock = createPostgrestMock(seed);
	const publishes = [];
	const authCalls = [];
	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		if (parsed.pathname === '/auth/v1/admin/users') {
			const filter = String(parsed.searchParams.get('filter') ?? '').toLowerCase();
			authCalls.push(filter);
			if (lookupStatus !== 200) return json({ message: 'identity store unavailable' }, lookupStatus);
			return json({ users: users.filter((user) => String(user.email).toLowerCase().includes(filter)) });
		}
		if (parsed.pathname === '/v1/publish') {
			publishes.push(JSON.parse(init.body));
			return json({ ok: true });
		}
		return mock.fetchImpl(url, init);
	};
	return { ...mock, fetchImpl, publishes, authCalls };
}

const invite = (body) => post(body);
const invitePath = `/api/workspaces/${IDS.team}/invites`;
const memberPath = (userId) => `/api/workspaces/${IDS.team}/members/${userId}`;
const writes = (mock) => mock.calls.filter((call) => call.method !== 'GET');

describe('POST /api/workspaces/:id/invites', () => {
	it('lets the owner invite an existing email as member — one editor upsert + one publish', async () => {
		const mock = backend();
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, invitePath, asOwner, invite({ email: ` ${INVITEE_EMAIL.toUpperCase()} `, role: 'member' })));

		assert.equal(result.status, 200, result.text);
		assert.equal(result.body.status, 'added');
		assert.equal(result.body.invite.email, INVITEE_EMAIL);
		assert.equal(result.body.invite.role, 'member');
		assert.equal(result.body.invite.workspaceId, IDS.team);
		assert.equal(result.body.invite.revokedAt, null);
		assert.equal(result.body.invite.token, '');
		assert.equal(result.body.member.userId, INVITEE);
		assert.equal(result.body.member.role, 'editor');

		const upserts = writes(mock).filter((call) => call.table === 'osionos_workspace_members');
		assert.equal(upserts.length, 1);
		const row = upserts[0].body;
		assert.deepEqual(
			{ workspace_id: row.workspace_id, user_id: row.user_id, role: row.role, permissions: row.permissions },
			{
				workspace_id: IDS.team, user_id: INVITEE, role: 'editor',
				permissions: ['create', 'read', 'update', 'delete'],
			},
		);

		assert.equal(mock.publishes.length, 1);
		const published = mock.publishes[0];
		assert.equal(published.topic, `user:${INVITEE}`);
		assert.equal(published.event_type, 'workspace_membership');
		assert.equal(published.payload.op, 'added');
		assert.equal(published.payload.workspaceId, IDS.team);
		assert.deepEqual(published.payload.by, { userId: OWNER, name: 'Alice' });
	});

	it('reports an existing membership as updated', async () => {
		const mock = backend({
			seed: world({ members: [{ workspace_id: IDS.team, user_id: INVITEE, role: 'viewer', permissions: ['read'] }] }),
		});
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, invitePath, asOwner, invite({ email: INVITEE_EMAIL, role: 'admin' })));
		assert.equal(result.status, 200, result.text);
		assert.equal(result.body.status, 'updated');
		assert.equal(result.body.member.role, 'admin');
	});

	it('lets an admin invite', async () => {
		const mock = backend({
			seed: world({ members: [{ workspace_id: IDS.team, user_id: ADMIN, role: 'admin', permissions: ALL_PERMISSIONS }] }),
		});
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, invitePath, asAdmin, invite({ email: INVITEE_EMAIL, role: 'guest' })));
		assert.equal(result.status, 200, result.text);
		assert.equal(result.body.member.role, 'viewer');
	});

	for (const [label, headers] of [['a plain member', asInvitee], ['a stranger', asStranger]]) {
		it(`refuses ${label} (403) writing and publishing nothing`, async () => {
			const mock = backend({
				seed: world({ members: [{ workspace_id: IDS.team, user_id: INVITEE, role: 'editor', permissions: ['read'] }] }),
			});
			const result = await withBridge(config, mock.fetchImpl, (base) =>
				send(base, invitePath, headers, invite({ email: OWNER_EMAIL, role: 'member' })));
			assert.equal(result.status, 403, result.text);
			assert.deepEqual([writes(mock), mock.publishes], [[], []]);
		});
	}

	it('answers an unknown email with 404 no_account and writes nothing', async () => {
		const mock = backend({ users: [] });
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, invitePath, asOwner, invite({ email: INVITEE_EMAIL, role: 'member' })));
		assert.equal(result.status, 404, result.text);
		assert.equal(result.body.code, 'no_account');
		assert.match(result.body.message, /sign up/i);
		assert.deepEqual([writes(mock), mock.publishes], [[], []]);
	});

	it('fails closed with 502 when the GoTrue lookup errors', async () => {
		const mock = backend({ lookupStatus: 500 });
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, invitePath, asOwner, invite({ email: INVITEE_EMAIL, role: 'member' })));
		assert.equal(result.status, 502, result.text);
		assert.deepEqual([writes(mock), mock.publishes], [[], []]);
	});

	it('does not accept a filter result that only CONTAINS the email', async () => {
		const mock = backend({ users: [{ id: INVITEE, email: 'xdylan@gmail.com' }] });
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, invitePath, asOwner, invite({ email: 'dylan@gmail.com', role: 'member' })));
		assert.equal(result.status, 404, result.text);
		assert.equal(result.body.code, 'no_account');
		assert.deepEqual([writes(mock), mock.publishes], [[], []]);
	});

	it('refuses an invite of the owner (409 is_owner)', async () => {
		const mock = backend({ users: [{ id: OWNER, email: OWNER_EMAIL }] });
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, invitePath, asOwner, invite({ email: OWNER_EMAIL, role: 'member' })));
		assert.equal(result.status, 409, result.text);
		assert.equal(result.body.code, 'is_owner');
		assert.deepEqual([writes(mock), mock.publishes], [[], []]);
	});

	it('rejects a bad role or email with 422 before any lookup/write', async () => {
		for (const body of [
			{ email: INVITEE_EMAIL, role: 'owner' },
			{ email: 'not-an-email', role: 'member' },
		]) {
			const mock = backend();
			const result = await withBridge(config, mock.fetchImpl, (base) => send(base, invitePath, asOwner, invite(body)));
			assert.equal(result.status, 422, result.text);
			assert.deepEqual(mock.authCalls, []);
			assert.deepEqual([writes(mock), mock.publishes], [[], []]);
		}
	});

	it('GET answers an empty list for an owner (no pending invites by design)', async () => {
		const mock = backend();
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, invitePath, asOwner));
		assert.equal(result.status, 200, result.text);
		assert.deepEqual(result.body, []);
	});

	it('rate-limits the 21st invite in a burst with 429', async () => {
		const mock = backend({ seed: world({ owner: RATE_OWNER }) });
		const statuses = await withBridge(config, mock.fetchImpl, async (base) => {
			const out = [];
			for (let index = 0; index < 21; index += 1) {
				const result = await send(base, invitePath, asRateOwner, invite({ email: INVITEE_EMAIL, role: 'guest' }));
				out.push(result.status);
			}
			return out;
		});
		assert.deepEqual(statuses.slice(0, 20), Array(20).fill(200));
		assert.equal(statuses[20], 429);
	});
});

describe('PATCH/DELETE /api/workspaces/:id/members/:userId', () => {
	const memberRows = [
		{ workspace_id: IDS.team, user_id: OWNER, role: 'owner', permissions: ALL_PERMISSIONS },
		{ workspace_id: IDS.team, user_id: ADMIN, role: 'admin', permissions: ALL_PERMISSIONS },
		{ workspace_id: IDS.team, user_id: INVITEE, role: 'viewer', permissions: ['read'] },
	];

	it('lets an admin change a member role and publishes op role', async () => {
		const mock = backend({ seed: world({ members: memberRows }) });
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, memberPath(INVITEE), asAdmin, patch({ role: 'member' })));
		assert.equal(result.status, 200, result.text);
		assert.equal(result.body.member.role, 'editor');
		const row = mock.rows('osionos_workspace_members').find((entry) => entry.user_id === INVITEE);
		assert.equal(row.role, 'editor');
		assert.deepEqual(row.permissions, ['create', 'read', 'update', 'delete']);
		assert.equal(mock.publishes.length, 1);
		assert.equal(mock.publishes[0].topic, `user:${INVITEE}`);
		assert.equal(mock.publishes[0].payload.op, 'role');
	});

	it('refuses to change the owner row (409)', async () => {
		const mock = backend({ seed: world({ members: memberRows }) });
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, memberPath(OWNER), asAdmin, patch({ role: 'member' })));
		assert.equal(result.status, 409, result.text);
		assert.equal(result.body.code, 'is_owner');
		assert.deepEqual(writes(mock), []);
	});

	it('lets a member remove themself', async () => {
		const mock = backend({ seed: world({ members: memberRows }) });
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, memberPath(INVITEE), asInvitee, { method: 'DELETE' }));
		assert.equal(result.status, 200, result.text);
		assert.equal(mock.rows('osionos_workspace_members').some((entry) => entry.user_id === INVITEE), false);
		assert.equal(mock.publishes.length, 1);
		assert.equal(mock.publishes[0].topic, `user:${INVITEE}`);
		assert.equal(mock.publishes[0].payload.op, 'removed');
	});

	it('refuses to remove the owner (409 even for an admin)', async () => {
		const mock = backend({ seed: world({ members: memberRows }) });
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, memberPath(OWNER), asAdmin, { method: 'DELETE' }));
		assert.equal(result.status, 409, result.text);
		assert.equal(result.body.code, 'is_owner');
		assert.deepEqual(writes(mock), []);
	});

	it('refuses a plain member removing someone else (403)', async () => {
		const mock = backend({ seed: world({ members: memberRows }) });
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, memberPath(ADMIN), asInvitee, { method: 'DELETE' }));
		assert.equal(result.status, 403, result.text);
		assert.equal(mock.rows('osionos_workspace_members').some((entry) => entry.user_id === ADMIN), true);
		assert.deepEqual(writes(mock), []);
	});
});
