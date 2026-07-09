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
import { useDatabaseStore } from "@/store/useDatabaseStore";
// .meta (pure view metadata) — NOT databaseViewCatalog, whose getDashboardMetrics
// path statically bundles the ~458KB seed JSON. allDataSources only needs the
// view registry to enumerate the demo databases.
import { KNOWN_DATABASE_VIEWS } from "./databaseViewCatalog.meta";
import { listLiveSources } from "./liveMountTables";
import { WS_FILES_DB_ID, WS_FOLDERS_DB_ID } from "./workspaceDatabaseConstants";

const WORKSPACE_SOURCES: DataSourceDescriptor[] = [
  { id: WS_FILES_DB_ID, name: "Files", group: "Workspace", readOnly: true },
  { id: WS_FOLDERS_DB_ID, name: "Folders", group: "Workspace", readOnly: true },
];

/** The databases the user actually created in-app (`db-<uuid>` object databases,
 *  now server-synced) — the "inner side" the picker was missing. They are the
 *  editable object-database path (no readOnly flag), distinct from the live
 *  engine mounts ("from outside") and the demo seeds. */
function userCreatedSources(): DataSourceDescriptor[] {
  return useDatabaseStore.getState().created.map((entry) => ({
    id: entry.id,
    name: entry.name?.trim() || "Untitled Database",
    group: "Your databases",
  }));
}

function knownSources(): DataSourceDescriptor[] {
  const seen = new Map<string, string>();
  for (const view of KNOWN_DATABASE_VIEWS) {
    if (!seen.has(view.databaseId)) seen.set(view.databaseId, view.databaseName);
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name, group: "Demo databases" }));
}

/** Full catalog: live engine mounts (the "real data" path, from outside), the
 *  user's own in-app databases, the workspace tables, then the demo seeds.
 *  De-duped by id (first wins) so a database never lists twice across families. */
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
  const all = [...live, ...userCreatedSources(), ...WORKSPACE_SOURCES, ...knownSources()];
  const byId = new Map<string, DataSourceDescriptor>();
  for (const source of all) if (!byId.has(source.id)) byId.set(source.id, source);
  return [...byId.values()];
}
