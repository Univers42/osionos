/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   objectDatabaseBridgeRequests.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The bridge requests of the object-database sync: list the account's databases and push one.
// Owner scoping is enforced server-side from the session token.

import { LIVE_VIEWS_KEY_PREFIX } from "@/shared/notion-database-sys/src/store/live/liveViewSync";
import type { NotionState } from "@notion-db/object-database";
import { api } from "@/shared/api/client";
import { OBJECT_DB_WRITER_ID } from "./objectDatabaseRealtime";
import { databaseWorkspace, rememberDatabaseWorkspace } from "./objectDatabaseWorkspaces";

export type ServerObjectDatabase = { dbKey: string; title?: string; state?: NotionState; workspaceId?: string | null };
type ServerListResponse = { databases?: ServerObjectDatabase[] };

export function databaseTitle(state: NotionState, dbKey: string): string {
  const database = state.databases[dbKey] as { name?: string; title?: string } | undefined;
  return String(database?.name ?? database?.title ?? "Untitled").slice(0, 200) || "Untitled";
}

/** The server's copy of one database (the bridge answers `{}` for a row it
 *  never got a state for). */
export function serverStateOf(row: ServerObjectDatabase): NotionState {
  return row.state ?? ({ databases: {}, pages: {}, views: {} } as NotionState);
}

export async function fetchServerDatabases(jwt: string): Promise<Map<string, ServerObjectDatabase>> {
  const response = await api.get<ServerListResponse>("/api/object-databases", jwt);
  const map = new Map<string, ServerObjectDatabase>();
  for (const row of response.databases ?? []) {
    if (!row?.dbKey || row.dbKey.startsWith(LIVE_VIEWS_KEY_PREFIX)) continue;
    map.set(row.dbKey, row);
    // The bridge returns the workspace; remember it before any push can happen.
    rememberDatabaseWorkspace(row.dbKey, row.workspaceId);
  }
  return map;
}

/** `origin` is this tab's id: the bridge echoes it so the tab skips its own nudge. */
export type ObjectDatabasePushBody = { dbKey: string; title: string; state: NotionState; origin: string; workspaceId?: string };

/** The exact body of a push. Exported so the test can prove the workspace
 *  comes from the database's map, not from the active workspace. */
export function objectDatabasePushBody(
  dbKey: string,
  title: string,
  slice: NotionState,
  workspaceId?: string,
): ObjectDatabasePushBody {
  return { dbKey, title, state: slice, origin: OBJECT_DB_WRITER_ID, ...(workspaceId ? { workspaceId } : {}) };
}

export async function pushDatabaseSlice(jwt: string, dbKey: string, title: string, slice: NotionState): Promise<void> {
  // C138 is per workspace: send the database's own workspace, never an active one.
  await api.post("/api/object-databases", objectDatabasePushBodyFor(dbKey, title, slice), jwt);
}

/** The body of a dirty-database push, workspace included from the map. */
export function objectDatabasePushBodyFor(
  dbKey: string,
  title: string,
  slice: NotionState,
): ObjectDatabasePushBody {
  return objectDatabasePushBody(dbKey, title, slice, databaseWorkspace(dbKey));
}
