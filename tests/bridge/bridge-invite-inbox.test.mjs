/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-invite-inbox.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// N17/N18/N21/N23: the invitee's inbox reads only the caller's rows, hides blocks and
// non-friends under the flag, never leaks a secret or a workspace id, and declining is a
// filtered LIVE patch that the workspace list shows as Declined.

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDS, post, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';
import { INVITEE, OWNER, backend, config, world } from './support/workspace-invites-backend.mjs';

const ENV = { OSIONOS_INVITE_REQUIRES_CONNECTION: '1' };
const future = (days = 1) => new Date(Date.now() + days * 86_400_000).toISOString();
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const MINE = '/api/invites/mine';
const RESOLVE = '/api/invites/resolve';
const edge = (requester, addressee) => ({ requester_id: requester, addressee_id: addressee, status: 'accepted', source: 'manual' });

let seq = 0;
function row({ invitee, inviter = OWNER, workspace = IDS.team, role = 'viewer', created = '2026-10-01T00:00:00.000Z', ...extra } = {}) {
  seq += 1;
  const token = randomBytes(32).toString('base64url');
  return {
    id: randomUUID(), workspace_id: workspace, email: `person${seq}@example.com`, invited_user_id: invitee,
    role, token, token_hash: sha256(token), expires_at: future(), accepted_at: null, accepted_by: null,
    revoked_at: null, declined_at: null, invited_by: inviter, created_at: created, updated_at: created, ...extra,
  };
}

const as = (userId) => sessionHeaders(config, userId, randomUUID());
const calls = (mock, table, method = 'GET') => mock.calls.filter((call) => call.table === table && call.method === method);
const raw = (result) => JSON.stringify(result.body);

describe('N18 GET /api/invites/mine', () => {
  it('N18 returns exactly the five fields newest first, hiding blocks, non-friends and expired rows', async () => {
    const invitee = randomUUID();
    const stranger = randomUUID();
    const friend = OWNER;
    const older = row({ invitee, inviter: friend, created: '2026-10-01T00:00:00.000Z' });
    const newer = row({ invitee, inviter: friend, role: 'editor', created: '2026-10-05T00:00:00.000Z' });
    const blocked = row({ invitee, inviter: stranger });
    const expired = row({ invitee, inviter: friend, expires_at: '2020-01-01T00:00:00.000Z' });
    const mock = backend({
      seed: world({
        invites: [older, blocked, expired, newer],
        osionos_connections: [edge(friend, invitee)],
        osionos_user_blocks: [{ blocker_id: stranger, blocked_id: invitee }],
      }),
    });
    const result = await withBridge(config, mock.fetchImpl, (base) => send(base, MINE, as(invitee)), { env: ENV });
    assert.equal(result.status, 200, result.text);
    assert.deepEqual(Object.keys(result.body.invites[0]).sort(), ['expiresAt', 'id', 'inviterName', 'role', 'workspaceName']);
    assert.deepEqual(result.body.invites.map((invite) => invite.id), [newer.id, older.id]);
    assert.deepEqual(result.body.invites.map((invite) => invite.role), ['member', 'guest']);
    for (const secret of [older.token, newer.token, older.token_hash, newer.token_hash, older.email, newer.email, invitee, IDS.team]) {
      assert.equal(raw(result).includes(secret), false, `mine leaked ${secret}`);
    }
    assert.equal(calls(mock, 'osionos_workspace_invites', 'PATCH').length, 0);
    assert.equal(calls(mock, 'osionos_workspace_invites', 'DELETE').length, 0);
    assert.equal(calls(mock, 'osionos_workspace_invites').length, 1);
    assert.equal(calls(mock, 'osionos_workspaces').length, 1);
    assert.equal(calls(mock, 'osionos_people_directory').length, 1);
    assert.equal(calls(mock, 'osionos_user_blocks').length, 1);
    assert.equal(calls(mock, 'osionos_connections').length, 1);
  });

  it('N18 with the flag off shows a non-friend inviter and still hides a block in the other direction', async () => {
    const invitee = randomUUID();
    const stranger = randomUUID();
    const blocked = randomUUID();
    const mock = backend({
      seed: world({
        invites: [row({ invitee, inviter: stranger }), row({ invitee, inviter: blocked })],
        osionos_user_blocks: [{ blocker_id: invitee, blocked_id: blocked }],
      }),
    });
    const result = await withBridge(config, mock.fetchImpl, (base) => send(base, MINE, as(invitee)));
    assert.equal(result.status, 200, result.text);
    assert.deepEqual(result.body.invites.map((invite) => invite.inviterName), ['Member']);
  });

  it('N18 costs the same five reads for 1 and for 50 invites', async () => {
    const one = randomUUID();
    const many = randomUUID();
    const oneMock = backend({ seed: world({ invites: [row({ invitee: one })] }) });
    const manyMock = backend({
      seed: world({ invites: Array.from({ length: 50 }, (_, index) => row({ invitee: many, created: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString() })) }),
    });
    const single = await withBridge(config, oneMock.fetchImpl, (base) => send(base, MINE, as(one)));
    const fifty = await withBridge(config, manyMock.fetchImpl, (base) => send(base, MINE, as(many)));
    assert.equal(single.status, 200, single.text);
    assert.equal(fifty.status, 200, fifty.text);
    assert.equal(single.body.invites.length, 1);
    assert.equal(fifty.body.invites.length, 50);
    assert.equal(oneMock.calls.length, manyMock.calls.length);
    assert.equal(manyMock.calls.length, 5);
  });

  it('N18 answers 401 sign_in_required without a session and reads nothing', async () => {
    const mock = backend({ seed: world() });
    const result = await withBridge(config, mock.fetchImpl, (base) => send(base, MINE, {}));
    assert.equal(result.status, 401, result.text);
    assert.equal(result.body.code, 'sign_in_required');
    assert.deepEqual(mock.calls, []);
  });
});

