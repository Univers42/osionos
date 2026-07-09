/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   liveDatabaseAdapter.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/09 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/09 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Memoized factory for live-mount adapters (`baas:<dbId>:<table>` database
 * ids; reads + outbox-backed writes). One adapter instance per databaseId, so
 * the ObjectDatabase host gets a stable reference, the 60s schema cache in
 * liveMountClient is shared across re-renders, AND the host's duck-typed
 * persistState pickup sees the same write queue every mount.
 */

import type { ObjectDatabaseAdapter } from "@notion-db/object-database";
import { LiveMountAdapter } from "@/shared/notion-database-sys/src/store/live/liveMountAdapter";
import {
  isLiveDatabaseId,
  parseLiveDatabaseId,
} from "@/shared/notion-database-sys/src/store/live/liveTypes";
import { setLiveWriteNotifier } from "@/shared/notion-database-sys/src/store/live/liveNotice";
import { useToastStore } from "@/shared/ui/primitives/useToastStore";
import { useUserStore } from "@/features/auth/model/useUserStore";
// Side effects: register the preset packs (composable — first non-null per
// table wins) BEFORE the first adapter loads state: agency investigation
// (board/map/timeline/feed/gallery/dashboard), pg-commerce (pipeline board,
// fulfillment timeline, revenue charts/dashboards) and mysql-ops +
// mongo-activity (calendars, feeds, workload charts, ratings).
import "./agencyViewPresets";
import "./commerceViewPresets";
import "./opsActivityViewPresets";
import "./gourmandViewPresets";

// Surface live-write rejections to the user (the dbms host has no toast; see
// liveConflict). A non-owner/stale/denied cell write still reconciles silently
// to server truth, but now a toast explains why the edit did not persist.
setLiveWriteNotifier((notice) => {
  useToastStore.getState().push({
    kind: notice.resolution === "deleted" ? "error" : "warning",
    title: "Change not saved",
    description: notice.message,
  });
});

export { isLiveDatabaseId };

const liveAdapterCache = new Map<string, ObjectDatabaseAdapter>();

/**
 * Revisit cache: switching tabs unmounts the focused pane, so returning to an
 * already-loaded database re-ran `loadState()` (network + relation/cross-mount
 * rebuild) every time — a visible reload, painful on slow machines. Serve the
 * last snapshot instantly while it's fresh; the realtime subscription that
 * restarts on mount reconciles any drift. Busted on `persistState` so a user's
 * own edit is never re-shown from a pre-edit snapshot.
 */
const REVISIT_TTL_MS = 30_000;
const stateCache = new Map<string, { state: unknown; at: number }>();

function withRevisitCache(adapter: ObjectDatabaseAdapter, databaseId: string): ObjectDatabaseAdapter {
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      if (prop === "loadState") {
        return async () => {
          const hit = stateCache.get(databaseId);
          if (hit && Date.now() - hit.at < REVISIT_TTL_MS) return hit.state;
          const state = await (target.loadState as () => Promise<unknown>)();
          stateCache.set(databaseId, { state, at: Date.now() });
          return state;
        };
      }
      const value = Reflect.get(target, prop, receiver);
      if (prop === "persistState" && typeof value === "function") {
        return (...args: unknown[]) => {
          stateCache.delete(databaseId); // an edit landed — next revisit reloads server truth
          return value.apply(target, args);
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * A latched 401/403 (or an account switch) must not survive re-auth. Each
 * LiveMountAdapter remembers a permanent denial (`forbidden`) and lives in the
 * module-level cache for the whole SPA lifetime, so a genuine denial otherwise
 * poisons the mount until a HARD page reload. When the active app-session token
 * changes (login / logout / account switch / refresh), drop the memoized
 * adapters + snapshots: the next mount builds a fresh adapter (forbidden=null)
 * and re-attempts the load against the new session.
 */
let lastAuthToken = "";
try {
  lastAuthToken = useUserStore.getState().activePageJwt() ?? "";
  useUserStore.subscribe((state) => {
    const token = state.activePageJwt?.() ?? "";
    if (token === lastAuthToken) return;
    lastAuthToken = token;
    liveAdapterCache.clear();
    stateCache.clear();
  });
} catch {
  /* no store (SSR/test) — caches reset on module reload */
}

/** Adapter for a `baas:<dbId>:<table>` id; null when the id is not a
 *  well-formed live id (callers fall through to the other database modes). */
export function getLiveDatabaseAdapter(databaseId: string): ObjectDatabaseAdapter | null {
  const cached = liveAdapterCache.get(databaseId);
  if (cached) return cached;
  if (parseLiveDatabaseId(databaseId) === null) return null;
  const adapter = withRevisitCache(new LiveMountAdapter(databaseId), databaseId);
  liveAdapterCache.set(databaseId, adapter);
  return adapter;
}
