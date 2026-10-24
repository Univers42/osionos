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
import { warningFrom, type ModerationWarning } from "@/shared/moderation/moderationWarning";
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

/**
 * The typed answer of a marketplace publish: published, warned about, or failed.
 * A warning is not an error: L0 asked the author first, and the app is still
 * private until the author answers.
 */
export type MarketplacePublishResult =
  | { ok: true; app: PageEntry }
  | { ok: false; warning: ModerationWarning }
  | { ok: false; message: string };

/**
 * Publish a draft app to the public marketplace (owner-only; read-only-locks it).
 *
 * `acknowledgeWarning` is the author saying "publish it anyway": without it the
 * bridge answers 409 and the app stays private.
 */
export async function publishApp(
  id: string,
  { acknowledgeWarning }: { acknowledgeWarning?: boolean } = {},
): Promise<MarketplacePublishResult> {
  try {
    const app = await api.post<PageEntry>(
      "/api/marketplace/publish",
      acknowledgeWarning ? { pageId: id, acknowledgeWarning: true } : { pageId: id },
      getActivePageJwt() ?? undefined,
    );
    return { ok: true, app };
  } catch (error) {
    const warning = warningFrom(error);
    if (warning) return { ok: false, warning };
    return { ok: false, message: error instanceof Error ? error.message : "The app could not be published." };
  }
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