describe('N17 no email comparison on the invitee routes', () => {
  it('N17 never sends an email filter from /mine, by-id accept, decline or resolve', async () => {
    const invitee = randomUUID();
    const mineMock = backend({ seed: world({ invites: [row({ invitee })] }) });
    await withBridge(config, mineMock.fetchImpl, (base) => send(base, MINE, as(invitee)));

    const ask = async (run) => {
      const accept = row({ invitee });
      const mock = backend({ seed: world({ invites: [accept] }) });
      await withBridge(config, mock.fetchImpl, (base) => run(base, accept));
      return mock;
    };
    const accepting = await ask((base, invite) => send(base, `/api/invites/${invite.id}/accept`, as(invitee), { method: 'POST' }));
    const declining = await ask((base, invite) => send(base, `/api/invites/${invite.id}/decline`, as(invitee), { method: 'POST' }));
    const resolving = await ask((base, invite) => send(base, RESOLVE, as(invitee), post({ token: invite.token })));

    for (const mock of [mineMock, accepting, declining, resolving]) {
      for (const call of mock.calls) {
        assert.equal(call.params.has('email'), false, `${call.table} filtered on email`);
        assert.equal(call.params.toString().includes('email='), false);
      }
    }
  });
});

describe('N23 POST /api/invites/resolve', () => {
  it('N23 answers the same 404 bytes for wrong account, revoked, expired, unknown and malformed', async () => {
    const recipient = randomUUID();
    const wrongRow = row({ invitee: recipient });
    const revokedRow = row({ invitee: recipient, revoked_at: '2026-10-02T00:00:00.000Z' });
    const expiredRow = row({ invitee: recipient, expires_at: '2020-01-01T00:00:00.000Z' });
    const unknownRow = row({ invitee: recipient });
    const cases = [
      ['wrong account', wrongRow, randomUUID(), wrongRow.token],
      ['revoked', revokedRow, recipient, revokedRow.token],
      ['expired', expiredRow, recipient, expiredRow.token],
      ['unknown', unknownRow, recipient, 'U'.repeat(43)],
      ['malformed', row({ invitee: recipient }), recipient, 'not a token'],
    ];
    const bodies = [];
    for (const [, seeded, caller, token] of cases) {
      const mock = backend({ seed: world({ invites: [seeded] }) });
      const result = await withBridge(config, mock.fetchImpl, (base) => send(base, RESOLVE, as(caller), post({ token })));
      assert.equal(result.status, 404, result.text);
      bodies.push(result.text);
    }
    assert.deepEqual(new Set(bodies).size, 1, bodies.join('\n'));
  });

  it('N23 resolves a live token to {id} for the caller only', async () => {
    const invitee = randomUUID();
    const seeded = row({ invitee });
    const mock = backend({ seed: world({ invites: [seeded] }) });
    const result = await withBridge(config, mock.fetchImpl, (base) => send(base, RESOLVE, as(invitee), post({ token: seeded.token })));
    assert.equal(result.status, 200, result.text);
    assert.deepEqual(result.body, { id: seeded.id });
    assert.equal(calls(mock, 'osionos_workspace_invites', 'PATCH').length, 0);
  });
});

