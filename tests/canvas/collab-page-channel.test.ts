/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-page-channel.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * C501/C502/C509/C518 gate for the page-scoped realtime channel.
 *
 * T1 the workspace socket never carries page data (page id, route, caret,
 *    selection, focusedElementId) — TRACK meta is allow-listed and page-scoped
 *    BROADCASTs are refused.
 * T2 page events are stamped with `pageId` and only the page channel accepts
 *    them; another page's event is dropped before any handler.
 * T3 a 404 page token means no page channel and no retry; a 403 on reconnect
 *    stops the reconnect loop.
 * T4 a summon request reaches the target's user topic and the reply carries
 *    `to`; an inbound user-topic summon reaches the consent inbox.
 * T5 one actor flooding 1000 events in one tick applies at most the 400 burst;
 *    another actor is unaffected.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError } from '../../packages/http-gate/src/errors.ts';
import type { LiveWebSocketLike } from '../../src/shared/notion-database-sys/src/store/live/liveRealtimeSocket.ts';
import { GrobaseRealtimeTransport } from '../../src/features/collab/api/realtimeTransportGrobase.adapter.ts';
import { joinSharedSpace } from '../../src/features/collab/api/grobaseTransport.factory.ts';
import {
  PageChannelUnavailableError, fetchSharedSpacePageToken,
} from '../../src/features/collab/api/grobaseTransport.factory.ts';
import type { CollabEvent, PresenceState, SummonReq, SummonRes } from '../../src/features/collab/model/realtimeTransport.port.ts';

const PAGE_ONE = '11111111-1111-4111-8111-111111111111';
const PAGE_TWO = '22222222-2222-4222-8222-222222222222';
const WORKSPACE = '33333333-3333-4333-8333-333333333333';

/** Socket double: records every frame, answers AUTH/SUBSCRIBE, delivers events. */
class RecordingSocket implements LiveWebSocketLike {
  static instances: RecordingSocket[] = [];
  static reset(): void { RecordingSocket.instances = []; }

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly sent: string[] = [];
  closed = false;

  constructor(_url: string) {
    RecordingSocket.instances.push(this);
    queueMicrotask(() => this.onopen?.());
  }

  send(data: string): void {
    this.sent.push(data);
    const frame = JSON.parse(data) as { type: string; sub_id?: string };
    if (frame.type === 'AUTH') this.reply({ type: 'AUTH_OK', conn_id: 'c', server_time: 0 });
    else if (frame.type === 'SUBSCRIBE') this.reply({ type: 'SUBSCRIBED', sub_id: frame.sub_id, seq: 0 });
  }

  deliver(frame: unknown): void { this.reply(frame); }
  drop(): void { this.onclose?.(); }
  close(): void { this.closed = true; this.onclose?.(); }
  private reply(frame: unknown): void { queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(frame) })); }
}

const ctor = RecordingSocket as unknown as new (url: string) => LiveWebSocketLike;
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

function eventFrame(topic: string, event: string, payload: unknown): unknown {
  return {
    type: 'EVENT',
    event: { event_id: 'e', topic, event_type: 'broadcast', sequence: 1, timestamp: 't', payload: { event, payload } },
  };
}

async function joinWorkspace() {
  RecordingSocket.reset();
  const transport = new GrobaseRealtimeTransport({
    url: 'ws://test', selfId: 'me', workspaceId: WORKSPACE, scope: 'workspace', webSocketCtor: ctor,
  });
  const channel = await transport.join(WORKSPACE, 'workspace-token');
  return { channel, socket: RecordingSocket.instances.at(-1) as RecordingSocket };
}

async function joinPage(pageId = PAGE_ONE, overrides: Partial<ConstructorParameters<typeof GrobaseRealtimeTransport>[0]> = {}) {
  RecordingSocket.reset();
  const transport = new GrobaseRealtimeTransport({
    url: 'ws://test', selfId: 'me', workspaceId: WORKSPACE,
    topic: `collabpage:${pageId}`, pageId, scope: 'page', webSocketCtor: ctor,
    ...overrides,
  });
  const channel = await transport.join(pageId, 'page-token');
  return { channel, socket: RecordingSocket.instances.at(-1) as RecordingSocket };
}

