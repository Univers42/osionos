/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   liveMountTables.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Data-source catalog for the picker: every registered live mount with the
 * tables its schema exposes. Composes the two existing cached fetchers
 * (listLiveMounts 60s, getLiveSchema 60s per mount) — a failing mount
 * degrades to an entry with an error instead of sinking the whole catalog,
 * so one dead DSN never hides the healthy sources.
 */

import { getLiveSchema } from "@/shared/notion-database-sys/src/store/live/liveMountClient";
import { formatLiveDatabaseId } from "@/shared/notion-database-sys/src/store/live/liveTypes";
import { listLiveMounts, type LiveMountInfo } from "./liveMountCatalog";

/** One pickable table under a mount (`id` is the block-ready `baas:` id). */
export interface LiveSourceTable {
  id: string;
  table: string;
  columnCount: number;
}

/** One mount with its tables (or the reason they could not be listed). */
export interface LiveSourceMount {
  mount: LiveMountInfo;
  tables: LiveSourceTable[];
  error?: string;
  /** false when the engine (dynamodb, …) can't introspect a schema — the db
   *  still lists, just with no enumerable tables (not an error). */
  introspectable?: boolean;
}

/** The full pickable catalog: mounts + tables, failures isolated per mount. */
export async function listLiveSources(): Promise<LiveSourceMount[]> {
  const mounts = await listLiveMounts();
  return Promise.all(mounts.map(async (mount) => {
    try {
      const schema = await getLiveSchema(mount.dbId);
      const introspectable = (schema.capabilities as { introspect?: unknown } | null)?.introspect !== false;
      const tables = schema.tables.map((table) => ({
        id: formatLiveDatabaseId({ dbId: mount.dbId, table: table.name }),
        table: table.name,
        columnCount: table.columns.length,
      }));
      return { mount, tables, introspectable };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { mount, tables: [], error: message };
    }
  }));
}