describe('N21 declining an invite', () => {
  it('N21 decline then accept is refused, and the decline PATCH carries the LIVE filter', async () => {
    const invitee = randomUUID();
    const seeded = row({ invitee });
    const mock = backend({ seed: world({ invites: [seeded] }) });
    const [declined, accepted] = await withBridge(config, mock.fetchImpl, async (base) => [
      await send(base, `/api/invites/${seeded.id}/decline`, as(invitee), { method: 'POST' }),
      await send(base, `/api/invites/${seeded.id}/accept`, as(invitee), { method: 'POST' }),
    ]);
    assert.equal(declined.status, 200, declined.text);
    assert.deepEqual(declined.body, { ok: true });
    assert.equal(accepted.status, 410, accepted.text);
    assert.equal(accepted.body.code, 'invite_used');
    const [stored] = mock.rows('osionos_workspace_invites');
    assert.ok(stored.revoked_at);
    assert.ok(stored.declined_at);
    const patch = mock.calls.find((call) => call.table === 'osionos_workspace_invites' && call.method === 'PATCH' && call.body?.declined_at);
    assert.ok(patch, 'the decline patched declined_at');
    assert.equal(patch.params.get('accepted_at'), 'is.null');
    assert.equal(patch.params.get('revoked_at'), 'is.null');
    assert.equal(patch.params.get('invited_user_id'), `eq.${invitee}`);
  });

  it('N21 accept then decline is a 404: an accepted invite is no longer live', async () => {
    const invitee = randomUUID();
    const seeded = row({ invitee });
    const mock = backend({ seed: world({ invites: [seeded] }) });
    const [accepted, declined] = await withBridge(config, mock.fetchImpl, async (base) => [
      await send(base, `/api/invites/${seeded.id}/accept`, as(invitee), { method: 'POST' }),
      await send(base, `/api/invites/${seeded.id}/decline`, as(invitee), { method: 'POST' }),
    ]);
    assert.equal(accepted.status, 200, accepted.text);
    assert.equal(declined.status, 404, declined.text);
    assert.equal(declined.body.code, 'invite_not_found');
    const [stored] = mock.rows('osionos_workspace_invites');
    assert.equal(stored.declined_at, null);
  });

  it('N21 the workspace invite list carries declinedAt after a decline', async () => {
    const invitee = randomUUID();
    const seeded = row({ invitee });
    const mock = backend({ seed: world({ invites: [seeded] }) });
    const [decline, listed] = await withBridge(config, mock.fetchImpl, async (base) => [
      await send(base, `/api/invites/${seeded.id}/decline`, as(invitee), { method: 'POST' }),
      await send(base, `/api/workspaces/${IDS.team}/invites`, sessionHeaders(config, OWNER, IDS.homeA)),
    ]);
    assert.equal(decline.status, 200, decline.text);
    assert.equal(listed.status, 200, listed.text);
    assert.equal(listed.body.length, 1);
    assert.ok(listed.body[0].declinedAt);
    assert.equal(listed.body[0].declinedAt, listed.body[0].revokedAt);
  });

  it('N21 a decline of a non-live or another account\'s invite is the same 404', async () => {
    const invitee = randomUUID();
    const seeded = row({ invitee });
    const mock = backend({ seed: world({ invites: [seeded] }) });
    const [wrong, again] = await withBridge(config, mock.fetchImpl, async (base) => [
      await send(base, `/api/invites/${seeded.id}/decline`, as(randomUUID()), { method: 'POST' }),
      await send(base, `/api/invites/${randomUUID()}/decline`, as(invitee), { method: 'POST' }),
    ]);
    assert.equal(wrong.status, 404, wrong.text);
    assert.equal(again.status, 404, again.text);
    assert.equal(wrong.text, again.text);
  });
});
