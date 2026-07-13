/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   favoritesStore.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Per-user starred pages. BaaS is the source of truth (bridge /api/favorites);
 *  localStorage is a write-through cache so the sidebar renders instantly and
 *  offline. Optimistic toggle reverts on a failed write. */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api, getActivePageJwt } from "@/shared/api/client";

interface FavoritesStore {
  pageIds: string[];
  isFavorite: (pageId: string) => boolean;
  hydrate: () => Promise<void>;
  toggle: (pageId: string) => Promise<void>;
}

const STORE_NAME = "osionos:favorites";

export const useFavoritesStore = create<FavoritesStore>()(
  persist(
    (set, get) => ({
      pageIds: [],
      isFavorite: (pageId) => get().pageIds.includes(pageId),
      hydrate: async () => {
        try {
          const res = await api.get<{ pageIds?: string[] }>("/api/favorites", getActivePageJwt() ?? undefined);
          if (Array.isArray(res.pageIds)) set({ pageIds: res.pageIds });
        } catch { /* offline / no session — keep the cached set */ }
      },
      toggle: async (pageId) => {
        const prev = get().pageIds;
        const has = prev.includes(pageId);
        set({ pageIds: has ? prev.filter((id) => id !== pageId) : [pageId, ...prev] });
        try {
          if (has) await api.delete(`/api/favorites/${pageId}`, getActivePageJwt() ?? undefined);
          else await api.post("/api/favorites", { pageId }, getActivePageJwt() ?? undefined);
        } catch {
          set({ pageIds: prev }); // revert the optimistic change
        }
      },
    }),
    { name: STORE_NAME, partialize: (state) => ({ pageIds: state.pageIds }) },
  ),
);
