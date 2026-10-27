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
 * COLLAB_PAGE_TOPICS: collaboration CONTENT is published to `collabpage:<pageId>`
 * and only callers who can read that page get a token for that topic. Flag off
 * keeps the historic `collab:<workspaceId>` behaviour byte for byte.
 *
 * T1 flag off snapshot · T2 page routing · T3 levels · T4 reduced pages nudge ·
 * T5 summon/res to user topics · T6 page token claims · T7 no leak of a denied page.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';
import { mintRealtimeToken } from '../../scripts/bridge-collab.mjs';

const config = harnessConfig();
const SECRET = 'synthetic-page-topic-secret';
const ON = { COLLAB_PAGE_TOPICS: '1', JWT_SECRET: SECRET };
const OFF = { JWT_SECRET: SECRET };
const STRANGER = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';
// Dedicated senders for the rate-limit tests: each bucket is per user, so one test's
// exhausted bucket never leaks into another test.
const FLOOD_USER = 'f1000000-1111-4111-8111-f10000000f01';
const DIRECT_USER = 'f2000000-1111-4111-8111-f20000000f02';
const REPLY_USER = 'f3000000-1111-4111-8111-f30000000f03';
const TOKEN_USER = 'f4000000-1111-4111-8111-f40000000f04';
const MAIN_USER = 'f5000000-1111-4111-8111-f50000000f05';
const EXTRA_USER = 'f6000000-1111-4111-8111-f60000000f06';
const INVALID_USER = 'f7000000-1111-4111-8111-f70000000f07';
const SHAPE_USER = 'f8000000-1111-4111-8111-f80000000f08';
const RATE_MEMBERS = [FLOOD_USER, DIRECT_USER, REPLY_USER, TOKEN_USER, MAIN_USER, EXTRA_USER, INVALID_USER, SHAPE_USER];
const PAGE_TOPIC = `collabpage:${IDS.sharedA}`;
const WS_TOPIC = `collab:${IDS.team}`;

function world(mutate) {
  const seed = teamWorld();
  seed.osionos_bridge_identities = [
    { user_id: IDS.userA, notify_token: 'notify-a' },
    { user_id: IDS.userB, notify_token: 'notify-b' },
    { user_id: STRANGER, notify_token: 'notify-stranger' },
  ];
  for (const userId of RATE_MEMBERS) {
    seed.osionos_workspace_members.push({ workspace_id: IDS.team, user_id: userId, role: 'editor', permissions: ['create', 'read', 'update'] });
  }
  mutate?.(seed);
  return seed;
}

/** One bridge over a seeded world; `/v1/publish` is captured instead of sent. */
async function run(seed, env, fn) {
  const mock = createPostgrestMock(seed);
  const publishes = [];
  const fetchImpl = async (url, init) => {
    if (String(url).endsWith('/v1/publish')) {
      publishes.push(JSON.parse(init.body));
      return new Response('{}', { status: 200 });
    }
    return mock.fetchImpl(url, init);
  };
  const out = await withBridge(config, fetchImpl, (base) => fn(base, { mock, publishes }), { env });
  return { ...out, publishes };
}

const headersB = () => sessionHeaders(config, IDS.userB, IDS.homeB);
const headersA = () => sessionHeaders(config, IDS.userA, IDS.homeA);
const headersFor = (userId) => sessionHeaders(config, userId, IDS.homeB);
const collab = (payload) => ({ event: 'collab', payload });
const caret = (pageId) => collab({ t: 'caret', actor: `${IDS.userB}:tab-one`, seq: 1, pageId });
const blocks = (pageId) => collab({ t: 'blocks', actor: `${IDS.userB}:tab-one`, seq: 1, pageId, ops: [{ k: 'del', id: 'block', v: 1 }] });
const file = (pageId) => collab({ t: 'file', actor: `${IDS.userB}:tab-one`, seq: 1, pageId, file: { id: 'f1', name: 'spec.pdf' } });
const note = (pageId) => collab({ t: 'note', actor: `${IDS.userB}:tab-one`, seq: 1, pageId, note: { id: 'n1', body: 'hi' } });
const eventsPath = `/api/collaboration/${IDS.team}/events`;

