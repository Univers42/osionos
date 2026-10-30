/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sysDataSources.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The app's one list of the six `sys:` sources: the caller's own pages, tasks, published
 * pages, connections, workspaces and sessions, shown as read-only databases. The bridge
 * owns which columns exist (`scripts/bridge-self-sources.mjs`); this file only says how a
 * column is displayed. The two lists share one fixture, `tests/fixtures/sys-sources.json`,
 * so the source ids cannot drift apart.
 *
 * Caveat: `columnTypes` is per source and may be partial. A column the bridge adds later
 * has no entry here and renders as text, which is wrong for a date or a flag until an
 * entry is added; it never invents or drops data.
 */

import type { KnownDatabaseViewType } from "./databaseViewCatalog.meta";
import { SYS_HOME_DASHBOARDS } from "./sysHomeDashboards";

export type SysColumnType =
  | "text" | "select" | "multi_select" | "number" | "checkbox" | "date"
  | "created_time" | "last_edited_time" | "url";

export const SYS_ID_PREFIX = "sys:";

export interface SysSource {
  id: string;
  source: string;
  label: string;
  icon: string;
  description: string;
  titleColumn: string;
  defaultViewId: string;
  /** Technical columns the default view hides; they stay in the schema. */
  hiddenColumns: string[];
  columnTypes: Record<string, SysColumnType>;
  /** Views shipped with the source beside the default table; only my-activity has one. */
  builtInViews?: SysBuiltInView[];
  /** The values a select column can hold, offered as options even before a row holds them. */
  columnOptions?: Record<string, readonly string[]>;
}

export interface SysBuiltInView {
  id: string;
  name: string;
  type: "chart" | "dashboard";
  settings: Record<string, unknown>;
  /** When set, the user may edit or remove this shipped view; their copy is saved under its own id. */
  editable?: true;
}

/** View ids the app owns for a source and that are never saved to or deleted from the bridge:
 *  the default table view and any non-editable built-in. Editable built-ins are
 *  deliberately excluded so a user's edit to one is saved under its own id. */
export const sysBuiltInViewIds = (entry: SysSource): string[] => [
  entry.defaultViewId,
  ...(entry.builtInViews ?? []).filter((view) => !view.editable).map((view) => view.id),
];

/** The ids of a source's editable built-in views, if any. */
export const sysEditableBuiltInViewIds = (entry: SysSource | null | undefined): string[] =>
  (entry?.builtInViews ?? []).filter((view) => view.editable === true).map((view) => view.id);

export const SYS_VIEW_TYPE: KnownDatabaseViewType = "table";

function source(entry: Omit<SysSource, "id" | "defaultViewId"> & { source: string }): SysSource {
  return { ...entry, id: `${SYS_ID_PREFIX}${entry.source}`, defaultViewId: `${entry.source}-default` };
}

export const SYS_SOURCES: SysSource[] = [
  source({
    source: "my-pages", label: "My pages", icon: "📄",
    description: "The pages you own, most recently edited first.",
    titleColumn: "title", hiddenColumns: ["id", "cover", "database_id", "parent_page_id"],
    columnTypes: {
      surface: "select", visibility: "select", created_at: "created_time",
      updated_at: "last_edited_time", archived_at: "date",
    },
    builtInViews: SYS_HOME_DASHBOARDS["my-pages"],
  }),
  source({
    source: "my-tasks", label: "My tasks", icon: "✅",
    description: "Every task from your pages, with its due date.",
    titleColumn: "content", hiddenColumns: ["page_id", "block_id", "workspace_id"],
    columnTypes: { checked: "checkbox", due_at: "date", updated_at: "last_edited_time" },
    builtInViews: SYS_HOME_DASHBOARDS["my-tasks"],
  }),
  source({
    source: "my-published", label: "Published pages", icon: "🌐",
    description: "The pages you made public, with their share token.",
    titleColumn: "title", hiddenColumns: ["page_id"],
    columnTypes: { published_at: "date" },
  }),
  source({
    source: "my-connections", label: "Connections", icon: "🤝",
    description: "The people you are connected with, one row per person.",
    titleColumn: "peer", hiddenColumns: ["id", "requester_id", "addressee_id"],
    columnTypes: {
      status: "select", source: "select", direction: "select",
      created_at: "created_time", responded_at: "date",
    },
    // osionos_connections.status CHECK (models/osionos-social-migration.sql).
    columnOptions: { status: ["pending", "accepted", "declined", "withdrawn", "blocked"] },
    builtInViews: SYS_HOME_DASHBOARDS["my-connections"],
  }),
  source({
    source: "my-followers", label: "Followers", icon: "👥",
    description: "The people who follow you.",
    titleColumn: "follower", hiddenColumns: ["follower_id"],
    columnTypes: { created_at: "created_time" },
  }),
  source({
    source: "my-workspaces", label: "My workspaces", icon: "🗂️",
    description: "The workspaces you belong to, with your role in each.",
    titleColumn: "name", hiddenColumns: ["workspace_id", "id"],
    columnTypes: { role: "select", created_at: "created_time", updated_at: "last_edited_time" },
    builtInViews: SYS_HOME_DASHBOARDS["my-workspaces"],
  }),
  source({
    source: "my-sessions", label: "My sessions", icon: "🔐",
    description: "The devices signed in to your account.",
    titleColumn: "label", hiddenColumns: ["id"],
    columnTypes: {
      created_at: "created_time", expires_at: "date", last_seen_at: "date",
      auth_method: "select", current: "checkbox",
    },
  }),
  source({
    source: "my-activity", label: "My activity", icon: "📈",
    description: "Your last 200 events, kept only while activity tracking is on.",
    titleColumn: "event", hiddenColumns: ["workspace_id"],
    columnTypes: { ts: "date", surface: "select", workspace_id: "text" },
    builtInViews: [{
      id: "my-activity-chart", name: "Events by type", type: "chart",
      settings: { chartType: "vertical_bar", xAxisProperty: "event", yAxisAggregation: "count" },
    }],
  }),
];

/** Only `sys:` + a shipped source id: an unknown `sys:x` falls through to today's behaviour. */
export function isSysDatabaseId(id?: string | null): boolean {
  return typeof id === "string" && SYS_SOURCES.some((entry) => entry.id === id);
}

export function sysSourceById(id: string): SysSource | undefined {
  return SYS_SOURCES.find((entry) => entry.id === id);
}
