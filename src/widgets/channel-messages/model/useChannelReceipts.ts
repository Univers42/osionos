/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useChannelReceipts.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Read/delivered receipts + typing for one channel, riding the SAME realtime
 * topic as useChannelLive (`chat:<ws>:<channel>`). The bridge emits
 * `receipt_updated {userId, upToMessageId, status}` (a per-user high-water
 * mark) and `typing {userId}` (a fire signal with no stop — expired on a
 * timer here). When the thread is viewed we POST a `seen` receipt up to the
 * latest message so peers' ticks flip. All state lives in the ephemeral
 * useReceiptsStore; nothing is persisted.
 */

import { useEffect } from 'react';

import { api, getActivePageJwt } from '@/shared/api/client';
import { chatTopic } from '@/services/realtime-messages/wsTopics';
import { subscribeTopic } from '@/services/realtime-messages/wsTransport';
import { useReceiptsStore } from '@/store/chat/useReceiptsStore';

interface ReceiptPayload {
  userId?: string;
  upToMessageId?: string;
  status?: 'delivered' | 'seen';
}

const TYPING_TTL_MS = 4000;

async function markSeen(channelId: string, upToMessageId: string): Promise<void> {
  await api.post(
    `/api/chat/channels/${encodeURIComponent(channelId)}/receipts`,
    { upToMessageId, status: 'seen' },
    getActivePageJwt() ?? undefined,
  );
}

/** Subscribe receipts/typing for the channel; POST `seen` as messages arrive. */
export function useChannelReceipts(
  workspaceId: string,
  channelId: string,
  selfUserId: string,
  latestMessageId: string | undefined,
): void {
  const applyReceipt = useReceiptsStore((s) => s.applyReceipt);
  const setTyping = useReceiptsStore((s) => s.setTyping);

  useEffect(() => {
    if (!workspaceId || !channelId) return undefined;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const disposer = subscribeTopic(chatTopic(workspaceId, channelId), (frame) => {
      const payload = (frame.payload ?? {}) as ReceiptPayload;
      if (frame.event_type === 'receipt_updated') {
        if (payload.userId === selfUserId || !payload.upToMessageId) return;
        applyReceipt(payload.upToMessageId, payload.status === 'delivered' ? 'delivered' : 'seen');
      } else if (frame.event_type === 'typing') {
        const who = payload.userId;
        if (!who || who === selfUserId) return;
        setTyping(channelId, who, true);
        clearTimeout(timers.get(who));
        timers.set(who, setTimeout(() => setTyping(channelId, who, false), TYPING_TTL_MS));
      }
    });
    return () => {
      timers.forEach((t) => clearTimeout(t));
      disposer();
    };
  }, [workspaceId, channelId, selfUserId, applyReceipt, setTyping]);

  useEffect(() => {
    if (!channelId || !latestMessageId) return;
    // Coalesced: this fired one POST per incoming message in an active channel.
    // The seen-mark is an idempotent high-water id, so a trailing debounce sends
    // one write per burst; a superseded timer is simply replaced by the newer id.
    const timer = globalThis.setTimeout(() => {
      void markSeen(channelId, latestMessageId).catch(() => undefined);
    }, 1200);
    return () => globalThis.clearTimeout(timer);
  }, [channelId, latestMessageId]);
}
