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

// Pending email invites: only an owner/admin may create, list, resend or revoke, the account
// must exist (exact email match — GoTrue's filter is a containment search), the token is
// stored hashed, and creating an invite writes no membership (accept does: see
// bridge-workspace-invite-accept.test.mjs).

import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDS, patch, post, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';
import {
	ADMIN, ALL_PERMISSIONS, INVITEE, INVITEE_EMAIL, OWNER, OWNER_EMAIL,
	asAdmin, asInvitee, asOwner, asStranger, backend, config, invitePath, world, writes,
} from './support/workspace-invites-backend.mjs';

const RATE_OWNER = 'ffffffff-6666-4666-8666-ffffffffffff';
const asRateOwner = sessionHeaders(config, RATE_OWNER, 'f1f1f1f1-6666-4666-8666-f1f1f1f1f1f1');

const invite = (body) => post(body);
const memberPath = (userId) => `/api/workspaces/${IDS.team}/members/${userId}`;
const pendingRows = (mock) => mock.rows('osionos_workspace_invites');
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const HOUR_MS = 3_600_000;

describe('POST /api/workspaces/:id/invites', () => {
	it('lets the owner invite an existing email: a pending row, a token once, no membership, no publish', async () => {
		const mock = backend();
		const before = Date.now();
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, invitePath, asOwner, invite({ email: ` ${INVITEE_EMAIL.toUpperCase()} `, role: 'member' })));

		assert.equal(result.status, 200, result.text);
		assert.equal(result.body.ok, true);
		assert.equal(result.body.invite.email, INVITEE_EMAIL);
		assert.equal(result.body.invite.role, 'member');
		assert.equal(result.body.invite.invitedBy, OWNER);
		assert.equal(result.body.invite.acceptedAt, null);
		assert.equal(result.body.invite.revokedAt, null);
		assert.match(result.body.token, /^[A-Za-z0-9_-]{43}$/);
		assert.equal(result.body.acceptUrl, `${config.appUrl}/?invite=${result.body.token}`);
		const ttl = Date.parse(result.body.invite.expiresAt) - before;
		assert.ok(Math.abs(ttl - 7 * 24 * HOUR_MS) < 60_000, `expiresAt is now + 7 days, got ${ttl}ms`);

		// The membership write moved to accept: a POST only writes the pending row.
		assert.deepEqual(writes(mock).map((call) => call.table), ['osionos_workspace_invites']);
		assert.equal(mock.publishes.length, 0);
		const [row] = pendingRows(mock);
		assert.deepEqual(
			{ workspace_id: row.workspace_id, invited_user_id: row.invited_user_id, role: row.role, invited_by: row.invited_by },
			{ workspace_id: IDS.team, invited_user_id: INVITEE, role: 'editor', invited_by: OWNER },
		);
	});

	it('stores only the sha256 of the token — no column holds the plaintext', async () => {
		const mock = backend();
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, invitePath, asOwner, invite({ email: INVITEE_EMAIL, role: 'member' })));
		const [row] = pendingRows(mock);
		assert.equal(row.token_hash, sha256(result.body.token));
		assert.equal(JSON.stringify(row).includes(result.body.token), false);
		assert.equal(JSON.stringify(result.body.invite).includes('token'), false);
	});

	it('mints a different token for every invite', async () => {
		const tokens = new Set();
		for (const email of [INVITEE_EMAIL, 'carol@example.com']) {
			const mock = backend({ users: [{ id: INVITEE, email }] });
			const result = await withBridge(config, mock.fetchImpl, (base) =>
				send(base, invitePath, asOwner, invite({ email, role: 'guest' })));
			tokens.add(result.body.token);
		}
		assert.equal(tokens.size, 2);
	});

	it('replaces the live invite of the same account: one row, a new token, the old hash gone', async () => {
		const mock = backend();
		const [first, second] = await withBridge(config, mock.fetchImpl, async (base) => [
			await send(base, invitePath, asOwner, invite({ email: INVITEE_EMAIL, role: 'guest' })),
			await send(base, invitePath, asOwner, invite({ email: INVITEE_EMAIL, role: 'member' })),
		]);
		assert.equal(second.status, 200, second.text);
		assert.notEqual(first.body.token, second.body.token);
		assert.equal(first.body.invite.id, second.body.invite.id);
		const rows = pendingRows(mock);
		assert.equal(rows.length, 1);
		assert.equal(rows[0].token_hash, sha256(second.body.token));
		assert.equal(rows[0].role, 'editor');
	});

	it('never upserts against the partial unique index (PostgREST cannot infer it: 42P10)', async () => {
		const mock = backend();
		await withBridge(config, mock.fetchImpl, async (base) => {
			await send(base, invitePath, asOwner, invite({ email: INVITEE_EMAIL, role: 'guest' }));
			await send(base, invitePath, asOwner, invite({ email: INVITEE_EMAIL, role: 'guest' }));
		});
		const inviteWrites = writes(mock).filter((call) => call.table === 'osionos_workspace_invites');
		assert.deepEqual(inviteWrites.map((call) => call.method), ['POST', 'PATCH']);
		assert.equal(inviteWrites.some((call) => call.params.has('on_conflict')), false);
	});

	it('invites again after the first invite was accepted: a new pending row', async () => {
		const accepted = { id: 'a0a0a0a0-0000-4000-8000-000000000001', workspace_id: IDS.team, invited_user_id: INVITEE, accepted_at: '2026-10-01T00:00:00.000Z' };
		const mock = backend({ seed: world({ invites: [accepted] }) });
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, invitePath, asOwner, invite({ email: INVITEE_EMAIL, role: 'guest' })));
		assert.equal(result.status, 200, result.text);
		assert.equal(pendingRows(mock).length, 2);
	});

	it('answers an existing member with 409 already_member and creates no pending row', async () => {
		const mock = backend({
			seed: world({ members: [{ workspace_id: IDS.team, user_id: INVITEE, role: 'viewer', permissions: ['read'] }] }),
		});
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, invitePath, asOwner, invite({ email: INVITEE_EMAIL, role: 'admin' })));
		assert.equal(result.status, 409, result.text);
		assert.equal(result.body.code, 'already_member');
		assert.deepEqual([writes(mock), mock.publishes], [[], []]);
	});

	it('lets an admin invite a guest or a member', async () => {
		for (const [role, stored] of [['guest', 'viewer'], ['member', 'editor']]) {
			const mock = backend({
				seed: world({ members: [{ workspace_id: IDS.team, user_id: ADMIN, role: 'admin', permissions: ALL_PERMISSIONS }] }),
			});
			const result = await withBridge(config, mock.fetchImpl, (base) =>
				send(base, invitePath, asAdmin, invite({ email: INVITEE_EMAIL, role })));
			assert.equal(result.status, 200, result.text);
			assert.equal(pendingRows(mock)[0].role, stored);
		}
	});

	it('refuses an admin inviting an admin (C15): only the owner grants admin', async () => {
		const mock = backend({
			seed: world({ members: [{ workspace_id: IDS.team, user_id: ADMIN, role: 'admin', permissions: ALL_PERMISSIONS }] }),
		});
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, invitePath, asAdmin, invite({ email: INVITEE_EMAIL, role: 'admin' })));
		assert.equal(result.status, 403, result.text);
		assert.deepEqual([writes(mock), mock.publishes], [[], []]);
	});

	it('lets the owner invite an admin', async () => {
		const mock = backend();
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, invitePath, asOwner, invite({ email: INVITEE_EMAIL, role: 'admin' })));
		assert.equal(result.status, 200, result.text);
		assert.equal(pendingRows(mock)[0].role, 'admin');
	});

	for (const [label, headers, status] of [['a plain member', asInvitee, 403], ['a stranger', asStranger, 404]]) {
		it(`refuses ${label} (${status}) writing and publishing nothing`, async () => {
			const mock = backend({
				seed: world({ members: [{ workspace_id: IDS.team, user_id: INVITEE, role: 'editor', permissions: ['read'] }] }),
			});
			const result = await withBridge(config, mock.fetchImpl, (base) =>
				send(base, invitePath, headers, invite({ email: OWNER_EMAIL, role: 'member' })));
			assert.equal(result.status, status, result.text);
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

const PENDING = {
	id: 'b0b0b0b0-0000-4000-8000-000000000001', workspace_id: IDS.team, email: INVITEE_EMAIL, invited_user_id: INVITEE,
	role: 'editor', token_hash: sha256('old-token'), expires_at: '2030-01-01T00:00:00.000Z', accepted_at: null,
	accepted_by: null, revoked_at: null, invited_by: OWNER, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
};
const NEWER = { ...PENDING, id: 'b0b0b0b0-0000-4000-8000-000000000002', email: 'carol@example.com', created_at: '2026-10-02T00:00:00.000Z', token_hash: sha256('other') };
const inviteUrl = (id, suffix = '') => `${invitePath}/${id}${suffix}`;

describe('GET /api/workspaces/:id/invites', () => {
	it('answers a real empty list for an owner with no invites', async () => {
		const mock = backend();
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, invitePath, asOwner));
		assert.equal(result.status, 200, result.text);
		assert.deepEqual(result.body, []);
	});

	it('lists the workspace rows newest first with only the client fields — never token_hash', async () => {
		const elsewhere = { ...PENDING, id: 'b0b0b0b0-0000-4000-8000-000000000003', workspace_id: IDS.homeA };
		const mock = backend({ seed: world({ invites: [PENDING, NEWER, elsewhere] }) });
		const result = await withBridge(config, mock.fetchImpl, (base) => send(base, invitePath, asOwner));
		assert.equal(result.status, 200, result.text);
		assert.deepEqual(result.body.map((entry) => entry.id), [NEWER.id, PENDING.id]);
		assert.deepEqual(Object.keys(result.body[0]).sort(), ['acceptedAt', 'createdAt', 'declinedAt', 'email', 'expiresAt', 'id', 'invitedBy', 'revokedAt', 'role']);
		assert.equal(result.body[1].role, 'member');
		assert.equal(/token|hash|invited_user/i.test(result.text), false);
	});

	for (const [label, headers, status] of [['a plain member', asInvitee, 403], ['a stranger', asStranger, 404]]) {
		it(`refuses ${label} with ${status}, never an empty list`, async () => {
			const mock = backend({
				seed: world({ invites: [PENDING], members: [{ workspace_id: IDS.team, user_id: INVITEE, role: 'editor', permissions: ['read'] }] }),
			});
			const result = await withBridge(config, mock.fetchImpl, (base) => send(base, invitePath, headers));
			assert.equal(result.status, status, result.text);
			assert.equal(result.text.includes(INVITEE_EMAIL), false);
		});
	}
});

describe('POST /api/workspaces/:id/invites/:inviteId/resend', () => {
	it('rotates the token and pushes the expiry out, returning the plaintext once', async () => {
		const soon = { ...PENDING, expires_at: new Date(Date.now() + HOUR_MS).toISOString() };
		const mock = backend({ seed: world({ invites: [soon] }) });
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, inviteUrl(PENDING.id, '/resend'), asOwner, { method: 'POST' }));
		assert.equal(result.status, 200, result.text);
		assert.match(result.body.token, /^[A-Za-z0-9_-]{43}$/);
		assert.equal(result.body.acceptUrl, `${config.appUrl}/?invite=${result.body.token}`);
		const [row] = pendingRows(mock);
		assert.equal(row.token_hash, sha256(result.body.token));
		assert.notEqual(row.token_hash, PENDING.token_hash);
		assert.ok(Date.parse(row.expires_at) - Date.now() > 6 * 24 * HOUR_MS);
	});

	for (const [label, patchRow] of [['unknown', null], ['revoked', { revoked_at: '2026-10-02T00:00:00.000Z' }], ['accepted', { accepted_at: '2026-10-02T00:00:00.000Z' }]]) {
		it(`answers a ${label} invite with 404 invite_not_found and writes nothing`, async () => {
			const mock = backend({ seed: world({ invites: patchRow ? [{ ...PENDING, ...patchRow }] : [] }) });
			const result = await withBridge(config, mock.fetchImpl, (base) =>
				send(base, inviteUrl(PENDING.id, '/resend'), asOwner, { method: 'POST' }));
			assert.equal(result.status, 404, result.text);
			assert.equal(result.body.code, 'invite_not_found');
			assert.deepEqual(writes(mock), []);
		});
	}

	it('refuses a plain member (403) and a stranger (404)', async () => {
		for (const [headers, status] of [[asInvitee, 403], [asStranger, 404]]) {
			const mock = backend({
				seed: world({ invites: [PENDING], members: [{ workspace_id: IDS.team, user_id: INVITEE, role: 'editor', permissions: ['read'] }] }),
			});
			const result = await withBridge(config, mock.fetchImpl, (base) =>
				send(base, inviteUrl(PENDING.id, '/resend'), headers, { method: 'POST' }));
			assert.equal(result.status, status, result.text);
			assert.deepEqual(writes(mock), []);
		}
	});
});

