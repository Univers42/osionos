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
const PAGE_TOPIC = `collabpage:${IDS.sharedA}`;
const WS_TOPIC = `collab:${IDS.team}`;

function world(mutate) {
  const seed = teamWorld();
  seed.osionos_bridge_identities = [
    { user_id: IDS.userA, notify_token: 'notify-a' },
    { user_id: IDS.userB, notify_token: 'notify-b' },
    { user_id: STRANGER, notify_token: 'notify-stranger' },
  ];
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
    assert.deepEqual(publishes[0].payload.payload, { t: 'pages', actor: `${IDS.userA}:tab`, seq: 4, workspaceId: IDS.team });
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

  it('forwards only { cid, res } of a collab.res to the recipient', async () => {
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
    assert.deepEqual(publishes[0].payload, { event: 'collab.res', payload: { cid: 'c1', res } });
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
