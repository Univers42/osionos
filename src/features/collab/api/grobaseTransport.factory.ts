/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   grobaseTransport.factory.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 15:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 15:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * App-side wiring that turns the membership-gated bridge token into a live
 * Shared-space channel (AOC §Sec1). The bridge mints a realtime token whose
 * `namespaces` is exactly `collab:<spaceId>` after verifying membership, so the
 * gateway authorizes per-space — a non-member is denied at the bridge (no token)
 * AND would be denied at the gateway (no namespace). The WS URL + framing come
 * from the one adapter; only this factory knows the bridge token endpoint.
 */

import { api, getActivePageJwt } from '@/shared/api/client';
import { liveRealtimeUrl } from '@/shared/notion-database-sys/src/store/live/liveRealtime';
import type { RealtimeChannel } from '../model/realtimeTransport.port';
import { GrobaseRealtimeTransport } from './realtimeTransportGrobase.adapter';

interface CollabTokenReply { token: string; topic: string; spaceId: string; expiresAt: string; }

/** Fetch a per-space realtime token from the membership-gated bridge endpoint. */
export async function fetchSharedSpaceToken(spaceId: string): Promise<string> {
  const reply = await api.post<CollabTokenReply>(
    `/api/collaboration/${encodeURIComponent(spaceId)}/realtime-token`,
    {},
    getActivePageJwt() ?? undefined,
  );
  if (!reply?.token) throw new Error('The bridge did not return a realtime token.');
  return reply.token;
}

/**
 * Join a Shared space's realtime channel. `selfId` is the member's id (addresses
 * directed summons + stamps presence). Throws if realtime is unconfigured or the
 * caller is not a member (the bridge returns 403).
 */
export async function joinSharedSpace(spaceId: string, selfId: string): Promise<RealtimeChannel> {
  const url = liveRealtimeUrl();
  if (!url) throw new Error('Realtime is not configured (VITE_BAAS_URL).');
  const token = await fetchSharedSpaceToken(spaceId);
  const transport = new GrobaseRealtimeTransport({ url, selfId });
  return transport.join(spaceId, token);
}