function decode(token, secret = SECRET) {
  const [header, payload, signature] = String(token).split('.');
  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  assert.equal(signature, expected);
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

describe('T1 — flag off keeps the workspace topic', () => {
  it('publishes a caret event to collab:<ws> exactly as before', async () => {
    const body = caret(IDS.sharedA);
    const { publishes } = await run(world(), OFF, async (base) => {
      const result = await send(base, eventsPath, headersB(), post(body));
      assert.equal(result.status, 200, result.text);
    });
    assert.equal(publishes.length, 1);
    assert.equal(publishes[0].topic, WS_TOPIC);
    assert.deepEqual(publishes[0].payload, body);
  });
});

describe('T2 — flag on routes content to the page topic', () => {
  it('publishes caret/selection/focus/activity/nav to collabpage:<P>, never collab:<ws>', async () => {
    const kinds = ['caret', 'selection', 'focus', 'activity', 'nav'];
    const { publishes } = await run(world(), ON, async (base) => {
      for (const t of kinds) {
        const body = collab({ t, actor: `${IDS.userB}:tab-one`, seq: 1, pageId: IDS.sharedA });
        const result = await send(base, eventsPath, headersB(), post(body));
        assert.equal(result.status, 200, `${t}: ${result.text}`);
      }
    });
    assert.equal(publishes.length, kinds.length);
    for (const published of publishes) assert.equal(published.topic, PAGE_TOPIC);
    assert.ok(!publishes.some((published) => published.topic === WS_TOPIC));
  });

  it('answers 422 page_id_required when a content event names no page', async () => {
    const { publishes } = await run(world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersB(), post(collab({ t: 'caret', actor: `${IDS.userB}:tab-one`, seq: 1 })));
      assert.equal(result.status, 422, result.text);
      assert.equal(result.body.message, 'page_id_required');
    });
    assert.equal(publishes.length, 0);
  });

  it('answers the missing-page 404 when the caller cannot read the page, publishing nothing', async () => {
    const { publishes } = await run(world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersB(), post(caret(IDS.privateA)));
      assert.equal(result.status, 404, result.text);
    });
    assert.equal(publishes.length, 0);
  });
});

describe('T3 — content needs the level it claims', () => {
  it('refuses blocks and file sends from a can_view caller (403, nothing published)', async () => {
    const { publishes } = await run(world(), ON, async (base) => {
      for (const body of [blocks(IDS.sharedA), file(IDS.sharedA)]) {
        const result = await send(base, eventsPath, headersB(), post(body));
        assert.equal(result.status, 403, result.text);
      }
    });
    assert.equal(publishes.length, 0);
  });

  it('refuses notes from a can_view caller (403) and allows a can_comment caller', async () => {
    const denied = await run(world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersB(), post(note(IDS.sharedA)));
      assert.equal(result.status, 403, result.text);
    });
    assert.equal(denied.publishes.length, 0);

    const allowed = await run(world((seed) => {
      seed.osionos_share_rules = [{
        id: 'b9000000-1111-4111-8111-b90000000f09',
        workspace_id: IDS.team,
        resource_type: 'page',
        resource_id: IDS.sharedA,
        target: { type: 'user', userId: IDS.userB },
        permission: 'can_comment',
        explicit: true,
      }];
    }), ON, async (base) => {
      const result = await send(base, eventsPath, headersB(), post(note(IDS.sharedA)));
      assert.equal(result.status, 200, result.text);
    });
    assert.equal(allowed.publishes.length, 1);
    assert.equal(allowed.publishes[0].topic, PAGE_TOPIC);
  });
});

describe('T4 — the pages nudge stays on the workspace topic, reduced', () => {
  it('drops every page-specific key, keeping t/actor/seq/workspaceId', async () => {
    const nudge = { t: 'pages', actor: `${IDS.userA}:tab`, seq: 4, workspaceId: IDS.team, title: 'Secret title', pageId: IDS.privateA };
    const { publishes } = await run(world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersA(), post(collab(nudge)));
      assert.equal(result.status, 200, result.text);
    });
    assert.equal(publishes.length, 1);
    assert.equal(publishes[0].topic, WS_TOPIC);
    // f1b: a valid tab suffix is preserved, with the session user forced as prefix.
    assert.deepEqual(publishes[0].payload, { event: 'collab', payload: { t: 'pages', actor: `${IDS.userA}:tab`, seq: 4, workspaceId: IDS.team } });
    const serialized = JSON.stringify(publishes[0]);
    assert.ok(!serialized.includes('Secret title'));
    assert.ok(!serialized.includes(IDS.privateA));
  });
});

