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
// Side effects: register the preset packs (composable — first non-null per
// table wins) BEFORE the first adapter loads state: agency investigation
// (board/map/timeline/feed/gallery/dashboard), pg-commerce (pipeline board,
// fulfillment timeline, revenue charts/dashboards) and mysql-ops +
// mongo-activity (calendars, feeds, workload charts, ratings).
import "./agencyViewPresets";
import "./commerceViewPresets";
import "./opsActivityViewPresets";
import "./gourmandViewPresets";

export { isLiveDatabaseId };

const liveAdapterCache = new Map<string, ObjectDatabaseAdapter>();

/** Adapter for a `baas:<dbId>:<table>` id; null when the id is not a
 *  well-formed live id (callers fall through to the other database modes). */
export function getLiveDatabaseAdapter(databaseId: string): ObjectDatabaseAdapter | null {
  const cached = liveAdapterCache.get(databaseId);
  if (cached) return cached;
  if (parseLiveDatabaseId(databaseId) === null) return null;
  const adapter = new LiveMountAdapter(databaseId);
  liveAdapterCache.set(databaseId, adapter);
  return adapter;
}
