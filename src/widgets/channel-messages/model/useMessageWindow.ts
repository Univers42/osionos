/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useMessageWindow.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect, useMemo, useState } from "react";

import type { MessageRowEntry } from "./messageGrouping";

/** Newest messages rendered per window; "Show earlier" grows by another window. */
export const MESSAGE_WINDOW = 80;

/**
 * Windowed tail: only the newest slice becomes DOM. A busy channel previously
 * mounted EVERY message (thousands of rows + one authed media fetch each) on
 * open. The window always reaches back to the unread anchor so the "New"
 * divider is never hidden; `showEarlier` grows it on demand.
 */
export function useMessageWindow(rows: MessageRowEntry[], channelId: string, firstUnread: string | null) {
  const [visibleCount, setVisibleCount] = useState(MESSAGE_WINDOW);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: moved verbatim from ChannelMessagesView (it passed there); channel switch resets the window (osionos#341)
  useEffect(() => setVisibleCount(MESSAGE_WINDOW), [channelId]);
  const windowStart = useMemo(() => {
    const start = Math.max(0, rows.length - visibleCount);
    if (!firstUnread || start === 0) return start;
    const anchor = rows.findIndex((row) => row.message.id === firstUnread);
    return anchor >= 0 ? Math.min(start, anchor) : start;
  }, [rows, visibleCount, firstUnread]);
  const visibleRows = useMemo(() => (windowStart > 0 ? rows.slice(windowStart) : rows), [rows, windowStart]);
  const showEarlier = () => setVisibleCount((count) => count + MESSAGE_WINDOW);
  return { windowStart, visibleRows, showEarlier };
}
