/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dataSourceProvider.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*                                                +#+#+#+#+#+   +#+           */
/* ************************************************************************** */

/**
 * Registers the osionos DataSourceProvider with notion-database-sys (side
 * effect on import — the database-view barrel pulls this in, so any surface
 * that can open a ViewSettingsPanel has the catalog). loadDatabase dispatches
 * on the database id exactly like DatabaseBlock: live mount → LiveMountAdapter
 * loadState (fresh schema + first rows), workspace ids → the synthesized
 * Folders/Files state, known ids → the known-state slice for that database.
 */

import type { NotionState } from "@notion-db/object-database";
import {
  registerDataSourceProvider,
  type LoadedDataSource,
} from "@/shared/notion-database-sys/src/store/sources/dataSourceRegistry";
import { registerCrossMountCatalog } from "@/shared/notion-database-sys/src/store/live/liveCrossMount";
import { listAllDataSources } from "./allDataSources";
import { listLiveSources } from "./liveMountTables";
import { getLiveDatabaseAdapter, isLiveDatabaseId } from "./liveDatabaseAdapter";
import { getKnownDatabaseAdapter } from "./knownDatabaseState";
import { getWorkspaceDatabaseAdapter } from "./workspaceDatabaseState";
import { WS_FILES_DB_ID, WS_FOLDERS_DB_ID } from "./workspaceDatabaseConstants";

function sliceForDatabase(state: NotionState, databaseId: string, readOnly: boolean): LoadedDataSource | null {
  const database = state.databases[databaseId];
  if (!database) return null;
  const pages = Object.fromEntries(
    Object.entries(state.pages).filter(([, page]) => page.databaseId === databaseId),
  );
  return { databases: { [databaseId]: database }, pages, readOnly };
}

async function loadDatabase(sourceId: string): Promise<LoadedDataSource | null> {
  if (isLiveDatabaseId(sourceId)) {
    const adapter = getLiveDatabaseAdapter(sourceId);
    if (!adapter) return null;
    const state = await adapter.loadState();
    // Referenced tables arrive schema-only alongside the main one — keep them
    // (relation cells resolve against them) and merge all loaded pages.
    return { databases: state.databases, pages: state.pages, readOnly: true };
  }
  if (sourceId === WS_FILES_DB_ID || sourceId === WS_FOLDERS_DB_ID) {
    const state = await getWorkspaceDatabaseAdapter().loadState();
    return sliceForDatabase(state, sourceId, true);
  }
  const known = await getKnownDatabaseAdapter().loadState();
  return sliceForDatabase(known, sourceId, false);
}

registerDataSourceProvider({
  listSources: listAllDataSources,
  loadDatabase,
});

// All the user's live mounts + their tables, so the live adapter can resolve a
// foreign key whose target table lives in ANOTHER mount (access-scoped by the
// bridge, so this only exposes mounts the user may read).
registerCrossMountCatalog(async () =>
  (await listLiveSources()).map((source) => ({
    dbId: source.mount.dbId,
    tables: source.tables.map((table) => table.table),
  })),
);