// ── T1 ───────────────────────────────────────────────────────────────────────
test('T1: the workspace socket never carries a page id, route, caret, selection or focusedElementId', async () => {
  const { channel } = await joinWorkspace();
  channel.setPresence({
    displayName: 'Me', color: 'var(--collab-1)', lastSeen: 1,
    route: PAGE_ONE,
    caret: { blockId: 'b1', offset: 3 },
    selection: { anchor: { blockId: 'b1', offset: 0 }, focus: { blockId: 'b1', offset: 3 } },
    focusedElementId: 'toolbar.bold',
  } as Partial<PresenceState>);
  // Even a direct, mistaken page-scoped broadcast is refused on the workspace.
  channel.broadcast({ t: 'caret', actor: 'me', seq: 1, pageId: PAGE_ONE, caret: { blockId: 'b1', offset: 3 } });
  channel.broadcast({ t: 'pages', actor: 'me', seq: 2, workspaceId: WORKSPACE });
  await flush();

  const frames = RecordingSocket.instances.flatMap((socket) => socket.sent);
  const wire = frames.join('\n');
  assert.ok(!wire.includes(PAGE_ONE), 'no page id on the workspace socket');
  for (const key of ['route', 'caret', 'selection', 'focusedElementId']) {
    assert.ok(!wire.includes(`"${key}"`), `workspace frames never carry ${key}`);
  }
  const track = frames.map((frame) => JSON.parse(frame) as { type: string; meta?: Record<string, unknown> })
    .find((frame) => frame.type === 'TRACK');
  assert.deepEqual(
    Object.keys(track?.meta ?? {}).sort(),
    ['color', 'displayName', 'lastSeen', 'memberId'],
    'workspace TRACK meta is exactly the identity allow-list',
  );
  assert.equal(channel.stats?.().droppedWorkspacePageEvent, 1, 'the page-scoped broadcast is refused');
  assert.ok(frames.some((frame) => frame.includes('"t":"pages"')), 'the pages nudge still rides the workspace');
  channel.leave();
});

test('T1: inbound workspace presence is stripped to the identity allow-list', async () => {
  const { channel, socket } = await joinWorkspace();
  const snapshots: PresenceState[][] = [];
  channel.onPresence((members) => snapshots.push(members));
  socket.deliver({
    type: 'PRESENCE',
    members: [{ conn_id: 'conn-B', meta: { memberId: 'B', displayName: 'B', color: 'var(--collab-2)', route: PAGE_ONE, caret: { blockId: 'b1', offset: 1 } } }],
  });
  await flush();
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0][0].memberId, 'B');
  assert.equal(snapshots[0][0].route, undefined, 'route is stripped from workspace presence');
  assert.equal(snapshots[0][0].caret, undefined, 'caret is stripped from workspace presence');
  channel.leave();
});

test('T1: inbound page presence keeps page-relative fields', async () => {
  const { channel, socket } = await joinPage();
  const snapshots: PresenceState[][] = [];
  channel.onPresence((members) => snapshots.push(members));
  socket.deliver({
    type: 'PRESENCE',
    members: [{ conn_id: 'conn-B', meta: { memberId: 'B', displayName: 'B', color: 'var(--collab-2)', route: PAGE_ONE, caret: { blockId: 'b1', offset: 1 } } }],
  });
  await flush();
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0][0].route, PAGE_ONE, 'page channel keeps page-relative presence');
  channel.leave();
});

