/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   realtimeTransportGrobase.adapter.ts                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * THE ONE adapter binding the collaboration domain to the grobase
 * realtime-agnostic gateway (AOC §1.2/§5). Nothing else in the collab feature
 * imports a transport. It speaks the gateway's verified wire protocol
 * (realtime-core/protocol.rs: AUTH→AUTH_OK→SUBSCRIBE→SUBSCRIBED→EVENT, plus
 * BROADCAST / TRACK / UNTRACK / PRESENCE). The LiveWebSocketLike type is reused
 * from the existing live-DB socket (type-only, erased at runtime); the live URL
 * + token come from resolveLiveRealtimeToken()/liveRealtimeUrl() in the app
 * factory (see grobaseTransport.factory).
 *
 * TWO SCOPES, ONE ADAPTER. A channel is either the workspace topic
 * (`collab:<workspaceId>`) or one page topic (`collabpage:<pageId>`):
 *
 * - WORKSPACE: presence identity only (`memberId, displayName, color,
 *   avatarRef?, lastSeen`) and the reduced `pages` nudge. A page-scoped event
 *   is REFUSED here, both outbound and inbound, so no route/caret/selection/
 *   page id can ever reach `collab:<workspace>` (C501).
 * - PAGE: page-scoped events (`blocks, caret, selection, focus, note, file,
 *   activity, nav`) stamped with the page id. Inbound frames are validated,
 *   matched against this channel's page and rate-capped per actor BEFORE any
 *   handler sees them (C502/C518).
 *
 * PRESENCE is NATIVE (TRACK/UNTRACK → presence snapshots) — not synthesized.
 * On the wire it arrives in TWO shapes: the top-level PRESENCE frame (older
 * gateway) and, on the realtime-agnostic gateway, as an EVENT with
 * `event_type === 'presence'` whose payload is `{topic, members}`
 * (realtime-gateway/src/ws_handler/connection.rs publish_presence_snapshot).
 * Both funnel through one boundary validation (R-P1): a member is trusted
 * only when `meta.memberId` is a string AND its server-stamped `user_id`
 * (gateway, from the token `sub`) is absent (older gateway) or equals
 * `meta.memberId` case-insensitively — a disagreeing `user_id` means the
 * client TRACKed someone else's identity, so that member is DROPPED.
 *
 * SUMMON is directed over the per-user topic: outbound `collab.req` and
 * `collab.res` go through the bridge (`config.publish`), which delivers them to
 * the target's `user:<id>` topic; inbound envelopes arrive through
 * `config.subscribeUserTopic` (the app wires mintedTopicSocket) — never over
 * the workspace socket. Replies carry `to` = the original requester.
 *
 * Durable writes do NOT ride this transport — they go HTTP→bridge (AOC §4
 * ephemeral/durable split).
 */

import type { LiveWebSocketLike, LiveWebSocketCtor } from '@/shared/notion-database-sys/src/store/live/liveRealtimeSocket';
import type {
  ChannelScope, ChannelStats, CollabEvent, PresenceState, RealtimeChannel, RealtimeTransport, SummonReq,
  SummonRes, Unsubscribe,
} from '../model/realtimeTransport.port';
import { validateCollabEvent, validateSummonReq } from '../model/collabEvent.schema';
import { isPageScopedEvent } from '../model/pageScope';
import { collabLatencyMarks } from '@/shared/lib/perf/collabLatencyMarks';
import { backoffDelay, MAX_RECONNECT_ATTEMPTS, type BackoffOpts } from '../model/backoff';
import { assignMemberColor } from '../model/collabPresence';
import { memberIdOf } from '../model/collabActor';

const COLLAB_EVENT = 'collab';      // broadcast label for a CollabEvent payload
const REQUEST_EVENT = 'collab.req'; // directed-request envelope (user topic)
const REPLY_EVENT = 'collab.res';   // directed reply envelope (user topic)
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Receiver rate cap (C518): 200 events/s per actor, burst 400. */
const RATE_PER_SECOND = 200;
const RATE_BURST = 400;

/** Metadata the workspace topic may ever carry (C501 allow-list). */
const WORKSPACE_PRESENCE_KEYS = ['memberId', 'displayName', 'color', 'avatarRef', 'lastSeen'] as const;

