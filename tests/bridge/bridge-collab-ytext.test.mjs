/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-collab-page-topics.test.mjs                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * COLLAB_YTEXT: the bridge accepts, gates and republishes `t:'ytext'` events to
 * `collabpage:<pageId>`. Off by default; on only with page topics and strict versions.
 *
 * S1 startup refusal · flag off · flag-off path · accepted · shapes · revocation ·
 * S11 sv bucket · handshake.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, teamPage, teamWorld, withBridge } from './support/bridge-harness.mjs';
import { createCollabHandler } from '../../scripts/bridge-collab.mjs';

const SECRET = 'synthetic-ytext-secret';
const strictConfig = harnessConfig({ env: { OSIONOS_PAGE_STRICT_VERSION: '1' } });
const looseConfig = harnessConfig();
const ON = { COLLAB_PAGE_TOPICS: '1', COLLAB_YTEXT: '1', JWT_SECRET: SECRET };
const PAGES_ONLY = { COLLAB_PAGE_TOPICS: '1', JWT_SECRET: SECRET };
const NEITHER = { JWT_SECRET: SECRET };
// Dedicated editors: the sv bucket is per (user, page), so no test drains another's.
const EDITOR_ONE = 'f1000000-1111-4111-8111-f10000000a01';
const EDITOR_TWO = 'f2000000-1111-4111-8111-f20000000a02';
const EDITOR_THREE = 'f3000000-1111-4111-8111-f30000000a03';
const EDITOR_FOUR = 'f4000000-1111-4111-8111-f40000000a04';
const REMOVED = 'f5000000-1111-4111-8111-f50000000a05';
const SECOND_PAGE = 'a5a5a5a5-1111-4111-8111-a5a5a5a5a5a5';
const PAGE_TOPIC = `collabpage:${IDS.sharedA}`;
const eventsPath = `/api/collaboration/${IDS.team}/events`;
const UPDATE = 'AQIDBA==';
const VECTOR = 'AQID';

function world(mutate) {
  const seed = teamWorld();
  for (const userId of [EDITOR_ONE, EDITOR_TWO, EDITOR_THREE, EDITOR_FOUR]) {
    seed.osionos_workspace_members.push({ workspace_id: IDS.team, user_id: userId, role: 'editor', permissions: ['create', 'read', 'update'] });
  }
  seed.osionos_pages.push(teamPage(SECOND_PAGE, IDS.userA, 'shared', 'Second', 'text'));
  mutate?.(seed);
  return seed;
}

async function run(config, seed, env, fn) {
  const mock = createPostgrestMock(seed);
  const publishes = [];
  const fetchImpl = async (url, init) => {
    if (String(url).endsWith('/v1/publish')) {
      publishes.push(JSON.parse(init.body));
      return new Response('{}', { status: 200 });
    }
    return mock.fetchImpl(url, init);
  };
  await withBridge(config, fetchImpl, (base) => fn(base), { env });
  return publishes;
}

const headersFor = (config, userId) => sessionHeaders(config, userId, IDS.homeB);
const ytext = (fields) => ({ event: 'collab', payload: { t: 'ytext', actor: `${EDITOR_ONE}:tab-one`, pageId: IDS.sharedA, blockId: 'blk-1', e: 'epoch1', kind: 'u', u: UPDATE, ...fields } });
const svEvent = (fields) => ytext({ kind: 'sv', u: undefined, sv: VECTOR, ...fields });
const construct = (env, config) => () => createCollabHandler({ config, verifySession: () => null, env });

describe('S1 — startup refusal', () => {
  const message = 'COLLAB_YTEXT=1 requires COLLAB_PAGE_TOPICS=1 and OSIONOS_PAGE_STRICT_VERSION=1';
  it('throws when page topics are off', () => {
    assert.throws(construct({ COLLAB_YTEXT: '1' }, strictConfig), { message });
  });
  it('throws when strict versions are off', () => {
    assert.throws(construct({ COLLAB_YTEXT: '1', COLLAB_PAGE_TOPICS: '1' }, looseConfig), { message });
  });
  it('does not throw with both on, or with COLLAB_YTEXT unset', () => {
    assert.doesNotThrow(construct({ COLLAB_YTEXT: '1', COLLAB_PAGE_TOPICS: '1' }, strictConfig));
    assert.doesNotThrow(construct({}, looseConfig));
  });
});

describe('flag off, page topics on', () => {
  it('answers 422 unknown_event and publishes nothing', async () => {
    const publishes = await run(looseConfig, world(), PAGES_ONLY, async (base) => {
      const result = await send(base, eventsPath, headersFor(looseConfig, EDITOR_ONE), post(ytext()));
      assert.equal(result.status, 422, result.text);
      assert.equal(result.body.message, 'unknown_event');
    });
    assert.equal(publishes.length, 0);
  });
});

describe('flag-off path (no page topics)', () => {
  it('refuses a ytext event before it can reach the workspace topic', async () => {
    const publishes = await run(looseConfig, world(), NEITHER, async (base) => {
      const result = await send(base, eventsPath, headersFor(looseConfig, EDITOR_ONE), post(ytext()));
      assert.equal(result.status, 422, result.text);
      assert.equal(result.body.message, 'unknown_event');
    });
    assert.equal(publishes.length, 0);
  });
});