describe('T5 — summons and answers reach only the target inbox', () => {
  const summon = (target, route) => ({ event: 'collab.req', payload: { cid: 'c1', from: IDS.userA, target, req: { kind: 'summon', route, anchor: { blockId: 'b1' }, message: 'join' } } });

  it('publishes a summon to the target user topic only', async () => {
    const { publishes } = await run(world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersA(), post(summon(IDS.userB, `/pages/${IDS.sharedA}`)));
      assert.equal(result.status, 200, result.text);
    });
    assert.equal(publishes.length, 1);
    assert.equal(publishes[0].topic, 'user:notify-b');
    assert.equal(publishes[0].payload.payload.from, IDS.userA, 'from is forced to the session user');
    assert.notEqual(publishes[0].topic, WS_TOPIC);
  });

  it('answers 404 for a target who is not a member', async () => {
    const { publishes } = await run(world(), ON, async (base) => {
      // No page uuid in the route: only the workspace membership can decide here.
      const result = await send(base, eventsPath, headersA(), post(summon(STRANGER, '/')));
      assert.equal(result.status, 404, result.text);
    });
    assert.equal(publishes.length, 0);
  });

  it('answers 404 when the route names a page the target cannot read', async () => {
    const { publishes } = await run(world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersA(), post(summon(IDS.userB, `/pages/${IDS.privateA}`)));
      assert.equal(result.status, 404, result.text);
    });
    assert.equal(publishes.length, 0);
  });

  it('forwards only { cid, from, res } of a collab.res to the recipient', async () => {
    const res = { accepted: true };
    const { publishes } = await run(world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersA(), post({
        event: 'collab.res',
        payload: { cid: 'c1', to: IDS.userB, res, route: `/pages/${IDS.privateA}`, title: 'leak' },
      }));
      assert.equal(result.status, 200, result.text);
    });
    assert.equal(publishes.length, 1);
    assert.equal(publishes[0].topic, 'user:notify-b');
    assert.deepEqual(publishes[0].payload, { event: 'collab.res', payload: { cid: 'c1', from: IDS.userA, res } });
  });
});

