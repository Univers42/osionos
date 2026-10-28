/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-invite-accept-by-id.test.mjs                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// N19/N20/N25/N27/N28: the token accept and the by-id accept are one function. Every refusal
// row runs through both routes; the inviter's authority is re-checked inside acceptInviteRow.

import { createHash, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDS, post, send, sessionHeaders, withBridge } from './support/bridge-harness.mjs';
import { ADMIN, INVITEE, INVITEE_EMAIL, OWNER, asInvitee, backend, config, world } from './support/workspace-invites-backend.mjs';

const TOKEN = 'T'.repeat(43);
const ENV = { OSIONOS_INVITE_REQUIRES_CONNECTION: '1' };
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const future = (days = 1) => new Date(Date.now() + days * 86_400_000).toISOString();
const as = (userId) => sessionHeaders(config, userId, randomUUID());

function row({ invitee, inviter = OWNER, role = 'viewer', ...extra } = {}) {
  return {
    id: randomUUID(), workspace_id: IDS.team, email: 'invitee@example.com', invited_user_id: invitee,
    role, token_hash: sha256(TOKEN), expires_at: future(), accepted_at: null, accepted_by: null,
    revoked_at: null, declined_at: null, invited_by: inviter, created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z', ...extra,
  };
}

const intents = (headers) => [
  ['token', (base, invite) => send(base, '/api/invites/accept', headers, post({ token: TOKEN }))],
  ['by-id', (base, invite) => send(base, `/api/invites/${invite.id}/accept`, headers, { method: 'POST' })],
];

async function runBoth(seed, headers, env = {}) {
  const invite = seed.osionos_workspace_invites[0];
  const out = {};
  for (const [name, run] of intents(headers)) {
    const mock = backend({ seed });
    out[name] = { result: await withBridge(config, mock.fetchImpl, (base) => run(base, invite), { env }), mock };
  }
  return out;
}

describe('N19 one accept function, every case through both routes', () => {
  const cases = [
    ['a live invite', (invitee) => row({ invitee }), () => ({}), {}, 200, 200],
    ['a revoked invite', (invitee) => row({ invitee, revoked_at: '2026-10-02T00:00:00.000Z' }), () => ({}), {}, 403, 403],
    ['an accepted invite', (invitee) => row({ invitee, accepted_at: '2026-10-02T00:00:00.000Z', accepted_by: invitee }), () => ({}), {}, 410, 410],
    ['an expired invite', (invitee) => row({ invitee, expires_at: '2020-01-01T00:00:00.000Z' }), () => ({}), {}, 410, 410],
    ['a declined invite', (invitee) => row({ invitee, revoked_at: '2026-10-02T00:00:00.000Z', declined_at: '2026-10-02T00:00:00.000Z' }), () => ({}), {}, 410, 410],
    ['an existing member', (invitee) => row({ invitee }), (invitee) => ({ members: [{ workspace_id: IDS.team, user_id: invitee, role: 'viewer', permissions: ['read'] }] }), {}, 409, 409],
    ['a blocked invitee', (invitee) => row({ invitee }), (invitee) => ({ osionos_user_blocks: [{ blocker_id: invitee, blocked_id: OWNER }] }), ENV, 410, 410],
    ['a non-friend with the flag on', (invitee) => row({ invitee }), () => ({}), ENV, 410, 410],
    ['a demoted inviter (N20)', (invitee) => row({ invitee, invited_by: ADMIN }), () => ({ members: [{ workspace_id: IDS.team, user_id: ADMIN, role: 'editor', permissions: ['create', 'read', 'update', 'delete'] }] }), {}, 410, 410],
  ];

  for (const [label, makeRow, extra, env, tokenStatus, idStatus] of cases) {
    it(`N19 ${label} answers ${tokenStatus} from both routes`, async () => {
      const invitee = randomUUID();
      const both = await runBoth(world({ invites: [makeRow(invitee)], ...extra(invitee) }), as(invitee), env);
      assert.equal(both.token.result.status, tokenStatus, both.token.result.text);
      assert.equal(both['by-id'].result.status, idStatus, both['by-id'].result.text);
      assert.equal(both.token.result.body.code, both['by-id'].result.body.code);
      if (tokenStatus === 200) {
        assert.deepEqual(both.token.result.body, { ok: true, workspaceId: IDS.team, role: 'viewer' });
        assert.deepEqual(both['by-id'].result.body, both.token.result.body);
        for (const side of [both.token, both['by-id']]) {
          assert.equal(side.mock.calls.filter((call) => call.table === 'osionos_workspace_members' && call.method === 'POST').length, 1);
        }
      } else {
        assert.equal(both.token.mock.calls.filter((call) => call.table === 'osionos_workspace_members' && call.method === 'POST').length, 0);
        assert.equal(both['by-id'].mock.calls.filter((call) => call.table === 'osionos_workspace_members' && call.method === 'POST').length, 0);
      }
    });
  }

  it('N19 wrong account keeps the token route\'s 403 but the id route never confirms the id (404)', async () => {
    const invitee = randomUUID();
    const both = await runBoth(world({ invites: [row({ invitee })] }), as(randomUUID()));
    assert.equal(both.token.result.status, 403, both.token.result.text);
    assert.equal(both.token.result.body.code, 'invite_wrong_account');
    assert.equal(both['by-id'].result.status, 404, both['by-id'].result.text);
    assert.equal(both['by-id'].result.body.code, 'invite_not_found');
  });

  for (const [name] of intents(asInvitee)) {
    it(`N19 a double accept through the ${name} route is one 200 and one 410`, async () => {
      const invitee = randomUUID();
      const seeded = row({ invitee });
      const mock = backend({ seed: world({ invites: [seeded] }) });
      const run = intents(as(invitee)).find(([label]) => label === name)[1];
      const [first, second] = await withBridge(config, mock.fetchImpl, async (base) => Promise.all([run(base, seeded), run(base, seeded)]));
      assert.deepEqual([first.status, second.status].sort(), [200, 410]);
      assert.equal(mock.rows('osionos_workspace_members').length, 1);
      assert.equal(mock.publishes.length, 1);
    });
  }
});

