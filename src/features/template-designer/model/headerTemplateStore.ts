/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   headerTemplateStore.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

import { api, getActivePageJwt } from "@/shared/api/client";
import type { HeaderTemplate } from "@/entities/page/model/headerTemplate";

const LS_KEY = "osio-header-templates.v1";

function loadLocal(): Record<string, HeaderTemplate> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}") as Record<string, HeaderTemplate>;
  } catch {
    return {};
  }
}

function saveLocal(map: Record<string, HeaderTemplate>): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — keep the in-memory copy */
  }
}

interface HeaderTemplateStore {
  overrides: Record<string, HeaderTemplate>;
  loaded: Record<string, boolean>;
  /** Persist a designed header (shared via the bridge + a local cache). */
  setOverride: (databaseId: string, template: HeaderTemplate) => void;
  clearOverride: (databaseId: string) => void;
  /** Fetch the server-shared template for a database once (server wins over the local cache). */
  ensureLoaded: (databaseId: string) => void;
}

/**
 * User-designed header templates per database. Persisted to the bridge (shared across
 * devices/users) with a localStorage cache for instant render + offline. The resolver
 * layers these on top of the built-in preset registry.
 */
export const useHeaderTemplateStore = create<HeaderTemplateStore>((set, get) => ({
  overrides: loadLocal(),
  loaded: {},
  setOverride: (databaseId, template) => {
    const next = { ...get().overrides, [databaseId]: template };
    set({ overrides: next });
    saveLocal(next);
    api.post("/api/marketplace/header-template", { databaseId, template }, getActivePageJwt() ?? undefined).catch(() => {});
  },
  clearOverride: (databaseId) => {
    const next = { ...get().overrides };
    delete next[databaseId];
    set({ overrides: next });
    saveLocal(next);
  },
  ensureLoaded: (databaseId) => {
    if (!databaseId || get().loaded[databaseId]) return;
    set({ loaded: { ...get().loaded, [databaseId]: true } });
    api
      .get<{ template: HeaderTemplate | null }>(`/api/marketplace/header-template?databaseId=${encodeURIComponent(databaseId)}`, getActivePageJwt() ?? undefined)
      .then((r) => {
        if (r?.template) {
          const next = { ...get().overrides, [databaseId]: r.template };
          set({ overrides: next });
          saveLocal(next);
        }
      })
      .catch(() => {});
  },
}));
