/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useMarketplaceApps.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useEffect, useState } from "react";

import { api, getActivePageJwt } from "@/shared/api/client";
import type { PageEntry, PagePropertyEntry } from "@/entities/page";

import { registerMarketplaceTemplates } from "./registerMarketplace";

// Register the marketplace templates the moment the feature is loaded (idempotent).
registerMarketplaceTemplates();

interface AppDetail {
  app: PageEntry | null;
  children: PageEntry[];
}

/** Fetch the global, cross-workspace app catalogue (graceful until the bridge endpoint + seed land). */
export function useMarketplaceApps(): { apps: PageEntry[]; loading: boolean; error: string | null; reload: () => void } {
  const [apps, setApps] = useState<PageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset loading before (re)fetching the catalogue on reload (tick change)
    setLoading(true);
    api
      .get<PageEntry[]>("/api/marketplace/apps", getActivePageJwt() ?? undefined)
      .then((rows) => {
        if (!alive) return;
        setApps(Array.isArray(rows) ? rows : []);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setApps([]);
        setError(e instanceof Error ? e.message : "Failed to load marketplace");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { apps, loading, error, reload };
}

/** Create a new draft app owned by the caller; returns the new record. */
export async function createApp(title: string): Promise<PageEntry | null> {
  return api.post<PageEntry>("/api/marketplace/apps", { title }, getActivePageJwt() ?? undefined).catch(() => null);
}

/** Owner-only update of a draft app's title / icon / properties. */
export async function updateApp(id: string, patch: { title?: string; icon?: string; properties?: PagePropertyEntry[] }): Promise<PageEntry | null> {
  return api.patch<PageEntry>(`/api/marketplace/apps/${id}`, patch, getActivePageJwt() ?? undefined).catch(() => null);
}

/** Publish a draft app to the public marketplace (owner-only; read-only-locks it). */
export async function publishApp(id: string): Promise<PageEntry | null> {
  return api.post<PageEntry>("/api/marketplace/publish", { pageId: id }, getActivePageJwt() ?? undefined).catch(() => null);
}

/** Fetch one app record + its child sub-pages (Details/Features/Changelog/…). */
export function useMarketplaceApp(appId: string | null): { app: PageEntry | null; children: PageEntry[]; loading: boolean } {
  const [data, setData] = useState<AppDetail>({ app: null, children: [] });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!appId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clear stale app detail when the selection is cleared
      setData({ app: null, children: [] });
      return;
    }
    let alive = true;
    setLoading(true);
    api
      .get<AppDetail>(`/api/marketplace/apps/${appId}`, getActivePageJwt() ?? undefined)
      .then((res) => {
        if (alive) setData({ app: res?.app ?? null, children: Array.isArray(res?.children) ? res.children : [] });
      })
      .catch(() => {
        if (alive) setData({ app: null, children: [] });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [appId]);
  return { ...data, loading };
}
