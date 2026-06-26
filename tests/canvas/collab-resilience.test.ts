/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collab-resilience.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 19:45:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 19:45:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Phase 8 gate (AOC §8): the backoff schedule is correct, and the adapter
 * reconnects after an unexpected drop — re-auth → re-subscribe → re-TRACK
 * presence — but does NOT reconnect after a deliberate leave(). Driven by an
 * in-memory socket double that mirrors the gateway framing (protocol.rs).
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { backoffDelay, MAX_RECONNECT_ATTEMPTS } from '@/features/collab/model/backoff';
import { GrobaseRealtimeTransport } from '@/features/collab/api/realtimeTransportGrobase.adapter';
import type { LiveWebSocketCtor } from '@/shared/notion-database-sys/src/store/live/liveRealtimeSocket';

test('backoffDelay grows exponentially and is capped', () => {
  assert.equal(backoffDelay(0), 0, 'attempt 0 → no delay');
  assert.equal(backoffDelay(1, { baseMs: 500, factor: 2 }), 500);
  assert.equal(backoffDelay(2, { baseMs: 500, factor: 2 }), 1000);
  assert.equal(backoffDelay(3, { baseMs: 500, factor: 2 }), 2000);
  assert.equal(backoffDelay(10, { baseMs: 500, factor: 2, capMs: 15_000 }), 15_000, 'capped');
  assert.ok(MAX_RECONNECT_ATTEMPTS >= 3, 'gives up eventually');
});

/** A socket double mirroring the gateway: AUTH→AUTH_OK, SUBSCRIBE→SUBSCRIBED. */
class FakeSocket {
  static all: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  tracked = 0;
  closed = false;
  constructor(_url: string) {
    FakeSocket.all.push(this);
    queueMicrotask(() => this.onopen?.());
  }
  private reply(frame: unknown) { queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(frame) })); }
  send(data: string): void {
    const frame = JSON.parse(data) as { type: string };
    if (frame.type === 'AUTH') this.reply({ type: 'AUTH_OK' });
    else if (frame.type === 'SUBSCRIBE') this.reply({ type: 'SUBSCRIBED' });
    else if (frame.type === 'TRACK') this.tracked += 1;
  }
  close(): void { this.closed = true; }
  drop(): void { this.onclose?.(); } // simulate an unexpected disconnect
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test('reconnects after an unexpected drop and re-tracks presence', async () => {
  FakeSocket.all = [];
  const transport = new GrobaseRealtimeTransport({
    url: 'ws://x', selfId: 'me',
    webSocketCtor: FakeSocket as unknown as LiveWebSocketCtor,
    backoff: { baseMs: 0, capMs: 0 },
  });
  const channel = await transport.join('space-1', 'token');
  channel.setPresence({ displayName: 'Me', color: 'var(--collab-1)', route: '/', lastSeen: 1 });
  assert.equal(FakeSocket.all.length, 1, 'one socket after join');

  FakeSocket.all[0].drop();           // unexpected disconnect
  await tick(); await tick();          // backoff(0) → reopen → re-auth → re-subscribe
  assert.equal(FakeSocket.all.length, 2, 'a new socket was opened to reconnect');
  assert.ok(FakeSocket.all[1].tracked >= 1, 'presence re-tracked on the new socket');

  channel.leave();                     // deliberate close
  FakeSocket.all[1].drop();            // a drop AFTER leave must NOT reconnect
  await tick(); await tick();
  assert.equal(FakeSocket.all.length, 2, 'no reconnect after leave()');
});

test('join rejects when the gateway never connects (gives up)', async () => {
  FakeSocket.all = [];
  // A socket that opens but never answers AUTH → never subscribes → keeps dropping.
  class DeadSocket extends FakeSocket {
    send(_data: string): void { queueMicrotask(() => this.onclose?.()); } // drop on every frame
  }
  const transport = new GrobaseRealtimeTransport({
    url: 'ws://x', selfId: 'me',
    webSocketCtor: DeadSocket as unknown as LiveWebSocketCtor,
    backoff: { baseMs: 0, capMs: 0 },
  });
  await assert.rejects(
    (async () => { const c = await transport.join('space-1', 'token'); c.leave(); })(),
    /unreachable/,
    'after MAX attempts with no successful subscribe, join rejects',
  );
});
