/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useUnreadStore.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Per-channel unread counters + last-seen marks (persisted). */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UnreadStore {
  counts: Record<string, number>;
  lastSeen: Record<string, string>;
  setCounts: (counts: Record<string, number>) => void;
  markSeen: (channelId: string) => void;
  bump: (channelId: string) => void;
}

const STORE_NAME = 'osionos:chat:unread';

/** True when two count maps are value-identical — lets setCounts no-op the 60s
 *  poll's fresh-object write so its ~5 subscribers don't re-render on no change. */
function sameCounts(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}

export const useUnreadStore = create<UnreadStore>()(
  persist(
    (set, get) => ({
      counts: {},
      lastSeen: {},
      setCounts: (counts) => set((state) => (sameCounts(state.counts, counts) ? state : { counts })),
      markSeen: (channelId) => {
        const counts = { ...get().counts };
        delete counts[channelId];
        set({ counts, lastSeen: { ...get().lastSeen, [channelId]: new Date().toISOString() } });
      },
      bump: (channelId) => {
        const counts = get().counts;
        set({ counts: { ...counts, [channelId]: (counts[channelId] ?? 0) + 1 } });
      },
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ counts: state.counts, lastSeen: state.lastSeen }),
    },
  ),
);