// ── T2 ───────────────────────────────────────────────────────────────────────
test('T2: page events are stamped and only the page channel, matching pageId, delivers them', async () => {
  const { channel, socket } = await joinPage();
  const received: CollabEvent[] = [];
  channel.onEvent((event) => received.push(event));

  const caret: CollabEvent = { t: 'caret', actor: 'bob', seq: 1, caret: { blockId: 'b1', offset: 4 } };
  channel.broadcast(caret);
  await flush();
  const outbound = socket.sent.map((frame) => JSON.parse(frame) as { type: string; payload?: CollabEvent })
    .find((frame) => frame.type === 'BROADCAST');
  assert.equal((outbound?.payload as { pageId?: string })?.pageId, PAGE_ONE, 'outbound page event names its page');

  socket.deliver(eventFrame(`collabpage:${PAGE_ONE}`, 'collab', {
    t: 'caret', actor: 'bob', seq: 2, pageId: PAGE_TWO, caret: { blockId: 'b2', offset: 1 },
  }));
  await flush();
  assert.equal(received.length, 0, "another page's event is dropped before handlers");
  assert.equal(channel.stats?.().droppedPageMismatch, 1);

  socket.deliver(eventFrame(`collabpage:${PAGE_ONE}`, 'collab', {
    t: 'caret', actor: 'bob', seq: 3, pageId: PAGE_ONE, caret: { blockId: 'b1', offset: 9 },
  }));
  await flush();
  assert.equal(received.length, 1, 'the matching page event is delivered');
  assert.equal((received[0] as { pageId?: string }).pageId, PAGE_ONE);
  channel.leave();

  // The workspace channel drops the same page-scoped event, too.
  const workspace = await joinWorkspace();
  const leaked: CollabEvent[] = [];
  workspace.channel.onEvent((event) => leaked.push(event));
  workspace.socket.deliver(eventFrame(`collab:${WORKSPACE}`, 'collab', {
    t: 'caret', actor: 'bob', seq: 4, pageId: PAGE_ONE, caret: { blockId: 'b1', offset: 2 },
  }));
  await flush();
  assert.equal(leaked.length, 0, 'workspace never accepts page-scoped events');
  assert.equal(workspace.channel.stats?.().droppedWorkspacePageEvent, 1);
  workspace.channel.leave();
});

test('T2: page ids are compared case-insensitively on both sides', async () => {
  const upper = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
  const lower = upper.toLowerCase();
  const { channel, socket } = await joinPage(upper, { topic: `collabpage:${lower}`, pageId: upper });
  const received: CollabEvent[] = [];
  channel.onEvent((event) => received.push(event));

  channel.broadcast({ t: 'caret', actor: 'bob', seq: 1, caret: { blockId: 'b1', offset: 4 } });
  await flush();
  const outbound = socket.sent.map((frame) => JSON.parse(frame) as { type: string; payload?: CollabEvent })
    .find((frame) => frame.type === 'BROADCAST');
  assert.equal((outbound?.payload as { pageId?: string })?.pageId, lower, 'outbound page id is lowercased');

  socket.deliver(eventFrame(`collabpage:${lower}`, 'collab', {
    t: 'caret', actor: 'bob', seq: 2, pageId: upper, caret: { blockId: 'b1', offset: 9 },
  }));
  await flush();
  assert.equal(received.length, 1, 'an upper-case inbound page id is accepted');
  channel.leave();
});

// ── T3 ───────────────────────────────────────────────────────────────────────
test('T3: a 404 page token is final (no page channel, no retry)', async () => {
  const notFound = async (): Promise<never> => { throw new ApiError('no such page', 404); };
  await assert.rejects(
    fetchSharedSpacePageToken(WORKSPACE, PAGE_ONE, notFound),
    (error: unknown) => error instanceof PageChannelUnavailableError,
    'a 404 is mapped to PageChannelUnavailableError',
  );
  const forbidden = async (): Promise<never> => { throw new ApiError('forbidden', 403); };
  await assert.rejects(
    fetchSharedSpacePageToken(WORKSPACE, PAGE_ONE, forbidden),
    (error: unknown) => error instanceof PageChannelUnavailableError,
    'a 403 is final as well',
  );

  const { useCollabStore } = await import('../../src/features/collab/store/useCollabStore.ts');
  useCollabStore.getState().disconnect();
  let joins = 0;
  await useCollabStore.getState().connectPage(
    WORKSPACE, PAGE_ONE, { id: 'me', displayName: 'Me' },
    async () => { joins += 1; throw new PageChannelUnavailableError(); },
  );
  await tick();
  assert.equal(joins, 1, 'the unavailable token is not retried');
  assert.equal(useCollabStore.getState().pageStatus, 'unavailable');
  assert.equal(useCollabStore.getState().pageChannel, null, 'no page channel exists');
  useCollabStore.getState().disconnect();
});