describe('C570 — flag-on frames are whitelisted', () => {
  it('drops extra top-level body keys from the pages nudge', async () => {
    const body = { event: 'collab', payload: { t: 'pages', actor: IDS.userA, seq: 1, workspaceId: IDS.team }, leak: 'top-secret', cid: 'nope' };
    const { publishes } = await run(world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersA(), post(body));
      assert.equal(result.status, 200, result.text);
    });
    assert.equal(publishes.length, 1);
    assert.deepEqual(Object.keys(publishes[0].payload), ['event', 'payload']);
    assert.ok(!JSON.stringify(publishes[0]).includes('top-secret'));
    assert.ok(!JSON.stringify(publishes[0]).includes('nope'));
  });

  it('forces the session user prefix onto a valid tab suffix', async () => {
    const body = collab({ t: 'pages', actor: `${IDS.userA}:t1`, seq: 2, workspaceId: IDS.team });
    const { publishes } = await run(world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersA(), post(body));
      assert.equal(result.status, 200, result.text);
    });
    assert.equal(publishes[0].payload.payload.actor, `${IDS.userA}:t1`);
  });

  it('replaces a foreign uid prefix with the session user id', async () => {
    const body = collab({ t: 'pages', actor: `${STRANGER}:t1`, seq: 2, workspaceId: IDS.team });
    const { publishes } = await run(world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersA(), post(body));
      assert.equal(result.status, 200, result.text);
    });
    assert.equal(publishes[0].payload.payload.actor, `${IDS.userA}:t1`);
  });

  it('answers 422 invalid_actor for a suffix outside the charset', async () => {
    const { publishes } = await run(world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersA(), post(collab({ t: 'pages', actor: `${IDS.userA}:evil frame`, seq: 2, workspaceId: IDS.team })));
      assert.equal(result.status, 422, result.text);
      assert.equal(result.body.message, 'invalid_actor');
    });
    assert.equal(publishes.length, 0);
  });

  it('publishes the bare session id when no tab suffix is present', async () => {
    const body = collab({ t: 'pages', actor: IDS.userA, seq: 2, workspaceId: IDS.team });
    const { publishes } = await run(world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersA(), post(body));
      assert.equal(result.status, 200, result.text);
    });
    assert.equal(publishes[0].payload.payload.actor, IDS.userA);
  });

  it('accepts a pages nudge without a seq', async () => {
    const body = collab({ t: 'pages', actor: `${IDS.userA}:tab`, workspaceId: IDS.team });
    const { publishes } = await run(world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersA(), post(body));
      assert.equal(result.status, 200, result.text);
    });
    assert.equal(publishes.length, 1);
    assert.deepEqual(publishes[0].payload, { event: 'collab', payload: { t: 'pages', actor: `${IDS.userA}:tab`, workspaceId: IDS.team } });
  });

  it('answers 422 invalid_seq for a non-integer seq', async () => {
    const { publishes } = await run(world(), ON, async (base) => {
      for (const seq of [1.5, '3']) {
        const result = await send(base, eventsPath, headersA(), post(collab({ t: 'pages', actor: IDS.userA, seq, workspaceId: IDS.team })));
        assert.equal(result.status, 422, result.text);
        assert.equal(result.body.message, 'invalid_seq');
      }
    });
    assert.equal(publishes.length, 0);
  });

  it('accepts note and file events without a seq', async () => {
    const noteBody = collab({ t: 'note', actor: `${IDS.userA}:tab`, pageId: IDS.sharedA, note: { id: 'n1', body: 'hi' } });
    const fileBody = collab({ t: 'file', actor: `${IDS.userA}:tab`, pageId: IDS.sharedA, file: { id: 'f1', name: 'spec.pdf' } });
    const { publishes } = await run(world(), ON, async (base) => {
      const noteResult = await send(base, eventsPath, headersA(), post(noteBody));
      assert.equal(noteResult.status, 200, noteResult.text);
      const fileResult = await send(base, eventsPath, headersA(), post(fileBody));
      assert.equal(fileResult.status, 200, fileResult.text);
    });
    assert.equal(publishes.length, 2);
    for (const published of publishes) assert.ok(!('seq' in published.payload.payload));
  });

  it('answers 422 invalid_seq when a page event carries a non-integer seq', async () => {
    const { publishes } = await run(world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersA(), post(collab({ t: 'caret', actor: `${IDS.userA}:tab`, seq: 1.5, pageId: IDS.sharedA })));
      assert.equal(result.status, 422, result.text);
      assert.equal(result.body.message, 'invalid_seq');
    });
    assert.equal(publishes.length, 0);
  });

  it('drops extra top-level body keys from page events, collab.req and collab.res', async () => {
    const { publishes } = await run(world(), ON, async (base) => {
      const page = await send(base, eventsPath, headersB(), post({ ...caret(IDS.sharedA), leak: 'page-top' }));
      assert.equal(page.status, 200, page.text);
      const req = await send(base, eventsPath, headersFor(EXTRA_USER), post({ event: 'collab.req', leak: 'req-top', payload: { cid: 'c-top', target: IDS.userB, req: { kind: 'summon', route: '/' } } }));
      assert.equal(req.status, 200, req.text);
      const res = await send(base, eventsPath, headersFor(EXTRA_USER), post({ event: 'collab.res', leak: 'res-top', payload: { cid: 'c-top', to: IDS.userB, res: { accepted: true } } }));
      assert.equal(res.status, 200, res.text);
    });
    assert.equal(publishes.length, 3);
    for (const published of publishes) assert.deepEqual(Object.keys(published.payload), ['event', 'payload']);
    const serialized = JSON.stringify(publishes);
    for (const leak of ['page-top', 'req-top', 'res-top']) assert.ok(!serialized.includes(leak));
  });
});

describe('C572 — summon replies are validated and reduced', () => {
  it('rejects a non-boolean accepted', async () => {
    const { publishes } = await run(world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersA(), post({ event: 'collab.res', payload: { cid: 'c1', to: IDS.userB, res: { accepted: 'yes' } } }));
      assert.equal(result.status, 422, result.text);
      assert.equal(result.body.message, 'invalid_res');
    });
    assert.equal(publishes.length, 0);
  });

  it('rejects an invalid cid on collab.req and collab.res', async () => {
    const { publishes } = await run(world(), ON, async (base) => {
      for (const cid of ['x'.repeat(65), 'bad cid']) {
        const req = await send(base, eventsPath, headersFor(INVALID_USER), post({ event: 'collab.req', payload: { cid, target: IDS.userB, req: { kind: 'summon', route: '/' } } }));
        assert.equal(req.status, 422, req.text);
        assert.equal(req.body.message, 'invalid_cid');
        const res = await send(base, eventsPath, headersFor(INVALID_USER), post({ event: 'collab.res', payload: { cid, to: IDS.userB, res: { accepted: true } } }));
        assert.equal(res.status, 422, res.text);
        assert.equal(res.body.message, 'invalid_cid');
      }
    });
    assert.equal(publishes.length, 0);
  });

  it('publishes cid, from and the accepted boolean only', async () => {
    const { publishes } = await run(world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersFor(SHAPE_USER), post({
        event: 'collab.res',
        payload: { cid: 'c-shape', to: IDS.userB, res: { accepted: false, extra: 'drop' }, title: 'drop' },
      }));
      assert.equal(result.status, 200, result.text);
    });
    assert.equal(publishes.length, 1);
    assert.deepEqual(publishes[0].payload, { event: 'collab.res', payload: { cid: 'c-shape', from: SHAPE_USER, res: { accepted: false } } });
  });
});