describe('N20 inviter authority', () => {
  it('N20 revokes the invite and answers 410 when the inviter is neither owner nor admin', async () => {
    const invitee = randomUUID();
    const both = await runBoth(
      world({
        invites: [row({ invitee, invited_by: ADMIN })],
        members: [{ workspace_id: IDS.team, user_id: ADMIN, role: 'viewer', permissions: ['read'] }],
      }),
      as(invitee),
    );
    for (const side of [both.token, both['by-id']]) {
      assert.equal(side.result.status, 410, side.result.text);
      assert.equal(side.result.body.code, 'invite_used');
      const [stored] = side.mock.rows('osionos_workspace_invites');
      assert.ok(stored.revoked_at, 'a stale-authority invite is revoked');
      assert.equal(side.mock.rows('osionos_workspace_members').filter((member) => member.user_id === invitee).length, 0);
    }
  });
});

describe('N28 flag-off parity', () => {
  it('N28 with the flag unset both routes write the membership and read no friendship table', async () => {
    const invitee = randomUUID();
    const both = await runBoth(world({ invites: [row({ invitee })] }), as(invitee));
    for (const side of [both.token, both['by-id']]) {
      assert.equal(side.result.status, 200, side.result.text);
      assert.equal(side.mock.rows('osionos_workspace_members').length, 1);
      assert.equal(side.mock.calls.filter((call) => call.table === 'osionos_connections' || call.table === 'osionos_user_blocks').length, 0);
    }
  });
});

describe('N27 session and friendship gate', () => {
  it('N27 every new invitee route answers 401 sign_in_required without a session', async () => {
    const seeded = row({ invitee: INVITEE });
    const mock = backend({ seed: world({ invites: [seeded] }) });
    const results = await withBridge(config, mock.fetchImpl, async (base) => [
      await send(base, '/api/invites/mine', {}),
      await send(base, '/api/invites/resolve', {}, post({ token: TOKEN })),
      await send(base, `/api/invites/${seeded.id}/accept`, {}, { method: 'POST' }),
      await send(base, `/api/invites/${seeded.id}/decline`, {}, { method: 'POST' }),
    ]);
    for (const result of results) {
      assert.equal(result.status, 401, result.text);
      assert.equal(result.body.code, 'sign_in_required');
    }
    assert.deepEqual(mock.calls, []);
  });

  it('N27 the by-id route cannot bypass the connection gate: a non-friend gets 410 and a revocation', async () => {
    const invitee = randomUUID();
    const both = await runBoth(world({ invites: [row({ invitee })] }), as(invitee), ENV);
    assert.equal(both['by-id'].result.status, 410, both['by-id'].result.text);
    assert.equal(both['by-id'].result.body.code, 'invite_used');
    assert.ok(both['by-id'].mock.rows('osionos_workspace_invites')[0].revoked_at);
    assert.deepEqual(both['by-id'].mock.rows('osionos_workspace_members'), []);
  });
});

describe('N25 re-invite after a decline', () => {
  it('N25 re-inviting the same account after a decline creates a new live invite through saveInviteForAccount', async () => {
    const seeded = row({ invitee: INVITEE, revoked_at: '2026-10-02T00:00:00.000Z', declined_at: '2026-10-02T00:00:00.000Z' });
    const mock = backend({ seed: world({ invites: [seeded] }) });
    const result = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/workspaces/${IDS.team}/invites`, sessionHeaders(config, OWNER, IDS.homeA), post({ email: INVITEE_EMAIL, role: 'guest' })));
    assert.equal(result.status, 200, result.text);
    const rows = mock.rows('osionos_workspace_invites');
    assert.equal(rows.length, 2);
    assert.equal(rows.filter((invite) => !invite.accepted_at && !invite.revoked_at).length, 1);
    assert.ok(rows.find((invite) => invite.id === seeded.id).declined_at, 'the declined history row stays');
    assert.ok(result.body.token);
  });

  it('N25 re-invite still refuses a non-friend with the flag on', async () => {
    const seeded = row({ invitee: INVITEE, revoked_at: '2026-10-02T00:00:00.000Z', declined_at: '2026-10-02T00:00:00.000Z' });
    const mock = backend({ seed: world({ invites: [seeded] }) });
    const result = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/workspaces/${IDS.team}/invites`, sessionHeaders(config, OWNER, IDS.homeA), post({ email: INVITEE_EMAIL, role: 'guest' })), { env: ENV });
    assert.equal(result.status, 409, result.text);
    assert.equal(result.body.code, 'not_connected');
    assert.equal(mock.rows('osionos_workspace_invites').length, 1);
  });
});