test('T3: a 403 while re-minting a page token stops reconnecting (C509)', async () => {
  let mints = 0;
  const { channel } = await joinPage(PAGE_ONE, {
    backoff: { baseMs: 0, capMs: 0 },
    renewToken: async () => { mints += 1; return null; }, // 403/404
  });
  const first = RecordingSocket.instances.at(-1) as RecordingSocket;
  first.drop();
  await tick();
  assert.equal(mints, 1, 'one re-mint was attempted');
  assert.equal(RecordingSocket.instances.length, 1, 'no replacement socket opens');
  channel.leave();
});

test('T3: a reconnect without a permanent refusal re-mints and opens one fresh socket', async () => {
  let mints = 0;
  const { channel } = await joinPage(PAGE_ONE, {
    backoff: { baseMs: 0, capMs: 0 },
    renewToken: async () => { mints += 1; return `page-token-${mints}`; },
  });
  const first = RecordingSocket.instances.at(-1) as RecordingSocket;
  first.drop();
  await tick();
  assert.equal(mints, 1, 'reconnect re-mints instead of reusing the old token');
  assert.equal(RecordingSocket.instances.length, 2, 'exactly one replacement socket');
  const auth = JSON.parse((RecordingSocket.instances[1] as RecordingSocket).sent[0]) as { type: string; token: string };
  assert.equal(auth.type, 'AUTH');
  assert.equal(auth.token, 'page-token-1', 'the fresh token is used');
  channel.leave();
});

test('T3: a null renewToken notifies onClosed and leaves pageStatus non-live', async () => {
  let closed = 0;
  const { channel } = await joinPage(PAGE_ONE, {
    backoff: { baseMs: 0, capMs: 0 },
    renewToken: async () => null,
    onClosed: () => { closed += 1; },
  });
  const first = RecordingSocket.instances.at(-1) as RecordingSocket;
  first.drop();
  await tick();
  assert.equal(closed, 1, 'onClosed fires when renewal is permanently refused');
  channel.leave();
});

test('T3: the store leaves "live" when the page channel closes', async () => {
  const { useCollabStore } = await import('../../src/features/collab/store/useCollabStore.ts');
  useCollabStore.getState().disconnect();
  let onClosed: (() => void) | undefined;
  await useCollabStore.getState().connectPage(
    WORKSPACE, PAGE_ONE, { id: 'me', displayName: 'Me' },
    async (_spaceId, _pageId, _selfId, cb) => {
      onClosed = cb;
      const transport = new GrobaseRealtimeTransport({
        url: 'ws://test', selfId: 'me', workspaceId: WORKSPACE,
        topic: `collabpage:${PAGE_ONE}`, pageId: PAGE_ONE, scope: 'page', webSocketCtor: ctor,
        onClosed: cb,
      });
      return transport.join(PAGE_ONE, 'page-token');
    },
  );
  await tick();
  assert.equal(useCollabStore.getState().pageStatus, 'live');
  onClosed?.();
  await tick();
  assert.notEqual(useCollabStore.getState().pageStatus, 'live', 'pageStatus leaves live after close');
  useCollabStore.getState().disconnect();
});

