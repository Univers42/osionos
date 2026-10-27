/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   grobaseTransport.factory.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 15:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * App-side wiring that turns the membership-gated bridge token into a live
 * Shared-space channel (AOC §Sec1).
 *
 * TWO TOKENS, TWO TOPICS:
 * - `joinSharedSpace` mints the workspace token (`collab:<spaceId>`) after
 *   verifying membership. That socket carries presence identity and the reduced
 *   `pages` nudge only.
 * - `joinSharedSpacePage` mints a per-page token
 *   (`POST /api/collaboration/:ws/pages/:pageId/realtime-token`) whose topic is
 *   `collabpage:<pageId>`. The bridge answers 404 when the caller cannot read
 *   the page, which means "no page channel" — never a retry loop. The token is
 *   subscribe-only; publishing still goes through the bridge event endpoint with
 *   the WORKSPACE id, which re-checks edit access.
 *
 * Directed summons use the per-user topic already served by
 * `mintedTopicSocket`: requests/replies are published through the bridge and
 * inbound envelopes arrive from `user:<selfId>`, never from the workspace
 * socket.
 */

import { ApiError, api, getActivePageJwt } from '@/shared/api/client';
import { liveRealtimeUrl } from '@/shared/notion-database-sys/src/store/live/liveRealtime';
import { subscribeTopic } from '@/services/realtime-messages/wsTransport';
import { userTopic } from '@/services/realtime-messages/wsTopics';
import type { RealtimeChannel } from '../model/realtimeTransport.port';
import { GrobaseRealtimeTransport, type UserTopicFrame } from './realtimeTransportGrobase.adapter';

interface CollabTokenReply { token: string; topic: string; spaceId: string; expiresAt: string; }
interface CollabPageTokenReply {
  ok?: boolean; token: string; expiresAt: string; topic: string; pageId: string; level?: string;
}

/** The caller may not read the page (404) or lost access (403): no page channel. */
export class PageChannelUnavailableError extends Error {
  constructor(message = 'The page channel is not available.') {
    super(message);
    this.name = 'PageChannelUnavailableError';
  }
}

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

type PageTokenPost = (
  path: string, body: unknown, jwt?: string,
) => Promise<CollabPageTokenReply>;

/** Fetch a per-page subscribe-only token; 403/404 means "no page channel". */
export async function fetchSharedSpacePageToken(
  spaceId: string, pageId: string, post: PageTokenPost = api.post as PageTokenPost,
): Promise<string> {
  try {
    const reply = await post(
      `/api/collaboration/${encodeURIComponent(spaceId)}/pages/${encodeURIComponent(pageId)}/realtime-token`,
      {},
      getActivePageJwt() ?? undefined,
    );
    if (!reply?.token) throw new Error('The bridge did not return a page realtime token.');
    return reply.token;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      throw new PageChannelUnavailableError(error.message);
    }
    throw error;
  }
}

/** Bridge events for a page still carry the WORKSPACE id (the bridge maps the page). */
function publishFor(spaceId: string) {
  return async (_workspaceId: string, event: string, payload: unknown): Promise<void> => {
    await api.post(
      `/api/collaboration/${encodeURIComponent(spaceId)}/events`,
      { event, payload },
      getActivePageJwt() ?? undefined,
    );
  };
}

/** Subscribe this client's user topic for directed summons (mintedTopicSocket). */
function userTopicFor(selfId: string) {
  return (onFrame: (frame: UserTopicFrame) => void): (() => void) =>
    subscribeTopic(userTopic(selfId), (frame) => onFrame(frame as UserTopicFrame));
}

/** Workspace reconnect re-mints; 403/404 means removed → stop (C509). */
function renewWorkspaceToken(spaceId: string): () => Promise<string | null> {
  return async () => {
    try {
      return await fetchSharedSpaceToken(spaceId);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return null;
      throw error;
    }
  };
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
  const transport = new GrobaseRealtimeTransport({
    url, selfId, workspaceId: spaceId, scope: 'workspace',
    publish: publishFor(spaceId),
    renewToken: renewWorkspaceToken(spaceId),
    subscribeUserTopic: userTopicFor(selfId),
  });
  return transport.join(spaceId, token);
}

/**
 * Join ONE page's realtime channel (`collabpage:<pageId>`). A 404/403 from the
 * token mint means the caller cannot read the page: this rejects with
 * `PageChannelUnavailableError` and the app simply keeps no page channel.
 */
export async function joinSharedSpacePage(
  spaceId: string, pageId: string, selfId: string,
): Promise<RealtimeChannel> {
  const url = liveRealtimeUrl();
  if (!url) throw new Error('Realtime is not configured (VITE_BAAS_URL).');
  const token = await fetchSharedSpacePageToken(spaceId, pageId);
  const transport = new GrobaseRealtimeTransport({
    url, selfId, workspaceId: spaceId,
    topic: `collabpage:${pageId}`, pageId, scope: 'page',
    publish: publishFor(spaceId),
    renewToken: async () => {
      try {
        return await fetchSharedSpacePageToken(spaceId, pageId);
      } catch (error) {
        if (error instanceof PageChannelUnavailableError) return null; // 403/404 → stop
        throw error;
      }
    },
  });
  return transport.join(pageId, token);
}
