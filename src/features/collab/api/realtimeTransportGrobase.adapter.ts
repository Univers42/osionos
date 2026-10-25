/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   realtimeTransportGrobase.adapter.ts                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 14:00:00 by dlesieur         ###   ########.fr       */
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
 * PRESENCE is NATIVE (TRACK/UNTRACK → presence snapshots) — not synthesized.
 * On the wire it arrives in TWO shapes: the top-level PRESENCE frame
 * (older gateway) and, on the realtime-agnostic gateway, as an EVENT with
 * `event_type === 'presence'` whose payload is `{topic, members}`
 * (realtime-gateway/src/ws_handler/connection.rs publish_presence_snapshot).
 * Both funnel through one boundary validation (R-P1): a member is trusted
 * only when `meta.memberId` is a string AND its server-stamped `user_id`
 * (gateway, from the token `sub`) is absent (older gateway) or equals
 * `meta.memberId` case-insensitively — a disagreeing `user_id` means the
 * client TRACKed someone else's identity, so that member is DROPPED.
 * REQUEST/REPLY is NOT native: it is synthesized over BROADCAST with a
 * correlationId convention + a client-side timeout (AOC §7). The app factory
 * supplies authenticated bridge publishing; WS fan-out and presence stay here. Durable writes do
 * NOT ride this transport — they go HTTP→bridge (AOC §4 ephemeral/durable split).
 */

import type { LiveWebSocketLike, LiveWebSocketCtor } from '@/shared/notion-database-sys/src/store/live/liveRealtimeSocket';
import type {
  CollabEvent, PresenceState, RealtimeChannel, RealtimeTransport, SummonReq, SummonRes, Unsubscribe,
} from '../model/realtimeTransport.port';
import { validateCollabEvent, validateSummonReq } from '../model/collabEvent.schema';
import { backoffDelay, MAX_RECONNECT_ATTEMPTS, type BackoffOpts } from '../model/backoff';

const COLLAB_EVENT = 'collab';      // broadcast label for a CollabEvent payload
const REQUEST_EVENT = 'collab.req'; // synthesized directed-request envelope
const REPLY_EVENT = 'collab.res';   // synthesized request reply envelope
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface GrobaseTransportConfig {
  url: string;
  /** This client's memberId — addresses synthesized requests + stamps presence. */
  selfId: string;
  webSocketCtor?: LiveWebSocketCtor;
  requestTimeoutMs?: number;
  backoff?: BackoffOpts;
  /** Authenticated bridge publishing; the socket token only subscribes. */
  publish?: (spaceId: string, event: string, payload: unknown) => Promise<void>;
  onPublishError?: (error: unknown) => void;
}

interface GatewayEvent { event_type: string; payload: unknown; }
/** One member of a presence snapshot as published by the gateway. */
interface PresenceWireMember { user_id?: unknown; meta?: unknown; }
interface ReqEnvelope { cid: string; from: string; target: string; req: SummonReq; }
interface ResEnvelope { cid: string; res: SummonRes; }

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
    states.push(meta as unknown as PresenceState);
  }
  return states;
};

export class GrobaseRealtimeTransport implements RealtimeTransport {
  private readonly config: GrobaseTransportConfig;

  constructor(config: GrobaseTransportConfig) {
    this.config = config;
  }

  join(spaceId: string, authToken: string): Promise<RealtimeChannel> {
    return new Promise<RealtimeChannel>((resolve, reject) => {
      const channel = new GrobaseChannel(this.config, spaceId, authToken, resolve, reject);
      channel.open();
    });
  }
}

