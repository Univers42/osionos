/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-workspace-invite-accept.test.mjs            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// POST /api/invites/accept: the holder of the token, signed in as the account the invite was
// addressed to, becomes a member with the invite's role. The token is looked up by hash and
// the four refusals leak nothing about the invite.

import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDS, post, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';
import { ADMIN, INVITEE, OWNER, asInvitee, asStranger, backend, config, world, writes } from './support/workspace-invites-backend.mjs';

const ACCEPT = '/api/invites/accept';
const TOKEN = 'T'.repeat(43);
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const row = (extra = {}) => ({
	id: 'b0b0b0b0-0000-4000-8000-000000000001', workspace_id: IDS.team, email: 'bob@example.com', invited_user_id: INVITEE,
	role: 'viewer', token_hash: sha256(TOKEN), expires_at: new Date(Date.now() + 86_400_000).toISOString(), accepted_at: null,
	accepted_by: null, revoked_at: null, invited_by: OWNER, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', ...extra,
});
const accept = (headers, token = TOKEN) => (base) => send(base, ACCEPT, headers, post({ token }));
const members = (mock) => mock.rows('osionos_workspace_members');
const noMemberWrite = (mock) => writes(mock).every((call) => call.table !== 'osionos_workspace_members');

describe('POST /api/invites/accept', () => {
	it('writes the membership for the session user with the invite role, stamps the invite and publishes', async () => {
		const mock = backend({ seed: world({ invites: [row()] }) });
		const result = await withBridge(config, mock.fetchImpl, accept(asInvitee));
		assert.equal(result.status, 200, result.text);
		assert.deepEqual(result.body, { ok: true, workspaceId: IDS.team, role: 'viewer' });
		assert.deepEqual(
			members(mock).map(({ workspace_id: workspaceId, user_id: userId, role, permissions }) => ({ workspaceId, userId, role, permissions })),
			[{ workspaceId: IDS.team, userId: INVITEE, role: 'viewer', permissions: ['read'] }],
		);
		const [stored] = mock.rows('osionos_workspace_invites');
		assert.ok(stored.accepted_at);
		assert.equal(stored.accepted_by, INVITEE);
		assert.equal(mock.publishes.length, 2);
		assert.equal(mock.publishes[0].topic, `user:${INVITEE}`);
		assert.equal(mock.publishes[0].payload.op, 'added');
		assert.equal(mock.publishes[0].payload.role, 'viewer');
		// The owner learns of the join once, by id and display name only.
		const joined = mock.publishes.filter((frame) => frame.payload.op === 'member_joined');
		assert.deepEqual(joined.map((frame) => frame.topic), [`user:${OWNER}`]);
		assert.equal(joined[0].payload.workspaceId, IDS.team);
		assert.equal(joined[0].payload.member.userId, INVITEE);
		assert.equal(typeof joined[0].payload.member.name, 'string');
		assert.doesNotMatch(JSON.stringify(joined[0].payload), /@/);
	});

	// Accepts share one 10-per-minute bucket per user across this file: fold new assertions into an
	// existing accept rather than adding one, or the "accepting twice" case meets 429.
	it('tells an inviter who is not the owner as well as the owner, and never the invitee', async () => {
		const mock = backend({
			seed: world({ invites: [row({ invited_by: ADMIN })], members: [{ workspace_id: IDS.team, user_id: ADMIN, role: 'admin', permissions: ['read', 'write'] }] }),
		});
		const result = await withBridge(config, mock.fetchImpl, accept(asInvitee));
		assert.equal(result.status, 200, result.text);
		const topics = mock.publishes.filter((frame) => frame.payload.op === 'member_joined').map((frame) => frame.topic).sort();
		assert.deepEqual(topics, [`user:${ADMIN}`, `user:${OWNER}`].sort());
	});

	it('answers without a session with 401 sign_in_required and writes nothing', async () => {
		const mock = backend({ seed: world({ invites: [row()] }) });
		const result = await withBridge(config, mock.fetchImpl, (base) =>
			send(base, ACCEPT, { 'content-type': 'application/json' }, post({ token: TOKEN })));
		assert.equal(result.status, 401, result.text);
		assert.equal(result.body.code, 'sign_in_required');
		assert.deepEqual(writes(mock), []);
	});

	it('refuses another account holding the token: 403 invite_wrong_account, no membership', async () => {
		const mock = backend({ seed: world({ invites: [row()] }) });
		const result = await withBridge(config, mock.fetchImpl, accept(asStranger));
		assert.equal(result.status, 403, result.text);
		assert.equal(result.body.code, 'invite_wrong_account');
		assert.deepEqual([members(mock), mock.rows('osionos_workspace_invites')[0].accepted_at, mock.publishes], [[], null, []]);
	});

	const REFUSALS = [
		['an unknown token', row(), 'U'.repeat(43), 404, 'invite_not_found'],
		['a malformed token', row(), 'not a token', 404, 'invite_not_found'],
		['an expired invite', row({ expires_at: '2020-01-01T00:00:00.000Z' }), TOKEN, 410, 'invite_expired'],
		['a revoked invite', row({ revoked_at: '2026-10-02T00:00:00.000Z' }), TOKEN, 403, 'invite_revoked'],
		['an accepted invite', row({ accepted_at: '2026-10-02T00:00:00.000Z', accepted_by: INVITEE }), TOKEN, 410, 'invite_used'],
	];
	for (const [label, seeded, token, status, code] of REFUSALS) {
		it(`answers ${label} with ${status} ${code}, no membership, and no invite field in the body`, async () => {
			const mock = backend({ seed: world({ invites: [seeded] }) });
			const result = await withBridge(config, mock.fetchImpl, accept(asInvitee, token));
			assert.equal(result.status, status, result.text);
			assert.equal(result.body.code, code);
			assert.equal(noMemberWrite(mock), true);
			for (const secret of ['bob@example.com', IDS.team, INVITEE, 'viewer', 'editor', token, seeded.token_hash]) {
				assert.equal(result.text.includes(secret), false, `${code} leaked ${secret}`);
			}
		});
	}

	it('answers an existing member with 409 already_member: the role is unchanged and the invite stays as it was', async () => {
		const mock = backend({
			seed: world({ invites: [row({ role: 'admin' })], members: [{ workspace_id: IDS.team, user_id: INVITEE, role: 'viewer', permissions: ['read'] }] }),
		});
		const result = await withBridge(config, mock.fetchImpl, accept(asInvitee));
		assert.equal(result.status, 409, result.text);
		assert.equal(result.body.code, 'already_member');
		assert.deepEqual(members(mock).map((entry) => entry.role), ['viewer']);
		assert.deepEqual(writes(mock), []);
	});

	it('accepting twice writes one membership row; the second attempt is invite_used', async () => {
		const mock = backend({ seed: world({ invites: [row()] }) });
		const [first, second] = await withBridge(config, mock.fetchImpl, async (base) => [await accept(asInvitee)(base), await accept(asInvitee)(base)]);
		assert.equal(first.status, 200, first.text);
		assert.equal(second.status, 410, second.text);
		assert.equal(second.body.code, 'invite_used');
		assert.equal(members(mock).length, 1);
		assert.equal(mock.publishes.length, 2);
	});

	it('rate-limits the 11th accept of one session in a minute with 429', async () => {
		const sessionUser = '99999999-7777-4777-8777-999999999999';
		const asLimited = sessionHeaders(config, sessionUser, '98989898-7777-4777-8777-989898989898');
		const mock = backend({ seed: world() });
		const statuses = await withBridge(config, mock.fetchImpl, async (base) => {
			const out = [];
			for (let index = 0; index < 11; index += 1) out.push((await accept(asLimited, 'U'.repeat(43))(base)).status);
			return out;
		});
		assert.deepEqual(statuses.slice(0, 10), Array(10).fill(404));
		assert.equal(statuses[10], 429);
	});
});

