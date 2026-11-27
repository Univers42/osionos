/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useStickyScroll.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useEffect, useRef, useState } from "react";

import { useUnreadStore } from "@/store/chat/useUnreadStore";
import { postChannelRead } from "@/shared/chat/unreadApi";
import type { ChatMessage } from "@/shared/chat/messageApi";

/** How close to the bottom (px) still counts as "reading the latest". */
const NEAR_BOTTOM_PX = 120;
/** One read POST per burst of incoming messages, this long after the last one. */
const READ_POST_DELAY_MS = 1200;

/**
 * Scroll discipline of a message list: stick to the bottom only when the reader
 * is already there; a new message while scrolled up is counted instead of
 * yanking the viewport. A channel switch resets to the bottom, marks the channel
 * seen and posts the read mark. The read POST is coalesced: it used to fire once
 * per incoming message while parked at the bottom, and the high-water id is
 * idempotent, so one write per burst is enough.
 */
export function useStickyScroll(channelId: string, messages: ChatMessage[]) {
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const prevLenRef = useRef(0);
  const readPostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const markSeen = useUnreadStore((s) => s.markSeen);

  const jumpToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    atBottomRef.current = true;
    setAtBottom(true);
    setNewCount(0);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
      atBottomRef.current = near;
      setAtBottom(near);
      if (near) setNewCount(0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    atBottomRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: moved verbatim from ChannelMessagesView (it passed there); channel switch resets the scroll state (osionos#341)
    setAtBottom(true);
    setNewCount(0);
    prevLenRef.current = 0;
    markSeen(channelId);
    void postChannelRead(channelId).catch(() => undefined);
    return () => {
      if (readPostTimerRef.current) globalThis.clearTimeout(readPostTimerRef.current);
      readPostTimerRef.current = null;
    };
  }, [channelId, markSeen]);

  useEffect(() => {
    const delta = messages.length - prevLenRef.current;
    prevLenRef.current = messages.length;
    if (atBottomRef.current) {
      endRef.current?.scrollIntoView({ block: "end" });
      if (delta > 0) {
        markSeen(channelId);
        if (readPostTimerRef.current) globalThis.clearTimeout(readPostTimerRef.current);
        const lastId = messages[messages.length - 1]?.id;
        readPostTimerRef.current = globalThis.setTimeout(() => {
          readPostTimerRef.current = null;
          void postChannelRead(channelId, lastId).catch(() => undefined);
        }, READ_POST_DELAY_MS);
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: moved verbatim from ChannelMessagesView (it passed there); a stick-to-bottom clears the new-message count (osionos#341)
      setNewCount(0);
    } else if (delta > 0) {
      setNewCount((n) => n + delta);
    }
  }, [messages, channelId, markSeen]);

  return { scrollRef, endRef, atBottom, newCount, jumpToBottom };
}
