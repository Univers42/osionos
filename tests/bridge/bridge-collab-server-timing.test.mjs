/**
 * COLLAB_SERVER_TIMING=1 adds a Server-Timing header to POST /api/collaboration/:ws/events
 * (per-hop durations + PostgREST call count). Flag off sends no such header and the
 * response body is unchanged. Caveat: durations are wall-clock on a single event-loop, so
 * they include time spent waiting on other in-flight requests under load.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const eventsPath = `/api/collaboration/${IDS.team}/events`;
const headersA = () => sessionHeaders(config, IDS.userA, IDS.homeA);
const blocks = (pageId) => ({ event: 'collab', payload: { t: 'blocks', actor: `${IDS.userA}:tab-one`, seq: 1, pageId, ops: [{ k: 'del', id: 'block', v: 1 }] } });

async function run(env, body, headers = headersA) {
  const mock = createPostgrestMock(teamWorld());
  const fetchImpl = async (url, init) => (String(url).endsWith('/v1/publish')
    ? new Response('{}', { status: 200 })
    : mock.fetchImpl(url, init));
  return withBridge(config, fetchImpl, async (base) => {
    const response = await fetch(`${base}${eventsPath}`, { headers: headers(), ...post(body) });
    return { status: response.status, timing: response.headers.get('server-timing'), text: await response.text() };
  }, { env });
}

function parseTiming(header) {
  return Object.fromEntries(header.split(',').map((part) => {
    const [name, ...params] = part.trim().split(';');
    return [name, Object.fromEntries(params.map((p) => p.split('=')))];
  }));
}

for (const topics of ['1', undefined]) {
  describe(`COLLAB_PAGE_TOPICS=${topics ?? 'off'}`, () => {
    const base = { JWT_SECRET: 'synthetic-timing-secret', ...(topics ? { COLLAB_PAGE_TOPICS: topics } : {}) };

    it('flag on: reports membership, access, publish, total and the PostgREST call count', async () => {
      const result = await run({ ...base, COLLAB_SERVER_TIMING: '1' }, blocks(IDS.sharedA));
      assert.equal(result.status, 200, result.text);
      const timing = parseTiming(result.timing);
      for (const hop of ['membership', 'access', 'publish', 'total']) {
        assert.ok(Number.isFinite(Number(timing[hop]?.dur)), `${hop} in ${result.timing}`);
      }
      assert.ok(Number(timing.postgrest.desc.replace(/"/g, '')) >= 1, result.timing);
    });

    it('flag off: no Server-Timing header, same body', async () => {
      const off = await run(base, blocks(IDS.sharedA));
      const on = await run({ ...base, COLLAB_SERVER_TIMING: '1' }, blocks(IDS.sharedA));
      assert.equal(off.status, 200, off.text);
      assert.equal(off.timing, null);
      assert.equal(off.text, on.text);
    });
  });
}

describe('failure paths still report timing when the flag is on', () => {
  it('a refused event carries the header on its error response', async () => {
    const result = await run({ JWT_SECRET: 's', COLLAB_SERVER_TIMING: '1' }, { event: 'nope', payload: {} });
    assert.equal(result.status, 422);
    assert.ok(result.timing?.includes('total;dur='), String(result.timing));
  });
});
