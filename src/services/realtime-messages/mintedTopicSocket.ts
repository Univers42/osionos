/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mintedTopicSocket.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Realtime sockets for a build that ships no VITE_BAAS_REALTIME_TOKEN: the
 * gateway refuses user session JWTs, so each topic asks the bridge
 * (POST /api/realtime/token) for a subscribe-only token naming just that topic.
 * One socket per topic, so every AUTH carries the token minted for the one
 * topic it then subscribes to; the gateway replaces a socket's claims on a
 * second AUTH, which is why topics are never multiplexed over one socket here.
 *
 * Caveat: an open subscription outlives its token and survives removal from the
 * channel until the socket closes (the gateway checks exp only at AUTH). A
 * reconnect re-mints in the background; if the mint is slower than the 2 s
 * reconnect backoff the AUTH reuses the stale token, fails once, and the
 * socket's single retry picks up the fresh one.
 */

import type { LiveRealtimeEventFrame, LiveSocketOptions } from '@/shared/notion-database-sys/src/store/live/liveRealtimeSocket';

export type TopicTokenRequest =
  | { kind: 'chat'; channelId: string }
  | { kind: 'user'; subject: string };

export type TopicTokenFetcher = (topic: string) => Promise<string | null>;

interface StoppableSocket {
  start(): void;
  stop(): void;
}

/** Only these two topic shapes can be granted; the bridge refuses the rest. */
export function tokenRequestForTopic(topic: string): TopicTokenRequest | null {
  const chat = /^chat:[^:]+:([^:]+)$/.exec(topic);
  if (chat) return { kind: 'chat', channelId: chat[1] };
  const user = /^user:([^:]+)$/.exec(topic);
  if (user) return { kind: 'user', subject: user[1] };
  return null;
}

interface FetcherDeps {
  getJwt: () => string | null;
  post: (path: string, body: TopicTokenRequest, jwt: string) => Promise<{ token?: string }>;
}

/** A failed or unauthorised mint is null, never a throw: the caller keeps polling. */
export function createTopicTokenFetcher({ getJwt, post }: FetcherDeps): TopicTokenFetcher {
  return async (topic) => {
    const request = tokenRequestForTopic(topic);
    const jwt = getJwt();
    if (!request || !jwt) return null;
    try {
      const response = await post('/api/realtime/token', request, jwt);
      return typeof response.token === 'string' && response.token ? response.token : null;
    } catch {
      return null;
    }
  };
}

interface MintedSocketDeps {
  url: string;
  topic: string;
  onEvent: (frame: LiveRealtimeEventFrame) => void;
  fetchToken: TopicTokenFetcher;
  createSocket: (options: LiveSocketOptions) => StoppableSocket;
}

export function openMintedSocket(deps: MintedSocketDeps): { stop: () => void } {
  let stopped = false;
  let socket: StoppableSocket | null = null;
  let token = '';
  const refresh = async (): Promise<boolean> => {
    const next = await deps.fetchToken(deps.topic);
    if (next) token = next;
    return next !== null;
  };
  void refresh().then((minted) => {
    if (stopped || !minted) return;
    socket = deps.createSocket({
      url: deps.url,
      topic: deps.topic,
      onEvent: deps.onEvent,
      get token() { return token; },
      onDown: () => { void refresh(); },
    });
    socket.start();
  });
  return {
    stop: () => {
      stopped = true;
      socket?.stop();
    },
  };
}
