/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-connection-transitions.test.mjs             :+:      :+:    :+:    */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// T5 (C514): the only connection transitions are pending → accepted / declined
// (by the addressee) and pending → withdrawn (by the requester). A second answer
// on an edge that already moved is 409 connection_not_pending and writes nothing.
// The PATCH is atomic: it filters on status=eq.pending, so losing a race is the
// same 409, never an overwrite.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createSocialHandler } from '../../scripts/bridge-social.mjs';

const ME = '11111111-1111-4111-8111-111111111111';
const PEER = '22222222-2222-4222-8222-222222222222';
const CONN = '33333333-3333-4333-8333-333333333333';
const CONFIG = { baasUrl: 'http://baas.test', serviceKey: 'svc-key', allowedOrigin: '*' };

function fakeResponse() {
  const written = { status: 0, body: null };
  return {
    written,
    writeHead(status) { written.status = status; },
    end(text) { written.body = text ? JSON.parse(text) : null; },
  };
}

function patchRequest(action) {
  const json = JSON.stringify({ action });
  return {
    method: 'PATCH',
    headers: { authorization: 'Bearer app-session', 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() { yield json; },
  };
}

function reply(value, status = 200) {
  return { ok: status < 400, status, text: async () => JSON.stringify(value) };
}

/**
 * One connection row plus a PostgREST-shaped fetch. The PATCH honours the
 * `status=eq.pending` filter; `forceEmptyPatch` simulates a concurrent answer
 * that moved the row between the read and the write.
 */
function stub({ requester = PEER, addressee = ME, status = 'pending' } = {}, { forceEmptyPatch = false } = {}) {
  const state = { id: CONN, requester_id: requester, addressee_id: addressee, status, responded_at: null };
  const calls = [];
  const fetchImpl = async (urlString, init = {}) => {
    const url = new URL(String(urlString));
    const method = (init.method ?? 'GET').toUpperCase();
    calls.push({
      method,
      path: url.pathname,
      params: url.searchParams,
      body: init.body === undefined ? null : JSON.parse(init.body),
      prefer: init.headers?.Prefer ?? '',
    });
    if (url.pathname === '/v1/publish') return reply({ ok: true });
    if (url.pathname === '/rest/v1/osionos_connections' && method === 'GET') return reply([{ ...state }]);
    if (url.pathname === '/rest/v1/osionos_connections' && method === 'PATCH') {
      const byId = url.searchParams.get('id') === `eq.${CONN}`;
      const pendingOnly = url.searchParams.get('status') === 'eq.pending';
      const matches = byId && (!pendingOnly || state.status === 'pending') && !forceEmptyPatch;
      if (!matches) return reply([]);
      Object.assign(state, JSON.parse(init.body));
      return reply([{ ...state }]);
    }
    return reply([]);
  };
  return { fetchImpl, calls, state };
}

async function patch(baas, action, userId = ME) {
  const response = fakeResponse();
  const handler = createSocialHandler({ config: CONFIG, verifySession: () => ({ userId }), fetchImpl: baas.fetchImpl, env: {} });
  await handler(new URL(`http://bridge.test/api/connections/${CONN}`), patchRequest(action), response, CONFIG);
  return response.written;
}

const patches = (calls) => calls.filter((call) => call.method === 'PATCH' && call.path === '/rest/v1/osionos_connections');

describe('connection transitions are pending-only (T5 / C514)', () => {
  it('pending → accepted by the addressee (200, atomic pending filter)', async () => {
    const baas = stub({ addressee: ME });
    const res = await patch(baas, 'accept');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, connectionId: CONN, status: 'accepted' });
    assert.equal(baas.state.status, 'accepted');
    const [write] = patches(baas.calls);
    assert.ok(write, 'one PATCH was made');
    assert.equal(write.params.get('id'), `eq.${CONN}`);
    assert.equal(write.params.get('status'), 'eq.pending', 'the write only applies while pending');
    assert.equal(write.prefer, 'return=representation');
    assert.equal(write.body.status, 'accepted');
    assert.ok(write.body.responded_at, 'the response time is stamped');
  });

  it('pending → declined by the addressee (200)', async () => {
    const baas = stub({ addressee: ME });
    const res = await patch(baas, 'decline');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'declined');
    assert.equal(baas.state.status, 'declined');
  });

  it('pending → withdrawn by the requester (200)', async () => {
    const baas = stub({ requester: ME, addressee: PEER });
    const res = await patch(baas, 'withdraw');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'withdrawn');
    assert.equal(baas.state.status, 'withdrawn');
  });

  for (const [from, action, actor] of [
    ['declined', 'accept', 'addressee'],
    ['withdrawn', 'accept', 'addressee'],
    ['accepted', 'decline', 'addressee'],
    ['accepted', 'withdraw', 'requester'],
    ['withdrawn', 'withdraw', 'requester'],
  ]) {
    it(`${from} → ${action} is 409 connection_not_pending and writes nothing`, async () => {
      const baas = stub(actor === 'addressee'
        ? { requester: PEER, addressee: ME, status: from }
        : { requester: ME, addressee: PEER, status: from });
      const res = await patch(baas, action);
      assert.equal(res.status, 409);
      assert.deepEqual(res.body, { ok: false, error: 'connection_not_pending' });
      assert.equal(baas.state.status, from, 'the row did not move');
      assert.equal(patches(baas.calls).length, 0, 'no PATCH was attempted');
    });
  }

  it('a PATCH that loses the race (zero rows) is 409 connection_not_pending', async () => {
    const baas = stub({ addressee: ME }, { forceEmptyPatch: true });
    const res = await patch(baas, 'accept');
    assert.equal(res.status, 409);
    assert.deepEqual(res.body, { ok: false, error: 'connection_not_pending' });
    assert.equal(baas.state.status, 'pending', 'nothing was written');
    assert.equal(patches(baas.calls).length, 1, 'the atomic write was attempted');
  });
});
