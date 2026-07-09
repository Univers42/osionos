/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   objectDatabaseRealtime.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/09 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/09 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Cross-client realtime for object databases (`db-<hex>`). The bridge persists
// them one row per (owner, db_key) and — since this change — publishes
// `objectdb_changed` on `objectdb:<ownerId>` after every upsert/delete. This
// subscribes to that topic and re-runs the (idempotent, data-loss-safe)
// hydration so a write in one browser/tab shows up in another WITHOUT a reload.
// Reuses the same LiveRealtimeSocket + gateway credential as chat/feed/live-DB;
// no credential → the caller still hydrates once, so nothing regresses.

import { LiveRealtimeSocket, type LiveRealtimeEventFrame } from '@/shared/notion-database-sys/src/store/live/liveRealtimeSocket';
import { resolveLiveRealtimeToken, liveRealtimeUrl } from '@/shared/notion-database-sys/src/store/live/liveRealtime';
import { getActivePageJwt } from '@/shared/api/client';

const COALESCE_MS = 300; // collapse a burst of remote edits into one re-hydrate

let socket: Pick<LiveRealtimeSocket, 'start' | 'stop'> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Owner id = the app-session token `sub` — the exact key the bridge publishes
 *  on (`objectdb:<authContext.userId>`), so publish and subscribe topics match. */
function ownerIdFromJwt(): string | null {
  const segment = getActivePageJwt()?.split('.')[1];
  if (!segment || typeof atob !== 'function') return null;
  try {
    const payload = JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: unknown };
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Subscribe once to this owner's object-DB change stream; each remote nudge runs
 *  `rehydrate` (coalesced). Idempotent — safe to call on every hydration attempt.
 *  Own writes self-nudge too, but re-hydrating our just-pushed state is a clean
 *  no-op (local == server), so no filter is needed for same-account multi-tab. */
export function startObjectDatabaseRealtime(rehydrate: () => void): void {
  if (socket) return;
  const owner = ownerIdFromJwt();
  const url = liveRealtimeUrl();
  const token = resolveLiveRealtimeToken();
  if (!owner || !url || !token) return; // no gateway credential → hydrate-once only
  socket = new LiveRealtimeSocket({
    url,
    token,
    topic: `objectdb:${owner}`,
    onEvent: (frame: LiveRealtimeEventFrame) => {
      if (frame.event_type !== 'objectdb_changed' || timer) return;
      timer = setTimeout(() => { timer = null; rehydrate(); }, COALESCE_MS);
    },
  });
  socket.start();
}

/** Tear down on account switch so the next account resubscribes on its own topic. */
export function stopObjectDatabaseRealtime(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  socket?.stop();
  socket = null;
}
