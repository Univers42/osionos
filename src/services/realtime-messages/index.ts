/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   index.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:24:23 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:24:24 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RealtimeMessage {
  id: string;
  threadId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

interface RealtimeMessagesStore {
  messagesByThread: Record<string, RealtimeMessage[]>;
  sendMessage: (threadId: string, authorId: string, authorName: string, body: string) => RealtimeMessage | null;
  addRemoteMessage: (message: RealtimeMessage) => void;
}

const CHANNEL_NAME = "osionos:realtime-messages";
let broadcastChannel: BroadcastChannel | null = null;
let initialized = false;

const MAX_THREAD_MESSAGES = 200;

/** Per-thread id sets for O(1) dedup, mirroring `messagesByThread`. Rebuilt lazily from a
 *  thread's array the first time it's touched after a hydrate (the store arrays stay the
 *  source of truth; this side index is kept in lockstep on every append). */
const seenIdsByThread = new Map<string, Set<string>>();

function seenIdsFor(threadId: string, messages: RealtimeMessage[]): Set<string> {
  let seen = seenIdsByThread.get(threadId);
  if (!seen) {
    seen = new Set(messages.map((item) => item.id));
    seenIdsByThread.set(threadId, seen);
  }
  return seen;
}

/** First index that sorts strictly AFTER `createdAt` — the insertion point that keeps a
 *  thread ascending by createdAt. Equal timestamps insert after existing ones, preserving
 *  arrival order exactly as the previous full re-sort did. */
function insertionIndex(messages: RealtimeMessage[], createdAt: string): number {
  let lo = 0;
  let hi = messages.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (messages[mid].createdAt.localeCompare(createdAt) <= 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function appendMessage(
  current: Record<string, RealtimeMessage[]>,
  message: RealtimeMessage,
): Record<string, RealtimeMessage[]> {
  const threadMessages = current[message.threadId] ?? [];
  const seen = seenIdsFor(message.threadId, threadMessages);
  if (seen.has(message.id)) return current;

  // Binary insert into a shallow copy instead of re-sorting [...all, message] each append.
  const next = threadMessages.slice();
  next.splice(insertionIndex(next, message.createdAt), 0, message);
  seen.add(message.id);

  // Bound memory to the most recent MAX_THREAD_MESSAGES: steady-state append drops at most
  // the single oldest; a longer persisted history (older builds were unbounded) trims its
  // overflow in one pass. Keep the seen index in lockstep so it can't grow unbounded.
  if (next.length > MAX_THREAD_MESSAGES) {
    const dropCount = next.length - MAX_THREAD_MESSAGES;
    for (let index = 0; index < dropCount; index++) seen.delete(next[index].id);
    next.splice(0, dropCount);
  }

  return { ...current, [message.threadId]: next };
}

export const useRealtimeMessagesStore = create<RealtimeMessagesStore>()(
  persist(
    (set) => ({
      messagesByThread: {},
      sendMessage: (threadId, authorId, authorName, body) => {
        const trimmed = body.trim();
        if (!trimmed) return null;

        const message: RealtimeMessage = {
          id: `msg-${crypto.randomUUID()}`,
          threadId,
          authorId,
          authorName,
          body: trimmed,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          messagesByThread: appendMessage(state.messagesByThread, message),
        }));
        broadcastChannel?.postMessage(message);
        return message;
      },
      addRemoteMessage: (message) => {
        set((state) => ({
          messagesByThread: appendMessage(state.messagesByThread, message),
        }));
      },
    }),
    {
      name: "osionos:realtime-messages",
      // Drop the seen-id index after a rehydrate so it rebuilds lazily from the restored
      // arrays (which may carry an older, longer history than the current cap).
      onRehydrateStorage: () => () => { seenIdsByThread.clear(); },
    },
  ),
);

export function initRealtimeMessagesBridge() {
  if (initialized || typeof BroadcastChannel === "undefined") return;
  initialized = true;
  broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  broadcastChannel.onmessage = (event: MessageEvent<RealtimeMessage>) => {
    const message = event.data;
    if (!message?.id || !message.threadId) return;
    useRealtimeMessagesStore.getState().addRemoteMessage(message);
  };
}
