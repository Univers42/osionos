/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-rtc.test.mjs                                 :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 15:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 15:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * §Sec1 gate: the collab realtime-token endpoint mints a token scoped to ONE
 * Shared space and gates it on membership. Proves: HS256 over JWT_SECRET, exact
 * per-space namespace (no wildcard, no cross-space), member→200, non-member→403.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { mintRealtimeToken, createCollabHandler } from '../../scripts/bridge-collab.mjs';

const SECRET = 'unit-test-jwt-secret';
const SPACE = '11111111-1111-4111-8111-111111111111';

function decodeVerified(token, secret) {
  const [header, payload, signature] = String(token).split('.');
  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  assert.equal(signature, expected, 'token is HS256-signed with the gateway secret (JWT_SECRET)');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

function fakeResponse() {
  return {
    statusCode: 0, body: null, headersSent: false,
    writeHead(status) { this.statusCode = status; this.headersSent = true; return this; },
    end(serialized) { this.body = serialized ? JSON.parse(serialized) : null; },
  };
}

function postRequest() {
  return { method: 'POST', headers: { authorization: 'Bearer app-session' } };
}

function fakeBaas({ owner, memberRows }) {
  return async (urlString) => {
    const url = String(urlString);
    let rows = [];
    if (url.includes('osionos_workspaces')) rows = [{ id: SPACE, owner_id: owner, name: 'Space', slug: 's', visibility: 'request_to_join' }];
    else if (url.includes('osionos_workspace_members')) rows = memberRows;
    return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
  };
}

function handlerWith(fetchImpl) {
  return createCollabHandler({
    config: { allowedOrigin: '*', baasUrl: 'http://baas', serviceKey: 'service-key' },
    verifySession: () => ({ userId: 'U' }),
    fetchImpl,
    env: { JWT_SECRET: SECRET },
  });
}

describe('collab realtime token (AOC §Sec1)', () => {
  it('mints a token scoped to exactly one space namespace', () => {
    const { token, expiresAt } = mintRealtimeToken({ secret: SECRET, userId: 'U', namespaces: [`collab:${SPACE}`] });
    const claims = decodeVerified(token, SECRET);
    assert.deepEqual(claims.namespaces, [`collab:${SPACE}`]);
    assert.equal(claims.sub, 'U');
    assert.equal(claims.can_subscribe, true);
    assert.equal(claims.can_publish, true);
    assert.ok(claims.exp > Math.floor(Date.now() / 1000), 'not already expired');
    assert.ok(Date.parse(expiresAt) > Date.now());
  });

  it('a space-A token grants NO access to space B and no wildcard (§Sec3)', () => {
    const { token } = mintRealtimeToken({ secret: SECRET, userId: 'U', namespaces: ['collab:A'] });
    const claims = decodeVerified(token, SECRET);
    assert.ok(!claims.namespaces.includes('collab:B'), 'cannot reach another space');
    assert.ok(!claims.namespaces.includes('*'), 'never all-access');
  });

  it('refuses to mint without a signing secret (fail-closed)', () => {
    assert.throws(() => mintRealtimeToken({ secret: '', userId: 'U', namespaces: ['collab:A'] }), /secret/i);
  });

  it('grants a member a per-space token (200)', async () => {
    const url = new URL(`http://h/api/collaboration/${SPACE}/realtime-token`);
    const res = fakeResponse();
    const handled = await handlerWith(fakeBaas({ owner: 'OWNER', memberRows: [{ user_id: 'U' }] }))(url, postRequest(), res);
    assert.equal(handled, true);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.token);
    assert.deepEqual(decodeVerified(res.body.token, SECRET).namespaces, [`collab:${SPACE}`]);
  });

  it('denies a non-member (403, no token)', async () => {
    const url = new URL(`http://h/api/collaboration/${SPACE}/realtime-token`);
    const res = fakeResponse();
    await handlerWith(fakeBaas({ owner: 'OWNER', memberRows: [] }))(url, postRequest(), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body?.token, undefined);
  });
});