/** One frame delivered on a user topic (bridge → mintedTopicSocket). */
export interface UserTopicFrame { event_type?: string; payload?: unknown; }

export interface GrobaseTransportConfig {
  url: string;
  /** This client's memberId — addresses synthesized requests + stamps presence. */
  selfId: string;
  /** Workspace id used for bridge publishing (a page channel still publishes with it). */
  workspaceId?: string;
  /** Explicit topic (`collab:<ws>` or `collabpage:<pageId>`); defaults from join's spaceId. */
  topic?: string;
  /** The page a page-scoped channel is bound to; absent for a workspace channel. */
  pageId?: string;
  scope?: ChannelScope;
  webSocketCtor?: LiveWebSocketCtor;
  requestTimeoutMs?: number;
  backoff?: BackoffOpts;
  /** Authenticated bridge publishing; the socket token only subscribes. */
  publish?: (workspaceId: string, event: string, payload: unknown) => Promise<void>;
  onPublishError?: (error: unknown) => void;
  /**
   * Mint a fresh token for a reconnect (C509). Returning null means the bridge
   * permanently refused (403/404) → stop reconnecting; a throw is transient.
   */
  renewToken?: () => Promise<string | null>;
  /** Subscribe this client's user topic for directed summons (mintedTopicSocket). */
  subscribeUserTopic?: (onFrame: (frame: UserTopicFrame) => void) => Unsubscribe;
  /** Called when a reconnect is permanently refused (renewToken → null). */
  onClosed?: () => void;
}

interface GatewayEvent { event_type: string; payload: unknown; }
/** One member of a presence snapshot as published by the gateway. */
interface PresenceWireMember { user_id?: unknown; meta?: unknown; }
interface ReqEnvelope { cid: string; from: string; target: string; req: SummonReq; }
interface ResEnvelope { cid: string; to: string; res: SummonRes; }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * Boundary validation (R-P1) for presence members, shared by the PRESENCE
 * frame and the EVENT/presence shape. Keeps only record members carrying a
 * string `meta.memberId`, and drops any whose server-stamped `user_id`
 * disagrees with that memberId (case-insensitive): `user_id` is what the
 * gateway stamps from the authenticated token, `meta.memberId` is whatever
 * the client claimed — when they conflict the claim is a spoof, never a fact.
 * A missing `user_id` (older gateway) is accepted as-is.
 */
const validatePresenceMembers = (members: unknown): PresenceState[] => {
  if (!Array.isArray(members)) return []; // malformed payload: ignore, never throw
  const states: PresenceState[] = [];
  for (const member of members) {
    if (!isRecord(member)) continue;
    const meta = (member as PresenceWireMember).meta;
    if (!isRecord(meta) || typeof meta.memberId !== 'string') continue;
    const userId = (member as PresenceWireMember).user_id;
    if (typeof userId === 'string' && userId.toLowerCase() !== meta.memberId.toLowerCase()) continue;
    states.push(renderablePresence(meta, meta.memberId));
  }
  return states;
};

const PALETTE_COLOR = /^var\(--collab-[1-9]\d*\)$/;
const MAX_DISPLAY_NAME = 80;

/**
 * Another member's meta reaches CSS (`color`) and an `<img src>` (`avatarRef`): a
 * `url(...)` colour or a foreign avatar would make every reader's browser fetch a URL
 * the sender picked. Only a palette token, an https/same-origin avatar and a bounded
 * name survive; a bad colour falls back to the member's own palette colour.
 * Caveat: an https avatar is still a host the sender chose, so readers' browsers can
 * be made to fetch it (their IP and the time leak to that host). Closing that needs the
 * avatar resolved from the member's profile, not taken from presence meta.
 */
function renderablePresence(meta: Record<string, unknown>, memberId: string): PresenceState {
  const color = typeof meta.color === 'string' && PALETTE_COLOR.test(meta.color) ? meta.color : assignMemberColor(memberId);
  const displayName = typeof meta.displayName === 'string' ? meta.displayName.slice(0, MAX_DISPLAY_NAME) : '';
  const state = { ...meta, memberId, color, displayName } as unknown as PresenceState;
  if (!isSafeAvatar(meta.avatarRef)) delete state.avatarRef;
  return state;
}