describe('DELETE /api/workspaces/:id/invites/:inviteId', () => {
	it('sets revoked_at, and a second revoke is a 200 no-op', async () => {
		const mock = backend({ seed: world({ invites: [PENDING] }) });
		const [first, second] = await withBridge(config, mock.fetchImpl, async (base) => [
			await send(base, inviteUrl(PENDING.id), asOwner, { method: 'DELETE' }),
			await send(base, inviteUrl(PENDING.id), asOwner, { method: 'DELETE' }),
		]);
		assert.equal(first.status, 200, first.text);
		assert.equal(second.status, 200, second.text);
		const [row] = pendingRows(mock);
		assert.ok(row.revoked_at);
		assert.equal(writes(mock).filter((call) => call.table === 'osionos_workspace_invites').length, 1);
	});

	it('answers an unknown invite with 404 invite_not_found', async () => {
		const mock = backend();
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, inviteUrl(PENDING.id), asOwner, { method: 'DELETE' }));
		assert.equal(result.status, 404, result.text);
		assert.equal(result.body.code, 'invite_not_found');
	});

	it('refuses a plain member (403) and a stranger (404) and revokes nothing', async () => {
		for (const [headers, status] of [[asInvitee, 403], [asStranger, 404]]) {
			const mock = backend({
				seed: world({ invites: [PENDING], members: [{ workspace_id: IDS.team, user_id: INVITEE, role: 'editor', permissions: ['read'] }] }),
			});
			const result = await withBridge(config, mock.fetchImpl, (base) =>
				send(base, inviteUrl(PENDING.id), headers, { method: 'DELETE' }));
			assert.equal(result.status, status, result.text);
			assert.equal(pendingRows(mock)[0].revoked_at, null);
		}
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

	it('refuses an admin promoting a member to admin (C15 on the role route), with no write', async () => {
		const mock = backend({ seed: world({ members: memberRows }) });
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, memberPath(INVITEE), asAdmin, patch({ role: 'admin' })));
		assert.equal(result.status, 403, result.text);
		assert.deepEqual(writes(mock), []);
	});

	it('refuses an admin changing an admin role, and lets the owner do both', async () => {
		const mock = backend({ seed: world({ members: memberRows }) });
		const refused = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, memberPath(ADMIN), asAdmin, patch({ role: 'member' })));
		assert.equal(refused.status, 403, refused.text);
		assert.deepEqual(writes(mock), []);
		const promoted = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, memberPath(INVITEE), asOwner, patch({ role: 'admin' })));
		assert.equal(promoted.status, 200, promoted.text);
		const demoted = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, memberPath(ADMIN), asOwner, patch({ role: 'member' })));
		assert.equal(demoted.status, 200, demoted.text);
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