describe('C574 — the published pageId matches the lowercased topic', () => {
  it('lowercases an upper-case page uuid in the published payload', async () => {
    const { publishes } = await run(world(), ON, async (base) => {
      const result = await send(base, eventsPath, headersB(), post({
        event: 'collab',
        payload: { t: 'caret', actor: `${IDS.userB}:tab-one`, seq: 1, pageId: IDS.sharedA.toUpperCase() },
      }));
      assert.equal(result.status, 200, result.text);
    });
    assert.equal(publishes.length, 1);
    assert.equal(publishes[0].topic, PAGE_TOPIC);
    assert.equal(publishes[0].payload.payload.pageId, IDS.sharedA);
  });
});

describe('T6 — the page token is scoped to one page', () => {
  it('mints claims with the page namespace, no publish and metadata.level', async () => {
    const { publishes } = await run(world(), ON, async (base) => {
      const result = await send(base, `/api/collaboration/${IDS.team}/pages/${IDS.sharedA}/realtime-token`, headersB(), post({}));
      assert.equal(result.status, 200, result.text);
      assert.equal(result.body.topic, PAGE_TOPIC);
      assert.equal(result.body.pageId, IDS.sharedA);
      assert.equal(result.body.level, 'can_view');
      const claims = decode(result.body.token);
      assert.deepEqual(claims.namespaces, [PAGE_TOPIC]);
      assert.equal(claims.can_publish, false);
      assert.equal(claims.can_subscribe, true);
      assert.deepEqual(claims.metadata, { level: 'can_view' });
    });
    assert.equal(publishes.length, 0);
  });

  it('answers 404 for a page the caller cannot read', async () => {
    await run(world(), ON, async (base) => {
      const result = await send(base, `/api/collaboration/${IDS.team}/pages/${IDS.privateA}/realtime-token`, headersB(), post({}));
      assert.equal(result.status, 404, result.text);
      assert.equal(result.body.token, undefined);
    });
  });

  it('answers 404 for a page of another Shared space', async () => {
    await run(world((seed) => {
      // B owns this page, but it now lives in B's home workspace, not the team one.
      seed.osionos_pages.find((page) => page.id === IDS.pageB).workspace_id = IDS.homeB;
    }), ON, async (base) => {
      const result = await send(base, `/api/collaboration/${IDS.team}/pages/${IDS.pageB}/realtime-token`, headersB(), post({}));
      assert.equal(result.status, 404, result.text);
    });
  });

  it('adds no metadata claim when mintRealtimeToken gets none (old tokens byte-identical)', () => {
    const without = decode(mintRealtimeToken({ secret: SECRET, userId: IDS.userB, namespaces: [PAGE_TOPIC] }).token);
    assert.equal(Object.hasOwn(without, 'metadata'), false);
    const withLevel = decode(mintRealtimeToken({ secret: SECRET, userId: IDS.userB, namespaces: [PAGE_TOPIC], metadata: { level: 'can_view' } }).token);
    assert.deepEqual(withLevel.metadata, { level: 'can_view' });
  });
});

describe('T7 — a denied page never appears on any published topic', () => {
  it('publishes nothing at all for the private page id or title', async () => {
    const { publishes } = await run(world(), ON, async (base) => {
      // Every surface that could carry the private page: page content, summon route and token.
      await Promise.all([
        send(base, eventsPath, headersB(), post(caret(IDS.privateA))),
        send(base, eventsPath, headersB(), post(blocks(IDS.privateA))),
        send(base, eventsPath, headersB(), post(note(IDS.privateA))),
        send(base, eventsPath, headersA(), post({ event: 'collab.req', payload: { cid: 'c2', target: IDS.userB, req: { kind: 'summon', route: `/pages/${IDS.privateA}` } } })),
        send(base, `/api/collaboration/${IDS.team}/pages/${IDS.privateA}/realtime-token`, headersB(), post({})),
      ]);
    });
    assert.equal(publishes.length, 0);
    const serialized = JSON.stringify(publishes);
    assert.ok(!serialized.includes(IDS.privateA));
    assert.ok(!serialized.includes('A private plan'));
  });
});