function isSafeAvatar(ref: unknown): boolean {
  if (typeof ref !== 'string') return false;
  if (ref.startsWith('/') && !ref.startsWith('//')) return true;
  return ref.startsWith('https://');
}

/** Keep only the workspace allow-list so a caller cannot smuggle page state. */
function workspacePresence(meta: Record<string, unknown>, selfId: string): Partial<PresenceState> {
  const kept: Record<string, unknown> = {};
  for (const key of WORKSPACE_PRESENCE_KEYS) {
    if (meta[key] !== undefined) kept[key] = meta[key];
  }
  kept.memberId = selfId;
  if (kept.lastSeen === undefined) kept.lastSeen = Date.now();
  return kept as Partial<PresenceState>;
}

/** Per-actor (uid) token bucket; an actor over the cap cannot starve another (C518). */
class ActorRateLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  private static readonly MAX_ACTORS = 256;

  allow(actor: string, now = Date.now()): boolean {
    const key = memberIdOf(actor);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= ActorRateLimiter.MAX_ACTORS) {
        const oldest = this.buckets.keys().next().value;
        if (oldest !== undefined) this.buckets.delete(oldest);
      }
      bucket = { tokens: RATE_BURST, at: now };
    }
    const elapsed = Math.max(0, now - bucket.at);
    bucket.tokens = Math.min(RATE_BURST, bucket.tokens + (elapsed / 1000) * RATE_PER_SECOND);
    bucket.at = now;
    if (bucket.tokens < 1) {
      // Refresh LRU position even on a drop.
      this.buckets.delete(key);
      this.buckets.set(key, bucket);
      return false;
    }
    bucket.tokens -= 1;
    this.buckets.delete(key);
    this.buckets.set(key, bucket);
    return true;
  }
}

export class GrobaseRealtimeTransport implements RealtimeTransport {
  private readonly config: GrobaseTransportConfig;

  constructor(config: GrobaseTransportConfig) {
    this.config = config;
  }

  join(spaceId: string, authToken: string): Promise<RealtimeChannel> {
    return new Promise<RealtimeChannel>((resolve, reject) => {
      const topic = this.config.topic ?? `collab:${spaceId}`;
      const channel = new GrobaseChannel(this.config, spaceId, topic, authToken, resolve, reject);
      channel.open();
    });
  }
}

