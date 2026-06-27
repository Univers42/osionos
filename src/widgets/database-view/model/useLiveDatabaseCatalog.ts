/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useLiveDatabaseCatalog.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Account-wide live-database discovery for the sidebar navigator. "Connect them
 * all automatically" = this read-only catalog load on mount: the mounts are
 * already authorized to the tenant, so listing them IS the connection. Status
 * is split so the panel can debug an empty result — `unconfigured` (no bridge
 * URL → `VITE_API_URL` unset) vs `empty` (configured, but the registry returned
 * no mounts) vs per-mount `error` (one DSN failed, surfaced without sinking the
 * rest). Composes the existing 60s-cached `listLiveSources()`. Gated on the
 * app's own `API_BASE` (the proven bridge transport) — NOT the submodule's
 * separate `import.meta.env` read — so a Vite inlining quirk can't false-trip it.
 */

import { useCallback, useEffect, useState } from "react";

import { API_BASE } from "@/shared/api/client";
import { listLiveSources, type LiveSourceMount } from "./liveMountTables";

/** The bridge transport is configured iff the app has a base URL (VITE_API_URL). */
const BRIDGE_CONFIGURED = Boolean(API_BASE);

export type CatalogStatus = "loading" | "ready" | "empty" | "unconfigured" | "error";

export interface LiveDatabaseCatalog {
  status: CatalogStatus;
  mounts: LiveSourceMount[];
  error: string | null;
  reload: () => void;
}

/** Loads every registered live mount + its tables once on mount (and on reload). */
export function useLiveDatabaseCatalog(): LiveDatabaseCatalog {
  const [mounts, setMounts] = useState<LiveSourceMount[]>([]);
  const [status, setStatus] = useState<CatalogStatus>(() => (BRIDGE_CONFIGURED ? "loading" : "unconfigured"));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!BRIDGE_CONFIGURED) return; // status was initialised to "unconfigured"
    let alive = true;
    listLiveSources()
      .then((rows) => {
        if (!alive) return;
        setMounts(rows);
        setStatus(rows.length === 0 ? "empty" : "ready");
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        // A registry failure is an ERROR, not "empty" — surface it so we never
        // pretend the partial mock set is the real database list.
        setMounts([]);
        setError(cause instanceof Error ? cause.message : "Failed to load databases");
        setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [tick]);

  const reload = useCallback(() => {
    if (BRIDGE_CONFIGURED) setStatus("loading");
    setError(null);
    setTick((value) => value + 1);
  }, []);
  return { status, mounts, error, reload };
}