describe('collab file seed gate (AOC §4/§6)', () => {
  function uploadRequest() {
    return { method: 'POST', headers: { authorization: 'Bearer app-session', 'content-type': 'application/pdf' } };
  }

  it('denies a non-member uploading a file (403, no storage write)', async () => {
    const hits = [];
    const fetchImpl = async (urlString) => {
      hits.push(String(urlString));
      const url = String(urlString);
      let rows = [];
      if (url.includes('osionos_workspaces')) rows = [{ id: SPACE, owner_id: 'OWNER', name: 'S', slug: 's', visibility: 'request_to_join' }];
      else if (url.includes('osionos_workspace_members')) rows = []; // not a member
      return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
    };
    const url = new URL(`http://h/api/collaboration/${SPACE}/uploads?name=spec.pdf`);
    const res = fakeResponse();
    const handled = await handlerWith(fetchImpl)(url, uploadRequest(), res);
    assert.equal(handled, true, 'the route is owned by the collab handler');
    assert.equal(res.statusCode, 403, 'membership gate rejects before any storage write');
    assert.ok(!hits.some((h) => h.includes('/storage/')), 'no bytes were stored for a non-member');
  });

  it('owns the uploads route (dispatch wiring)', async () => {
    // A member reaches past the gate (then hits storage, out of scope here): the
    // route must be claimed by the handler, never fall through to a 404.
    const url = new URL(`http://h/api/collaboration/${SPACE}/uploads`);
    const res = fakeResponse();
    const fetchImpl = async () => ({ ok: true, status: 200, text: async () => '[]' });
    // GET is not POST → 405 from the handler, proving the path is owned (not ignored).
    const handled = await handlerWith(fetchImpl)(url, { method: 'GET', headers: { authorization: 'Bearer x' } }, res);
    assert.equal(handled, true);
    assert.equal(res.statusCode, 405);
  });
});

describe('collab invite gate (AOC §invites)', () => {
  const TARGET = '22222222-2222-4222-8222-222222222222';
  function inviteFetch(ownerId, writes) {
    return async (urlString, opts) => {
      const url = String(urlString);
      if (url.includes('osionos_workspaces')) {
        return { ok: true, status: 200, text: async () => JSON.stringify([{ id: SPACE, owner_id: ownerId, name: 'S', slug: 's', visibility: 'request_to_join' }]) };
      }
      if (url.includes('osionos_workspace_members') && opts?.method === 'POST') { writes.push(url); return { ok: true, status: 201, text: async () => '' }; }
      return { ok: true, status: 200, text: async () => '[]' };
    };
  }
  function inviteBody() {
    const json = JSON.stringify({ userId: TARGET });
    return {
      method: 'POST',
      headers: { authorization: 'Bearer app-session', 'content-type': 'application/json' },
      async *[Symbol.asyncIterator]() { yield json; }, // readJsonBody streams the request
    };
  }

  it('lets the OWNER invite a teammate (200, membership written)', async () => {
    const writes = [];
    // verifySession returns userId 'U'; make 'U' the owner.
    const url = new URL(`http://h/api/collaboration/${SPACE}/invite`);
    const res = fakeResponse();
    await handlerWith(inviteFetch('U', writes))(url, inviteBody(), res);
    assert.equal(res.statusCode, 200);
    assert.equal(writes.length, 1, 'membership row written for the invitee');
  });

  it('denies a NON-owner inviting (403, no write)', async () => {
    const writes = [];
    const url = new URL(`http://h/api/collaboration/${SPACE}/invite`);
    const res = fakeResponse();
    await handlerWith(inviteFetch('SOMEONE-ELSE', writes))(url, inviteBody(), res);
    assert.equal(res.statusCode, 403, 'only the owner may invite');
    assert.equal(writes.length, 0, 'no membership write for a non-owner');
  });
});
