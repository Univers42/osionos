/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-social-blocks.test.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { BLOCK_CREATED_AT, createSocialStub, uid } from './support/social-postgrest.mjs';
import { createSocialHandler } from '../../scripts/bridge-social.mjs';

const ME = uid(1);
const PEER = uid(2);
const OTHER = uid(3);
const CONFIG = { baasUrl: 'http://baas.test', serviceKey: 'svc-key', allowedOrigin: '*' };

function world(overrides = {}) {
  return {
    members: [],
    connections: overrides.connections ?? [],
    blocks: overrides.blocks ?? [],
    people: overrides.people ?? [
      { user_id: PEER, display_name: 'Peer', profile: { avatar: null }, last_seen_at: '2020-01-01T00:00:00.000Z' },
      { user_id: ME, display_name: 'Me', profile: {}, last_seen_at: '2020-01-01T00:00:00.000Z' },
    ],
  };
}

function fakeResponse() {
  const written = { status: 0, body: null };
  return {
    written,
    writeHead(status) { written.status = status; },
    end(text) { written.body = text ? JSON.parse(text) : null; },
  };
}

const request = (method, body) => ({
  method,
  headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
  async *[Symbol.asyncIterator]() { if (body) yield JSON.stringify(body); },
});

const call = async (stub, method, path, body) => {
  const handler = createSocialHandler({ config: CONFIG, verifySession: () => ({ userId: ME }), fetchImpl: stub.fetchImpl, env: {} });
  const response = fakeResponse();
  await handler(new URL(`http://bridge.test${path}`), request(method, body), response, CONFIG);
  assert.deepEqual(stub.violations, []);
  return response.written;
};

describe('social blocks', () => {
  it('GET /api/social/blocks answers only the caller own blocks', async () => {
    const stub = createSocialStub(world({ blocks: [
      { blocker_id: ME, blocked_id: PEER, reason: 'spam', created_at: '2026-10-19T12:00:00.000Z' },
      { blocker_id: OTHER, blocked_id: PEER, reason: null, created_at: '2026-10-19T12:00:00.000Z' },
    ] }));
    const res = await call(stub, 'GET', '/api/social/blocks');
    assert.equal(res.status, 200);
    assert.equal(res.body.blocks.length, 1);
    assert.equal(res.body.blocks[0].userId, PEER);
    assert.equal(res.body.blocks[0].name, 'Peer');
  });

  it('GET /api/social/blocks with no blocks answers empty', async () => {
    const stub = createSocialStub(world({}));
    const res = await call(stub, 'GET', '/api/social/blocks');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, blocks: [] });
  });

  it('POST /api/social/blocks answers 201 with the block object', async () => {
    const stub = createSocialStub(world({}));
    const res = await call(stub, 'POST', '/api/social/blocks', { userId: PEER, reason: 'spam' });
    assert.equal(res.status, 201);
    assert.equal(res.body.blocked, true);
    assert.ok(res.body.block, 'missing block key');
    assert.equal(res.body.block.userId, PEER);
    assert.equal(res.body.block.name, 'Peer');
    assert.equal(res.body.block.reason, 'spam');
    assert.equal(res.body.block.createdAt, BLOCK_CREATED_AT);
  });

  it('POST with own id -> 422', async () => {
    const stub = createSocialStub(world({}));
    const res = await call(stub, 'POST', '/api/social/blocks', { userId: ME });
    assert.equal(res.status, 422);
  });

  it('DELETE removes the block row and sets the pair edge to declined', async () => {
    const stub = createSocialStub(world({
      blocks: [{ blocker_id: ME, blocked_id: PEER, reason: null, created_at: '2026-10-19T12:00:00.000Z' }],
      connections: [{ id: uid(9), requester_id: ME, addressee_id: PEER, status: 'blocked', intro_message: null, created_at: '2026-10-19T00:00:00.000Z', responded_at: null }],
    }));
    const res = await call(stub, 'DELETE', `/api/social/blocks/${PEER}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.unblocked, true);
    assert.equal(stub.world.blocks.length, 0);
    assert.equal(stub.world.connections.length, 1);
    assert.equal(stub.world.connections[0].status, 'declined');
    assert.equal(stub.world.connections.filter((row) => row.status === 'declined').length, 1);
  });

  it('DELETE for a pair with no edge leaves state unchanged', async () => {
    const stub = createSocialStub(world({
      blocks: [{ blocker_id: ME, blocked_id: PEER, reason: null, created_at: '2026-10-19T12:00:00.000Z' }],
      connections: [],
    }));
    const res = await call(stub, 'DELETE', `/api/social/blocks/${PEER}`);
    assert.equal(res.status, 200);
    assert.equal(stub.world.blocks.length, 0);
    assert.equal(stub.world.connections.length, 0);
  });

  it('DELETE reads edge and PATCHes by id; 0-row PATCH -> 502', async () => {
    // Force the PATCH to return 0 rows by giving an edge whose id won't match the by-id patch.
    // Here we simulate: edge exists & blocked, but patch returns [] via a stub with no matching id.
    const stub = createSocialStub(world({
      blocks: [{ blocker_id: ME, blocked_id: PEER, reason: null, created_at: '2026-10-19T12:00:00.000Z' }],
      connections: [{ id: uid(9), requester_id: ME, addressee_id: PEER, status: 'blocked', intro_message: null, created_at: '2026-10-19T00:00:00.000Z', responded_at: null }],
    }));
    // Override fetchImpl to make the by-id PATCH return [].
    const origFetch = stub.fetchImpl;
    const patchedFetch = async (url, init) => {
      if (init && init.method === 'PATCH' && String(url).includes('osionos_connections?id=eq.')) {
        // return 200 with empty array
        return { ok: true, status: 200, text: async () => '[]' };
      }
      return origFetch(url, init);
    };
    const handler = createSocialHandler({ config: CONFIG, verifySession: () => ({ userId: ME }), fetchImpl: patchedFetch, env: {} });
    const response = fakeResponse();
    await handler(new URL(`http://bridge.test/api/social/blocks/${PEER}`), request('DELETE'), response, CONFIG);
    assert.equal(response.written.status, 502);
  });

  it('block of pair with accepted edge: edge becomes blocked, then unblock -> declined', async () => {
    const stub = createSocialStub(world({
      connections: [{ id: uid(9), requester_id: ME, addressee_id: PEER, status: 'accepted', intro_message: null, created_at: '2026-10-19T00:00:00.000Z', responded_at: null }],
    }));
    // block
    const r1 = await call(stub, 'POST', '/api/social/blocks', { userId: PEER });
    assert.equal(r1.status, 201);
    assert.equal(stub.world.connections[0].status, 'blocked');
    // unblock
    // add block row manually since block insert already did
    const r2 = await call(stub, 'DELETE', `/api/social/blocks/${PEER}`);
    assert.equal(r2.status, 200);
    assert.equal(stub.world.connections[0].status, 'declined');
  });
});
