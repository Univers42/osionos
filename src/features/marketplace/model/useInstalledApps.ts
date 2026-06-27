/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useInstalledApps.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

import { api, getActivePageJwt } from "@/shared/api/client";
import type { PageEntry } from "@/entities/page";

import { readAppMeta, type AppLaunchKind } from "./appMeta";

/**
 * A per-user installed app. `active` is the deactivate switch: an inactive app stays
 * installed (its config persists) but disappears from the rail / app launchers and stops
 * running, so the user reclaims resources without uninstalling.
 */
export interface InstalledEntry {
  identifier: string;
  title: string;
  icon?: string;
  launchKind: AppLaunchKind;
  launchUrl: string;
  autoUpdate: boolean;
  active: boolean;
  installedAt: string;
}
export type InstalledMap = Record<string, InstalledEntry>;

export interface InstalledAppsState {
  installed: InstalledMap;
  loaded: boolean;
  load: () => void;
  install: (app: PageEntry) => void;
  uninstall: (identifier: string) => void;
  setActive: (identifier: string, active: boolean) => void;
  toggleAutoUpdate: (identifier: string) => void;
  isInstalled: (identifier: string) => boolean;
  isActive: (identifier: string) => boolean;
}

function persist(installed: InstalledMap): void {
  api.post("/api/marketplace/installed", { installed }, getActivePageJwt() ?? undefined).catch(() => {});
}

/** Per-user install state (global store) backed by the bridge; graceful while the endpoint is absent. */
export const useInstalledApps = create<InstalledAppsState>((set, get) => ({
  installed: {},
  loaded: false,
  load: () => {
    if (get().loaded) return;
    set({ loaded: true });
    api
      .get<{ installed: InstalledMap }>("/api/marketplace/installed", getActivePageJwt() ?? undefined)
      .then((r) => set({ installed: r?.installed ?? {} }))
      .catch(() => {});
  },
  install: (app) => {
    const meta = readAppMeta(app);
    if (!meta.identifier) return;
    const entry: InstalledEntry = {
      identifier: meta.identifier,
      title: app.title,
      icon: app.icon,
      launchKind: meta.launchKind,
      launchUrl: meta.launchUrl,
      autoUpdate: true,
      active: true,
      installedAt: new Date().toISOString(),
    };
    const next: InstalledMap = { ...get().installed, [meta.identifier]: entry };
    set({ installed: next });
    persist(next);
  },
  uninstall: (identifier) => {
    const next: InstalledMap = { ...get().installed };
    delete next[identifier];
    set({ installed: next });
    persist(next);
  },
  setActive: (identifier, active) => {
    const cur = get().installed[identifier];
    if (!cur) return;
    const next: InstalledMap = { ...get().installed, [identifier]: { ...cur, active } };
    set({ installed: next });
    persist(next);
  },
  toggleAutoUpdate: (identifier) => {
    const cur = get().installed[identifier];
    if (!cur) return;
    const next: InstalledMap = { ...get().installed, [identifier]: { ...cur, autoUpdate: !cur.autoUpdate } };
    set({ installed: next });
    persist(next);
  },
  isInstalled: (identifier) => Boolean(get().installed[identifier]),
  isActive: (identifier) => Boolean(get().installed[identifier]?.active),
}));
