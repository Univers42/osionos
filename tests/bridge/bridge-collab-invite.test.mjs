/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-collab-invite.test.mjs                      :+:      :+:    :+:    */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// T4 (C513): POST /api/collaboration/:id/invite is CONSENT-ONLY. It creates the
// same pending workspace invite as POST /api/workspaces/:id/invites (a row in
// osionos_workspace_invites) and writes NO membership row: the invitee becomes a
// member only by accepting. A caller who is neither owner nor admin gets 403 and
// nothing is written.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { URL } from 'node:url';

import { createCollabHandler } from '../../scripts/bridge-collab.mjs';

const SPACE = '11111111-1111-4111-8111-111111111111';
const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const ADMIN = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const EDITOR = 'cccccccc-3333-4333-8333-cccccccccccc';
const TARGET = 'dddddddd-4444-4444-8444-dddddddddddd';
const INVITE_ID = '99999999-9999-4999-8999-999999999999';
const CONFIG = { allowedOrigin: '*', appUrl: 'https://app.test', baasUrl: 'http://baas.test', serviceKey: 'service-key' };

function fakeResponse() {
  const written = { status: 0, body: null };
  return {
    written,
    writeHead(status) { written.status = status; },
    end(text) { written.body = text ? JSON.parse(text) : null; },
  };
}

function inviteRequest(role) {
  const json = JSON.stringify({ userId: TARGET, ...(role === undefined ? {} : { role }) });
  return {
    method: 'POST',
    headers: { authorization: 'Bearer app-session', 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() { yield json; },
  };
}

function reply(value, status = 200) {
  return {
    ok: status < 400,
    status,
    text: async () => JSON.stringify(value),
    json: async () => value,
  };
}

/**
 * The GoTrue admin read plus the PostgREST tables the invite path touches. `members`
 * decides what the actor (and the invitee) are: no row means not a member.
 */
function backend({ members = [] } = {}) {
  const calls = [];
  const fetchImpl = async (urlString, init = {}) => {
    const url = new URL(String(urlString));
    const method = (init.method ?? 'GET').toUpperCase();
    const body = init.body === undefined ? null : JSON.parse(init.body);
    calls.push({ method, path: url.pathname, params: url.searchParams, body, prefer: init.headers?.Prefer ?? '' });

    if (url.pathname.startsWith('/auth/v1/admin/users/')) {
      assert.equal(decodeURIComponent(url.pathname.slice('/auth/v1/admin/users/'.length)), TARGET);
      return reply({ id: TARGET, email: 'target@example.com' });
    }
    if (url.pathname === '/rest/v1/osionos_workspaces') {
      return reply([{ id: SPACE, owner_id: OWNER, name: 'Space', slug: 'space', visibility: 'confidential' }]);
    }
    if (url.pathname === '/rest/v1/osionos_workspace_members') {
      const userId = url.searchParams.get('user_id')?.replace('eq.', '');
      return reply(members.filter((row) => row.user_id === userId && row.workspace_id === SPACE));
    }
    if (url.pathname === '/rest/v1/osionos_workspace_invites') {
      if (method === 'GET') return reply([]); // no live invite for this account yet
      if (method === 'POST') {
        return reply([{
          id: INVITE_ID,
          email: body.email,
          role: body.role,
          invited_by: body.invited_by,
          expires_at: body.expires_at,
          created_at: body.created_at,
        }], 201);
      }
    }
    return reply([]);
  };
  return { fetchImpl, calls };
}

function handlerWith({ fetchImpl, userId }) {
  return createCollabHandler({
    config: CONFIG,
    verifySession: () => ({ userId }),
    fetchImpl,
    env: {},
  });
}

async function invite(backendOptions, userId, role) {
  const baas = backend(backendOptions);
  const response = fakeResponse();
  const handled = await handlerWith({ fetchImpl: baas.fetchImpl, userId })(
    new URL(`http://h/api/collaboration/${SPACE}/invite`),
    inviteRequest(role),
    response,
    CONFIG,
  );
  return { handled, response: response.written, calls: baas.calls };
}

const posts = (calls, table) => calls.filter((call) => call.method === 'POST' && call.path === `/rest/v1/${table}`);

describe('collab invite is consent-only (T4 / C513)', () => {
  it('the OWNER gets a pending invite and NO membership row', async () => {
    const { handled, response, calls } = await invite({}, OWNER);
    assert.equal(handled, true);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      ok: true,
      workspaceId: SPACE,
      userId: TARGET,
      role: 'viewer',
      inviteId: INVITE_ID,
      pending: true,
    });

    const invitePosts = posts(calls, 'osionos_workspace_invites');
    assert.equal(invitePosts.length, 1, 'one pending invite row created');
    assert.equal(invitePosts[0].body.workspace_id, SPACE);
    assert.equal(invitePosts[0].body.invited_user_id, TARGET);
    assert.equal(invitePosts[0].body.email, 'target@example.com');
    assert.equal(invitePosts[0].body.role, 'viewer', 'guest maps to the read-only DB role');
    assert.ok(invitePosts[0].body.token_hash, 'the token is stored hashed');
    assert.equal(posts(calls, 'osionos_workspace_members').length, 0, 'no member row is written');
  });

  it('a workspace ADMIN may also invite (no member row)', async () => {
    const members = [{ workspace_id: SPACE, user_id: ADMIN, role: 'admin', permissions: ['admin'] }];
    const { response, calls } = await invite({ members }, ADMIN);
    assert.equal(response.status, 200);
    assert.equal(response.body.pending, true);
    assert.equal(posts(calls, 'osionos_workspace_invites').length, 1);
    assert.equal(posts(calls, 'osionos_workspace_members').length, 0);
  });

  it('a NON-admin member is refused 403 with no invite and no member write', async () => {
    const members = [{ workspace_id: SPACE, user_id: EDITOR, role: 'editor', permissions: ['read'] }];
    const { response, calls } = await invite({ members }, EDITOR);
    assert.equal(response.status, 403);
    assert.equal(posts(calls, 'osionos_workspace_invites').length, 0);
    assert.equal(posts(calls, 'osionos_workspace_members').length, 0);
  });

  it('maps an explicit member role to editor and returns the invite answer link', async () => {
    const { response, calls } = await invite({}, OWNER, 'member');
    assert.equal(response.status, 200);
    assert.equal(response.body.role, 'editor');
    assert.equal(response.body.invite.id, INVITE_ID);
    assert.equal(response.body.invite.role, 'member');
    assert.match(response.body.acceptUrl, /^https:\/\/app\.test\/\?invite=[A-Za-z0-9_-]{43}$/);
    assert.equal(posts(calls, 'osionos_workspace_invites')[0].body.role, 'editor');
  });

  it('refuses an admin invite from a workspace admin', async () => {
    const members = [{ workspace_id: SPACE, user_id: ADMIN, role: 'admin', permissions: ['admin'] }];
    const { response, calls } = await invite({ members }, ADMIN, 'admin');
    assert.equal(response.status, 403);
    assert.equal(posts(calls, 'osionos_workspace_invites').length, 0);
  });

  for (const role of ['owner', 'x']) {
    it(`refuses the unknown ${role} role with 422`, async () => {
      const { response, calls } = await invite({}, OWNER, role);
      assert.equal(response.status, 422);
      assert.equal(response.body.message, 'role must be admin|member|guest.');
      assert.equal(posts(calls, 'osionos_workspace_invites').length, 0);
    });
  }
});