describe('flag on — accepted events', () => {
  it('republishes exactly the rebuilt whitelist object to the page topic', async () => {
    const publishes = await run(strictConfig, world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersFor(strictConfig, EDITOR_ONE), post(ytext({ seq: 3, pageId: IDS.sharedA.toUpperCase() })));
      assert.equal(result.status, 200, result.text);
    });
    assert.equal(publishes.length, 1);
    assert.equal(publishes[0].topic, PAGE_TOPIC);
    assert.deepEqual(publishes[0].payload, {
      event: 'collab',
      payload: { t: 'ytext', actor: `${EDITOR_ONE}:tab-one`, seq: 3, pageId: IDS.sharedA, blockId: 'blk-1', e: 'epoch1', kind: 'u', u: UPDATE },
    });
  });

  it('answers 422 invalid_ytext for an extra key and publishes nothing', async () => {
    const publishes = await run(strictConfig, world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersFor(strictConfig, EDITOR_ONE), post(ytext({ leak: 'x' })));
      assert.equal(result.status, 422, result.text);
      assert.equal(result.body.message, 'invalid_ytext');
    });
    assert.equal(publishes.length, 0);
  });
});

describe('flag on — invalid shapes', () => {
  const cases = {
    'bad kind': ytext({ kind: 'x' }),
    "'u' without u": ytext({ u: undefined }),
    "'u' with sv": ytext({ sv: VECTOR }),
    "'sv' with u": svEvent({ u: UPDATE }),
    "'sv' without sv": svEvent({ sv: undefined }),
    'bad base64': ytext({ u: 'not base64!' }),
    'base64 length not a multiple of 4': ytext({ u: 'AQIDB' }),
    'u of 49156 chars': ytext({ u: 'A'.repeat(49_156) }),
    'sv of 4100 chars': svEvent({ sv: 'A'.repeat(4100) }),
    'blockId of 129 chars': ytext({ blockId: 'b'.repeat(129) }),
    'e of 65 chars': ytext({ e: 'e'.repeat(65) }),
    'blockId with a slash': ytext({ blockId: 'a/b' }),
  };
  for (const [name, body] of Object.entries(cases)) {
    it(`${name} → 422 invalid_ytext, nothing published`, async () => {
      const publishes = await run(strictConfig, world(), ON, async (base) => {
        const result = await send(base, eventsPath, headersFor(strictConfig, EDITOR_TWO), post(body));
        // The body reader's 16 KiB cap (DEFAULT_BODY_LIMIT) answers 413 before the 49152 u cap can.
        if (name === 'u of 49156 chars') return assert.equal(result.status, 413, result.text);
        assert.equal(result.status, 422, result.text);
        assert.equal(result.body.message, 'invalid_ytext');
      });
      assert.equal(publishes.length, 0);
    });
  }
});

describe('S12 — revocation', () => {
  it('refuses a removed member (403) and a viewer write (403); lets the viewer send sv', async () => {
    const publishes = await run(strictConfig, world(), ON, async (base) => {
      const viewer = headersFor(strictConfig, IDS.userB);
      const write = await send(base, eventsPath, viewer, post(ytext({ actor: IDS.userB })));
      assert.equal(write.status, 403, write.text);
      const read = await send(base, eventsPath, viewer, post(svEvent({ actor: IDS.userB })));
      assert.equal(read.status, 200, read.text);
      const removed = await send(base, eventsPath, headersFor(strictConfig, REMOVED), post(ytext({ actor: REMOVED })));
      assert.equal(removed.status, 403, removed.text);
    });
    assert.equal(publishes.length, 1);
    assert.equal(publishes[0].payload.payload.kind, 'sv');
  });
});

describe('S11 — sv bucket', () => {
  it('429s the 11th sv on one page; another page and u events are unaffected', async () => {
    const publishes = await run(strictConfig, world(), ON, async (base) => {
      const headers = headersFor(strictConfig, EDITOR_THREE);
      const actor = `${EDITOR_THREE}:tab`;
      const statuses = (await Promise.all(Array.from({ length: 11 }, () => send(base, eventsPath, headers, post(svEvent({ actor })))))).map((r) => r.status);
      assert.equal(statuses.filter((s) => s === 429).length, 1, statuses.join());
      const again = await send(base, eventsPath, headers, post(svEvent({ actor })));
      assert.equal(again.status, 429, 'same page stays drained');
      const other = await send(base, eventsPath, headers, post(svEvent({ actor, pageId: SECOND_PAGE })));
      assert.equal(other.status, 200, other.text);
    });
    assert.equal(publishes.length, 11);
  });

  it('does not count u events against the sv bucket', async () => {
    await run(strictConfig, world(), ON, async (base) => {
      const headers = headersFor(strictConfig, EDITOR_FOUR);
      const actor = `${EDITOR_FOUR}:tab`;
      for (let i = 0; i < 12; i += 1) {
        const result = await send(base, eventsPath, headers, post(ytext({ actor })));
        assert.equal(result.status, 200, result.text);
      }
      const sv = await send(base, eventsPath, headers, post(svEvent({ actor })));
      assert.equal(sv.status, 200, sv.text);
    });
  });
});

describe('handshake', () => {
  const tokenPath = `/api/collaboration/${IDS.team}/pages/${IDS.sharedA}/realtime-token`;
  it('adds features: [ytext] only with the flag on', async () => {
    await run(strictConfig, world(), ON, async (base) => {
      const result = await send(base, tokenPath, headersFor(strictConfig, IDS.userB), post({}));
      assert.equal(result.status, 200, result.text);
      assert.deepEqual(result.body.features, ['ytext']);
    });
    await run(looseConfig, world(), PAGES_ONLY, async (base) => {
      const result = await send(base, tokenPath, headersFor(looseConfig, IDS.userB), post({}));
      assert.equal(result.status, 200, result.text);
      assert.ok(!('features' in result.body));
    });
  });
});