class GrobaseChannel implements RealtimeChannel {
  private ws: LiveWebSocketLike | null = null;
  private readonly topic: string;
  private readonly spaceId: string;
  private readonly scope: ChannelScope;
  private readonly pageId: string | null;
  private subscribed = false;
  private readonly outbox: string[] = [];
  private readonly eventHandlers = new Set<(e: CollabEvent) => void>();
  private readonly presenceHandlers = new Set<(m: PresenceState[]) => void>();
  private readonly requestHandlers: Array<(from: string, req: SummonReq) => Promise<SummonRes>> = [];
  private readonly pending = new Map<string, { resolve: (r: SummonRes) => void; timer: ReturnType<typeof setTimeout> }>();
  private presence: Partial<PresenceState> = {};
  private readonly config: GrobaseTransportConfig;
  private authToken: string;
  private readonly onReady: (c: RealtimeChannel) => void;
  private readonly onFail: (e: Error) => void;
  private readonly limiter = new ActorRateLimiter();
  private readonly counters: ChannelStats = {
    droppedPageMismatch: 0,
    droppedRateLimit: 0,
    droppedWorkspacePageEvent: 0,
    droppedPageTopicPagesEvent: 0,
  };
  private userTopicUnsub: Unsubscribe | null = null;
  private closing = false;        // true once leave() is called — suppresses reconnect
  private everReady = false;      // join promise already resolved — never re-resolve
  private reconnectAttempt = 0;   // resets to 0 on a successful (re)subscribe
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    config: GrobaseTransportConfig,
    spaceId: string,
    topic: string,
    authToken: string,
    onReady: (c: RealtimeChannel) => void,
    onFail: (e: Error) => void,
  ) {
    this.config = config;
    this.spaceId = spaceId;
    this.topic = topic;
    this.authToken = authToken;
    this.onReady = onReady;
    this.onFail = onFail;
    this.scope = config.scope ?? 'workspace';
    this.pageId = config.pageId
      ? config.pageId.toLowerCase()
      : (this.scope === 'page' ? topic.slice('collabpage:'.length).toLowerCase() : null);
  }

  stats(): ChannelStats { return { ...this.counters }; }

  open(): void {
    const Ctor = this.config.webSocketCtor ?? (globalThis as { WebSocket?: LiveWebSocketCtor }).WebSocket;
    if (!Ctor) { this.onFail(new Error('no WebSocket support')); return; }
    // Directed summons arrive on this client's user topic, not the workspace.
    if (this.config.subscribeUserTopic && !this.userTopicUnsub) {
      this.userTopicUnsub = this.config.subscribeUserTopic((frame) => this.onUserTopicFrame(frame));
    }
    const ws = new Ctor(this.config.url);
    this.ws = ws;
    ws.onopen = () => this.frame({ type: 'AUTH', token: this.authToken }); // MUST be first frame
    ws.onmessage = (event) => this.handleFrame(event.data);
    ws.onerror = () => { /* the close carries the consequence */ };
    ws.onclose = () => {
      this.subscribed = false;
      if (this.closing) return;        // deliberate leave() → stay down
      this.scheduleReconnect();        // unexpected drop → exponential backoff (§8)
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      if (!this.everReady) this.onFail(new Error('realtime unreachable')); // never connected → reject join
      return;
    }
    const delay = backoffDelay((this.reconnectAttempt += 1), this.config.backoff);
    this.reconnectTimer = setTimeout(() => { void this.reconnect(); }, delay);
  }

  /**
   * C509: a reconnect mints a fresh token before AUTH. A 403/404 from the mint
   * is permanent — the caller lost access — so the channel stops instead of
   * looping with a token the gateway will keep refusing.
   */
  private async reconnect(): Promise<void> {
    if (this.closing) return;
    if (this.config.renewToken) {
      let fresh: string | null;
      try {
        fresh = await this.config.renewToken();
      } catch {
        this.scheduleReconnect(); // transient (network/5xx) — try again later
        return;
      }
      if (this.closing) return;
      if (fresh === null) { this.closing = true; this.config.onClosed?.(); return; } // revoked / no access → stop
      this.authToken = fresh;
    }
    this.open();
  }

  private handleFrame(data: unknown): void {
    collabLatencyMarks.frameReceived();
    let frame: { type?: string; event?: GatewayEvent; members?: unknown; code?: string };
    try { frame = JSON.parse(String(data)); } catch { return; }
    if (frame.type === 'AUTH_OK') this.frame({ type: 'SUBSCRIBE', sub_id: 'collab', topic: this.topic });
    else if (frame.type === 'SUBSCRIBED') this.onSubscribed();
    else if (frame.type === 'EVENT' && frame.event) this.onGatewayEvent(frame.event);
    else if (frame.type === 'PRESENCE') this.deliverPresence(validatePresenceMembers(frame.members));
    else if (frame.type === 'ERROR') this.onFail(new Error(`realtime ${frame.code ?? 'error'}`));
  }

  private onSubscribed(): void {
    this.subscribed = true;
    this.reconnectAttempt = 0; // healthy again — reset the backoff
    // Re-assert presence so a reconnect restores this client in everyone's roster.
    if (Object.keys(this.presence).length) {
      this.frame({ type: 'TRACK', topic: this.topic, meta: this.presence });
    }
    for (const queued of this.outbox.splice(0)) this.ws?.send(queued);
    if (!this.everReady) { this.everReady = true; this.onReady(this); } // resolve join once
  }

  private onGatewayEvent(event: GatewayEvent): void {
    if (!isRecord(event.payload)) return;
    // The realtime-agnostic gateway delivers presence as an EVENT, not as a
    // top-level PRESENCE frame — the snapshot that every roster missed until
    // this branch existed. Same handlers, same validation, as the frame path.
    if (event.event_type === 'presence') {
      const { members } = event.payload as { members?: unknown };
      if (Array.isArray(members)) this.deliverPresence(validatePresenceMembers(members));
      return; // malformed payload: ignored (R-P1), never throws
    }
    if (event.event_type !== 'broadcast') return;
    const env = event.payload as { event?: unknown; payload?: unknown };
    if (env.event !== COLLAB_EVENT) return;
    const valid = validateCollabEvent(env.payload); // R-P1: validate at the boundary, drop malformed
    if (!valid || !this.acceptInbound(valid)) return;
    for (const handler of this.eventHandlers) handler(valid);
  }

  /**
   * Receiver checks BEFORE any store sees the event (C502/C518): a page channel
   * only accepts its own page's page-scoped events; a workspace channel accepts
   * no page-scoped event at all; a page channel caps each actor's rate.
   */
  private acceptInbound(event: CollabEvent): boolean {
    if (this.scope === 'page') {
      if (event.t === 'pages') { this.counters.droppedPageTopicPagesEvent += 1; return false; }
      const eventPageId = (event as { pageId?: string }).pageId;
      if ((typeof eventPageId === 'string' ? eventPageId.toLowerCase() : eventPageId) !== this.pageId) {
        this.counters.droppedPageMismatch += 1;
        return false;
      }
      if (!this.limiter.allow(event.actor)) {
        this.counters.droppedRateLimit += 1;
        return false;
      }
      return true;
    }
    if (isPageScopedEvent(event)) { this.counters.droppedWorkspacePageEvent += 1; return false; }
    return true;
  }

  private deliverPresence(states: PresenceState[]): void {
    const delivered = this.scope === 'workspace'
      ? states.map((state) => {
          const record = state as unknown as Record<string, unknown>;
          const kept: Record<string, unknown> = {};
          for (const key of WORKSPACE_PRESENCE_KEYS) {
            if (record[key] !== undefined) kept[key] = record[key];
          }
          if (typeof state.memberId !== 'string' || kept.memberId === undefined) kept.memberId = state.memberId;
          if (kept.lastSeen === undefined) kept.lastSeen = state.lastSeen;
          return kept as unknown as PresenceState;
        })
      : states;
    for (const handler of this.presenceHandlers) handler(delivered);
  }

  broadcast(event: CollabEvent): void {
    if (this.scope === 'workspace') {
      // Defence in depth: page state belongs on a page channel; never leak it.
      if (isPageScopedEvent(event)) { this.counters.droppedWorkspacePageEvent += 1; return; }
      this.publish(COLLAB_EVENT, event);
      return;
    }
    if (event.t === 'pages') { this.counters.droppedPageTopicPagesEvent += 1; return; }
    this.publish(COLLAB_EVENT, this.withPageId(event));
  }

  /** Every outbound page event names the page it concerns (C501). */
  private withPageId(event: CollabEvent): CollabEvent {
    if (!this.pageId) return event;
    if (event.t === 'pages') return event;
    return { ...event, pageId: this.pageId } as CollabEvent;
  }

  onEvent(handler: (e: CollabEvent) => void): Unsubscribe {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  setPresence(patch: Partial<PresenceState>): void {
    // The workspace channel is allow-listed; the page channel may carry the
    // page-relative fields because its topic already names the page (C501).
    const merged = { ...this.presence, ...patch, memberId: this.config.selfId } as Record<string, unknown>;
    this.presence = this.scope === 'workspace'
      ? workspacePresence(merged, this.config.selfId)
      : { ...merged, memberId: this.config.selfId, lastSeen: merged.lastSeen ?? Date.now() } as Partial<PresenceState>;
    this.enqueue(JSON.stringify({ type: 'TRACK', topic: this.topic, meta: this.presence }));
  }

  onPresence(handler: (members: PresenceState[]) => void): Unsubscribe {
    this.presenceHandlers.add(handler);
    return () => this.presenceHandlers.delete(handler);
  }

  request(target: string, req: SummonReq): Promise<SummonRes> {
    const raw = globalThis.crypto?.randomUUID?.() ?? `r-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const cid = raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || `r-${Date.now()}`;
    return new Promise<SummonRes>((resolve) => {
      // No bridge publishing → there is no directed channel; fail closed rather
      // than broadcast a summon (with its route) on the workspace socket.
      if (!this.config.publish) { resolve({ accepted: false }); return; }
      const timer = setTimeout(() => { this.pending.delete(cid); resolve({ accepted: false }); },
        this.config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
      this.pending.set(cid, { resolve, timer });
      this.publishDirected(REQUEST_EVENT, { cid, from: this.config.selfId, target, req } satisfies ReqEnvelope);
    });
  }

  onRequest(handler: (from: string, req: SummonReq) => Promise<SummonRes>): Unsubscribe {
    this.requestHandlers.push(handler);
    return () => {
      const index = this.requestHandlers.indexOf(handler);
      if (index >= 0) this.requestHandlers.splice(index, 1);
    };
  }

  leave(): void {
    this.closing = true; // suppress the reconnect loop
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.userTopicUnsub?.();
    this.userTopicUnsub = null;
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.eventHandlers.clear();
    this.presenceHandlers.clear();
    this.requestHandlers.length = 0;
    if (this.subscribed) this.frame({ type: 'UNTRACK', topic: this.topic });
    const ws = this.ws;
    this.ws = null;
    this.subscribed = false;
    if (ws) {
      try {
        if (ws.readyState === 0) {
          ws.onopen = () => { try { ws.close(1000, 'leave'); } catch { /* ignore */ } };
          ws.onerror = () => { /* ignore */ };
          ws.onclose = () => { /* ignore */ };
          ws.onmessage = () => { /* ignore */ };
        } else {
          ws.close(1000, 'leave');
        }
      } catch { /* already closing */ }
    }
  }

  /** Normalize the bridge's user-topic frame into a directed envelope. */
  private onUserTopicFrame(frame: UserTopicFrame): void {
    if (!isRecord(frame)) return;
    const eventType = frame.event_type;
    const payload = frame.payload;
    if (!isRecord(payload)) return;
    if (eventType === REQUEST_EVENT) { this.onInboundRequest(payload); return; }
    if (eventType === REPLY_EVENT) { this.onInboundReply(payload); return; }
    // Older bridge shape: EVENT/broadcast wrapping `{event, payload}`.
    if (eventType === 'broadcast' && typeof payload.event === 'string') {
      if (payload.event === REQUEST_EVENT && isRecord(payload.payload)) this.onInboundRequest(payload.payload);
      else if (payload.event === REPLY_EVENT && isRecord(payload.payload)) this.onInboundReply(payload.payload);
    }
  }

  private onInboundRequest(payload: unknown): void {
    if (!isRecord(payload) || payload.target !== this.config.selfId) return; // directed: only the target replies
    const cid = typeof payload.cid === 'string' ? payload.cid : null;
    const from = typeof payload.from === 'string' ? payload.from : null;
    const req = validateSummonReq(payload.req);
    if (!cid || !from || !req) return;
    const reply = (res: SummonRes) => this.publishDirected(REPLY_EVENT, { cid, to: from, res } satisfies ResEnvelope);
    const handler = this.requestHandlers[0];
    if (!handler) { reply({ accepted: false }); return; } // no responder → decline (AOC §7)
    handler(from, req).then(reply).catch(() => reply({ accepted: false }));
  }

  private onInboundReply(payload: unknown): void {
    if (!isRecord(payload) || typeof payload.cid !== 'string' || !isRecord(payload.res)) return;
    // Replies name their requester; a reply addressed to someone else is not ours.
    if (typeof payload.to === 'string' && payload.to !== this.config.selfId) return;
    const entry = this.pending.get(payload.cid);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(payload.cid);
    entry.resolve({ accepted: payload.res.accepted === true });
  }

  /** Bridge publishing always uses the WORKSPACE id, even from a page channel. */
  private publishDirected(event: string, payload: unknown): void {
    if (!this.config.publish) return;
    const target = this.config.workspaceId ?? this.spaceId;
    void this.config.publish(target, event, payload).catch((error) => this.config.onPublishError?.(error));
  }

  private publish(event: string, payload: unknown): void {
    if (this.config.publish) {
      this.publishDirected(event, payload);
      return;
    }
    this.enqueue(JSON.stringify({ type: 'BROADCAST', topic: this.topic, event, payload }));
  }

  private enqueue(serialized: string): void {
    if (this.subscribed) this.ws?.send(serialized);
    else this.outbox.push(serialized);
  }

  private frame(frame: Record<string, unknown>): void {
    try { this.ws?.send(JSON.stringify(frame)); } catch { /* racing a close */ }
  }
}
