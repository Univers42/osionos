/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   allDataSources.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*                                                +#+#+#+#+#+   +#+           */
/* ************************************************************************** */

/**
 * The account-wide data-source catalog: every database a view can bind to,
 * across the three families — live mounts (registry/env → tables via schema),
 * the workspace tables (osionos_pages as Folders/Files), and the local demo
 * databases from the known-state seed. Live tables and workspace tables are
 * flagged read-only: a view bound to them renders live data but its edits
 * only persist through their OWN host adapter, not a foreign one.
 */

import type { DataSourceDescriptor } from "@/shared/notion-database-sys/src/store/sources/dataSourceRegistry";
import { KNOWN_DATABASE_VIEWS } from "./databaseViewCatalog";
import { listLiveSources } from "./liveMountTables";
import { WS_FILES_DB_ID, WS_FOLDERS_DB_ID } from "./workspaceDatabaseConstants";

const WORKSPACE_SOURCES: DataSourceDescriptor[] = [
  { id: WS_FILES_DB_ID, name: "Files", group: "Workspace", readOnly: true },
  { id: WS_FOLDERS_DB_ID, name: "Folders", group: "Workspace", readOnly: true },
];

function knownSources(): DataSourceDescriptor[] {
  const seen = new Map<string, string>();
  for (const view of KNOWN_DATABASE_VIEWS) {
    if (!seen.has(view.databaseId)) seen.set(view.databaseId, view.databaseName);
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name, group: "Demo databases" }));
}

/** Full catalog (live mounts first — they are the "real data" path). */
export async function listAllDataSources(): Promise<DataSourceDescriptor[]> {
  const mounts = await listLiveSources();
  const live = mounts.flatMap(({ mount, tables }) => tables.map((table) => ({
    id: table.id,
    name: table.table,
    group: mount.name,
    engineBadge: mount.engine,
    columnCount: table.columnCount,
    readOnly: true,
  })));
  return [...live, ...WORKSPACE_SOURCES, ...knownSources()];
}