// ── T4 ───────────────────────────────────────────────────────────────────────
test('T4: summons ride the notify-token topic and the bridge frame shape reaches the inbox', async () => {
  RecordingSocket.reset();
  const published: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const bus = new TopicBus();
  const channel = await joinSharedSpace(WORKSPACE, 'B', {
    url: 'ws://test',
    fetchToken: async () => 'workspace-token',
    fetchNotifyToken: async () => 'notify-token',
    subscribeTopic: (topic, onFrame) => bus.subscribe(topic, onFrame),
    webSocketCtor: ctor,
    requestTimeoutMs: 20,
    publish: async (_workspaceId, event, payload) => {
      published.push({ event, payload: payload as Record<string, unknown> });
    },
  });

  const { useSummonStore } = await import('../../src/features/collab/store/useSummonStore.ts');
  useSummonStore.setState({ incoming: null });
  channel.onRequest((from: string, req: SummonReq) => new Promise<SummonRes>((resolve) => {
    useSummonStore.getState().present({
      fromId: from,
      route: req.route,
      message: req.message,
      resolve: (accepted) => resolve({ accepted }),
    });
  }));

  // Bridge shape: a gateway EVENT whose payload is `{ event, payload }`.
  bus.deliver('user:notify-token', {
    event_id: 'e', topic: 'user:notify-token', event_type: 'broadcast', sequence: 1, timestamp: 't',
    payload: {
      event: 'collab.req',
      payload: { cid: 'cid-1', from: 'A', target: 'B', req: { kind: 'summon', route: PAGE_ONE, message: 'join me' } },
    },
  });
  await flush();
  const incoming = useSummonStore.getState().incoming;
  assert.equal(incoming?.fromId, 'A', 'the directed summon reached the consent inbox');
  assert.equal(incoming?.route, PAGE_ONE);

  useSummonStore.getState().answer(true);
  await flush();
  const reply = published.find((frame) => frame.event === 'collab.res');
  assert.deepEqual(reply?.payload, { cid: 'cid-1', to: 'A', res: { accepted: true } }, 'the reply names the requester');

  const request = await channel.request('A', { kind: 'summon', route: PAGE_ONE });
  assert.equal(request.accepted, false, 'a request with no reply resolves declined');
  const outbound = published.find((frame) => frame.event === 'collab.req');
  assert.equal(outbound?.payload.target, 'A', 'the request names its target');
  channel.leave();
});

class TopicBus {
  private readonly listeners = new Map<string, Set<(frame: unknown) => void>>();

  subscribe(topic: string, onFrame: (frame: unknown) => void): () => void {
    const set = this.listeners.get(topic) ?? new Set();
    set.add(onFrame);
    this.listeners.set(topic, set);
    return () => { set.delete(onFrame); };
  }

  deliver(topic: string, frame: unknown): void {
    for (const listener of this.listeners.get(topic) ?? []) {
      queueMicrotask(() => listener(frame));
    }
  }
}

// ── T5 ───────────────────────────────────────────────────────────────────────
test('T5: 1000 events from one actor in a tick apply at most the 400 burst; another actor is unaffected', async () => {
  const { channel, socket } = await joinPage();
  const applied: string[] = [];
  channel.onEvent((event) => applied.push(event.actor));

  const realNow = Date.now;
  Date.now = () => 1_000_000; // freeze the bucket refill so the burst is exact
  try {
    for (let index = 0; index < 1000; index += 1) {
      socket.deliver(eventFrame(`collabpage:${PAGE_ONE}`, 'collab', {
        t: 'caret', actor: `flood:${index}`, seq: index + 1, pageId: PAGE_ONE, caret: { blockId: 'b1', offset: index },
      }));
    }
    await flush();
  } finally {
    Date.now = realNow;
  }
  assert.equal(applied.length, 400, 'rotating tab suffixes still share the per-user bucket');
  assert.equal(channel.stats?.().droppedRateLimit, 600, 'the excess is counted, not console-spammed');

  socket.deliver(eventFrame(`collabpage:${PAGE_ONE}`, 'collab', {
    t: 'caret', actor: 'other:0', seq: 1, pageId: PAGE_ONE, caret: { blockId: 'b1', offset: 0 },
  }));
  await flush();
  assert.equal(applied.filter((actor) => actor === 'other:0').length, 1, 'a different actor has its own bucket');
  channel.leave();
});
