/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useReceiptsStore.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Ephemeral delivery receipts + typing indicators (NOT persisted — these
 *  are realtime-derived and must not survive a reload). */

import { create } from 'zustand';

export type ReceiptStatus = 'sent' | 'delivered' | 'seen';

interface ReceiptsStore {
  receipts: Record<string, ReceiptStatus>;
  typing: Record<string, string[]>;
  applyReceipt: (messageId: string, status: ReceiptStatus) => void;
  setTyping: (channelId: string, userId: string, isTyping: boolean) => void;
}

export const useReceiptsStore = create<ReceiptsStore>((set, get) => ({
  receipts: {},
  typing: {},
  applyReceipt: (messageId, status) => {
    set({ receipts: { ...get().receipts, [messageId]: status } });
  },
  setTyping: (channelId, userId, isTyping) => {
    const current = get().typing[channelId] ?? [];
    const next = isTyping
      ? (current.includes(userId) ? current : [...current, userId])
      : current.filter((id) => id !== userId);
    set({ typing: { ...get().typing, [channelId]: next } });
  },
}));
