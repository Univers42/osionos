/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   objectDatabaseRealtime.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/09 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Cross-client realtime for object databases (`db-<hex>`). The bridge persists
// them one row per (owner, db_key) and — since this change — publishes
// `objectdb_changed` on `objectdb:<ownerId>` after every upsert/delete. This
// subscribes to that topic and re-runs the (idempotent, data-loss-safe)
// hydration so a write in one browser/tab shows up in another WITHOUT a reload.
// Reuses the same gateway credential as chat/feed/live-DB; no credential → the
// caller still hydrates once, so nothing regresses.
//
// The gateway refuses the app's own bridge session JWT (AUTH_FAILED), so when
// there is no baked token this asks the bridge for a subscribe-only token on
// this one topic (the same minted path the chat transport uses) instead of
// offering the session JWT.

import { LiveRealtimeSocket, type LiveRealtimeEventFrame } from '@/shared/notion-database-sys/src/store/live/liveRealtimeSocket';
import { resolveLiveRealtimeToken, liveRealtimeUrl } from '@/shared/notion-database-sys/src/store/live/liveRealtime';
import { getActivePageJwt } from '@/shared/api/client';
import { chatWsEnabled, subscribeTopic } from '@/services/realtime-messages/wsTransport';
import { resumeSignal } from '@/services/realtime-messages/topicFanOut';

const COALESCE_MS = 300; // collapse a burst of remote edits into one re-hydrate

/** The live subscription, whatever opened it (a direct socket or a shared one). */
let unsubscribe: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Owner id = the app-session token `sub` — the exact key the bridge publishes
 *  on (`objectdb:<authContext.userId>`, which lower-cases the subject), so
 *  publish and subscribe topics match. */
function ownerIdFromJwt(): string | null {
  const segment = getActivePageJwt()?.split('.')[1];
  if (!segment || typeof atob !== 'function') return null;
  try {
    const payload = JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: unknown };
    return typeof payload.sub === 'string' ? payload.sub.toLowerCase() : null;
  } catch {
    return null;
  }
}

function newWriterId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** This tab's id, sent with every push and echoed back in the nudge it causes.
 *  Re-hydrating on our own push re-downloaded every database of the account
 *  (2.7 MiB for the largest live one) to learn that nothing changed. */
export const OBJECT_DB_WRITER_ID = newWriterId();

/** A nudge this tab's own push caused. No id (an older bridge) is never ours. */
export function isOwnObjectDbWrite(payload: unknown): boolean {
  return typeof payload === 'object' && payload !== null
    && (payload as { origin?: unknown }).origin === OBJECT_DB_WRITER_ID;
}

/** The frame handler: another writer's nudge runs `rehydrate` once per burst. */
export function objectDbNudgeHandler(rehydrate: () => void): (frame: LiveRealtimeEventFrame) => void {
  return (frame) => {
    if (frame.event_type !== 'objectdb_changed' || timer || isOwnObjectDbWrite(frame.payload)) return;
    timer = setTimeout(() => { timer = null; rehydrate(); }, COALESCE_MS);
  };
}

/** Subscribe once to this owner's object-DB change stream; each nudge from another
 *  tab or browser runs `rehydrate` (coalesced), and so does a reconnect, whose gap the
 *  gateway never replays (#172). Idempotent — safe to call on every
 *  hydration attempt. */
export function startObjectDatabaseRealtime(rehydrate: () => void): void {
  if (unsubscribe) return; // already live — one socket per owner
  const owner = ownerIdFromJwt();
  const url = liveRealtimeUrl();
  if (!owner || !url) return; // no gateway → hydrate-once only
  const topic = `objectdb:${owner}`;
  const onEvent = objectDbNudgeHandler(rehydrate);
  const token = resolveLiveRealtimeToken();
  if (token) {
    // A credential the gateway accepts (a baked token): open the socket directly.
    const socket = new LiveRealtimeSocket({ url, token, topic, onEvent, ...resumeSignal(rehydrate) });
    socket.start();
    unsubscribe = () => socket.stop();
    return;
  }
  // No usable token (the bridge session JWT answers AUTH_FAILED): ask the bridge
  // for a subscribe-only token on this topic through the shared transport.
  if (!chatWsEnabled()) return;
  unsubscribe = subscribeTopic(topic, onEvent, rehydrate);
}

/** Tear down on account switch so the next account resubscribes on its own topic. */
export function stopObjectDatabaseRealtime(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  unsubscribe?.();
  unsubscribe = null;
}