class GrobaseChannel implements RealtimeChannel {
  private ws: LiveWebSocketLike | null = null;
  private readonly topic: string;
  private subscribed = false;
  private readonly outbox: string[] = [];
  private readonly eventHandlers = new Set<(e: CollabEvent) => void>();
  private readonly presenceHandlers = new Set<(m: PresenceState[]) => void>();
  private readonly requestHandlers: Array<(from: string, req: SummonReq) => Promise<SummonRes>> = [];
  private readonly pending = new Map<string, { resolve: (r: SummonRes) => void; timer: ReturnType<typeof setTimeout> }>();
  private presence: Partial<PresenceState> = {};
  private readonly config: GrobaseTransportConfig;
  private readonly authToken: string;
  private readonly onReady: (c: RealtimeChannel) => void;
  private readonly onFail: (e: Error) => void;
  private closing = false;        // true once leave() is called — suppresses reconnect
  private everReady = false;      // join promise already resolved — never re-resolve
  private reconnectAttempt = 0;   // resets to 0 on a successful (re)subscribe
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    config: GrobaseTransportConfig,
    spaceId: string,
    authToken: string,
    onReady: (c: RealtimeChannel) => void,
    onFail: (e: Error) => void,
  ) {
    this.config = config;
    this.authToken = authToken;
    this.onReady = onReady;
    this.onFail = onFail;
    this.topic = `collab:${spaceId}`;
  }

  open(): void {
    const Ctor = this.config.webSocketCtor ?? (globalThis as { WebSocket?: LiveWebSocketCtor }).WebSocket;
    if (!Ctor) { this.onFail(new Error('no WebSocket support')); return; }
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
    this.reconnectTimer = setTimeout(() => { if (!this.closing) this.open(); }, delay);
  }

  private handleFrame(data: unknown): void {
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
    if (env.event === COLLAB_EVENT) {
      const valid = validateCollabEvent(env.payload); // R-P1: validate at the boundary, drop malformed
      if (valid) for (const handler of this.eventHandlers) handler(valid);
    } else if (env.event === REQUEST_EVENT) {
      this.onInboundRequest(env.payload);
    } else if (env.event === REPLY_EVENT) {
      this.onInboundReply(env.payload);
    }
  }

  private deliverPresence(states: PresenceState[]): void {
    for (const handler of this.presenceHandlers) handler(states);
  }

  broadcast(event: CollabEvent): void {
    this.publish(COLLAB_EVENT, event);
  }

  onEvent(handler: (e: CollabEvent) => void): Unsubscribe {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  setPresence(patch: Partial<PresenceState>): void {
    this.presence = { ...this.presence, ...patch, memberId: this.config.selfId };
    this.enqueue(JSON.stringify({ type: 'TRACK', topic: this.topic, meta: this.presence }));
  }

  onPresence(handler: (members: PresenceState[]) => void): Unsubscribe {
    this.presenceHandlers.add(handler);
    return () => this.presenceHandlers.delete(handler);
  }

  request(target: string, req: SummonReq): Promise<SummonRes> {
    const cid = globalThis.crypto?.randomUUID?.() ?? `r-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise<SummonRes>((resolve) => {
      const timer = setTimeout(() => { this.pending.delete(cid); resolve({ accepted: false }); },
        this.config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
      this.pending.set(cid, { resolve, timer });
      this.publish(REQUEST_EVENT, { cid, from: this.config.selfId, target, req } satisfies ReqEnvelope);
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

  private onInboundRequest(payload: unknown): void {
    if (!isRecord(payload) || payload.target !== this.config.selfId) return; // directed: only the target replies
    const cid = typeof payload.cid === 'string' ? payload.cid : null;
    const from = typeof payload.from === 'string' ? payload.from : null;
    const req = validateSummonReq(payload.req);
    if (!cid || !from || !req) return;
    const reply = (res: SummonRes) => this.publish(REPLY_EVENT, { cid, res } satisfies ResEnvelope);
    const handler = this.requestHandlers[0];
    if (!handler) { reply({ accepted: false }); return; } // no responder → decline (AOC §7)
    handler(from, req).then(reply).catch(() => reply({ accepted: false }));
  }

  private onInboundReply(payload: unknown): void {
    if (!isRecord(payload) || typeof payload.cid !== 'string' || !isRecord(payload.res)) return;
    const entry = this.pending.get(payload.cid);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(payload.cid);
    entry.resolve({ accepted: payload.res.accepted === true });
  }

  private publish(event: string, payload: unknown): void {
    if (this.config.publish) {
      void this.config.publish(this.topic.slice('collab:'.length), event, payload).catch((error) => this.config.onPublishError?.(error));
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
