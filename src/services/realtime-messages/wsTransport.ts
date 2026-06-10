/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   wsTransport.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Chat/feed transport over the Rust realtime gateway (Kong /realtime/v1/ws),
 * reusing the battle-tested LiveRealtimeSocket protocol client and the same
 * token/url resolution as the live-database plane (VITE_BAAS_URL +
 * VITE_BAAS_REALTIME_TOKEN). Gated by VITE_CHAT_WS: default ON whenever a
 * realtime token is present, explicit "false"/"0"/"off" disables it. The
 * BroadcastChannel bridge in ./index stays as the same-tab/offline echo —
 * this transport only ADDS cross-user delivery; it never replaces it.
 */

import {
  liveRealtimeUrl,
  resolveLiveRealtimeToken,
} from '@/shared/notion-database-sys/src/store/live/liveRealtime';
import {
  LiveRealtimeSocket,
  type LiveRealtimeEventFrame,
} from '@/shared/notion-database-sys/src/store/live/liveRealtimeSocket';

export type { LiveRealtimeEventFrame };

const env = (import.meta.env ?? {}) as Record<string, string | undefined>;

/** ON when a realtime credential exists, unless VITE_CHAT_WS opts out. */
export function chatWsEnabled(): boolean {
  const flag = (env.VITE_CHAT_WS ?? '').trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  return Boolean(resolveLiveRealtimeToken() && liveRealtimeUrl());
}

/**
 * Subscribe to one topic; returns the unsubscribe disposer. No credential /
 * flag off → inert no-op disposer (callers keep their polling/local echo).
 */
export function subscribeTopic(
  topic: string,
  onEvent: (frame: LiveRealtimeEventFrame) => void,
): () => void {
  if (!chatWsEnabled()) return () => undefined;
  const url = liveRealtimeUrl();
  const token = resolveLiveRealtimeToken();
  if (!url || !token) return () => undefined;
  const socket = new LiveRealtimeSocket({ url, token, topic, onEvent });
  socket.start();
  return () => socket.stop();
}
