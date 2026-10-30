/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   topicFanOut.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * One live socket per topic, shared by every listener of it. Before this, each hook on
 * the same channel (useChannelLive + useChannelReceipts + useThread) opened its OWN
 * socket to the identical topic — 2-3 sockets per open channel, each with its own
 * AUTH/SUBSCRIBE handshake, 25s heartbeat and JSON parse of every frame.
 *
 * The gateway does not replay what it published while a socket was down, so a
 * subscription that comes back after a drop tells its listeners to re-read what they
 * show (#172).
 *
 * Caveat: a resume says events MAY have been missed, not that they were: every
 * reconnect costs each listener one re-read. An event published before the first
 * SUBSCRIBED is not covered, so one sent while a view is opening can still be missed.
 */

import type { LiveRealtimeEventFrame } from '@/shared/notion-database-sys/src/store/live/liveRealtimeSocket';

/** What the fan-out hands the socket it opens. */
export interface TopicSocketHandlers {
  onEvent: (frame: LiveRealtimeEventFrame) => void;
  onUp: () => void;
  onDown: () => void;
}

export interface TopicListener {
  onEvent: (frame: LiveRealtimeEventFrame) => void;
  /** The subscription came back after a drop: what was published meanwhile never arrived. */
  onResume?: () => void;
}

export type OpenTopicSocket = (handlers: TopicSocketHandlers) => { stop: () => void };

interface SharedTopic {
  socket: { stop: () => void };
  listeners: Set<TopicListener>;
}

/** A socket's up/down handlers that call `onResume` on the first up after a drop. */
export function resumeSignal(onResume: () => void): Pick<TopicSocketHandlers, 'onUp' | 'onDown'> {
  let dropped = false;
  return {
    onDown: () => { dropped = true; },
    onUp: () => {
      if (!dropped) return;
      dropped = false;
      onResume();
    },
  };
}

function shareTopic(open: OpenTopicSocket): SharedTopic {
  const listeners = new Set<TopicListener>();
  const socket = open({
    onEvent: (frame) => {
      for (const listener of listeners) listener.onEvent(frame);
    },
    ...resumeSignal(() => {
      for (const listener of listeners) listener.onResume?.();
    }),
  });
  return { socket, listeners };
}

/** `subscribe(key, open, listener)`: joins the topic's socket, opening it first if none; returns the disposer. */
export function createTopicFanOut() {
  const topics = new Map<string, SharedTopic>();
  return (key: string, open: OpenTopicSocket, listener: TopicListener): (() => void) => {
    const shared = topics.get(key) ?? shareTopic(open);
    topics.set(key, shared);
    shared.listeners.add(listener);
    // Strict mode disposes twice; a second call must not close a socket reopened since.
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      shared.listeners.delete(listener);
      if (shared.listeners.size > 0) return;
      topics.delete(key);
      shared.socket.stop();
    };
  };
}