describe('C571 — flag-on events are rate-limited', () => {
  it('rate-limits the events route per sender', async () => {
    // Freeze the bucket clock for the burst: the limiter refills 200 tokens/s, so a
    // real-time flood on a fast host could otherwise keep up and never hit 429.
    const { publishes, okCount, limited } = await run(world(), ON, async (base) => {
      const body = (seq) => collab({ t: 'pages', actor: FLOOD_USER, seq, workspaceId: IDS.team });
      const realNow = Date.now;
      Date.now = () => 1_800_000_000_000;
      try {
        const results = await Promise.all(Array.from({ length: 450 }, (_, index) => send(base, eventsPath, headersFor(FLOOD_USER), post(body(index + 1)))));
        const burstOk = results.filter((result) => result.status === 200).length;
        const burstLimited = results.filter((result) => result.status === 429).length;
        assert.equal(burstOk, 400, 'the burst of 400 is usable');
        assert.equal(burstLimited, 50, 'requests past the burst are 429');

        const after = [];
        for (let index = 0; index < 5; index += 1) after.push(await send(base, eventsPath, headersFor(FLOOD_USER), post(body(1000 + index))));
        assert.deepEqual(after.map((result) => result.status), [429, 429, 429, 429, 429]);
        return { okCount: burstOk, limited: burstLimited };
      } finally {
        Date.now = realNow;
      }
    });
    assert.equal(okCount, 400);
    assert.equal(limited, 50);
    assert.equal(publishes.length, 400, 'every 200 published one frame, every 429 published none');
  });

  it('rate-limits collab.req per (sender,target) at 5 burst', async () => {
    const { publishes } = await run(world(), ON, async (base) => {
      const statuses = [];
      for (let index = 0; index < 6; index += 1) {
        const result = await send(base, eventsPath, headersFor(DIRECT_USER), post({ event: 'collab.req', payload: { cid: `d${index}`, target: IDS.userB, req: { kind: 'summon', route: '/' } } }));
        statuses.push(result.status);
      }
      assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
    });
    assert.equal(publishes.length, 5);
  });

  it('rate-limits collab.res per (sender,target) at 5 burst', async () => {
    const { publishes } = await run(world(), ON, async (base) => {
      const statuses = [];
      for (let index = 0; index < 6; index += 1) {
        const result = await send(base, eventsPath, headersFor(REPLY_USER), post({ event: 'collab.res', payload: { cid: `r${index}`, to: IDS.userA, res: { accepted: true } } }));
        statuses.push(result.status);
      }
      assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
    });
    assert.equal(publishes.length, 5);
  });
});

describe('C573 — page tokens have their own rate bucket', () => {
  it('exhausting page tokens leaves the main token route working, and vice versa', async () => {
    await run(world(), ON, async (base) => {
      const pagePath = `/api/collaboration/${IDS.team}/pages/${IDS.sharedA}/realtime-token`;
      const statuses = [];
      for (let index = 0; index < 30; index += 1) {
        const result = await send(base, pagePath, headersFor(TOKEN_USER), post({}));
        statuses.push(result.status);
      }
      assert.ok(statuses.filter((status) => status === 200).length >= 20, 'the burst of 20 is usable');
      assert.ok(statuses.includes(429), 'opening 30 pages in a burst is limited');

      const main = await send(base, `/api/collaboration/${IDS.team}/realtime-token`, headersFor(TOKEN_USER), post({}));
      assert.equal(main.status, 200, main.text);
      assert.ok(main.body.token);

      // The other direction proves the bucket KEY is not the main `realtime-token:` one:
      // drain that main bucket, then a page token must still mint.
      const mainResults = await Promise.all(Array.from({ length: 70 }, () => send(base, '/api/realtime/token', headersFor(MAIN_USER), post({ kind: 'objectdb' }))));
      assert.ok(mainResults.some((result) => result.status === 429), 'the main token bucket is drained');
      const pageAfterMain = await send(base, pagePath, headersFor(MAIN_USER), post({}));
      assert.equal(pageAfterMain.status, 200, pageAfterMain.text);
      assert.ok(pageAfterMain.body.token);
    });
  });
});
