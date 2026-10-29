/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   libraryViews.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 12:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Library's shipped views: the old Library tabs, one per scope, one per
 * category, with the workspace's curated views on top (libraryServerViews.ts). The
 * bridge refuses a curated record from anyone but the owner or an admin, and checks
 * its shape (scripts/bridge-library-views-shape.mjs); this merge checks it again.
 */

import type { ViewConfig } from "@notion-db/contract-types";
import type { NotionState } from "@notion-db/object-database";
import { LIB, LIBRARY_DB_ID, libraryOption, type LibraryCategory } from "./libraryDatabaseModel";

type ViewSeed = Pick<ViewConfig, "name" | "filters" | "sorts"> & Partial<Pick<ViewConfig, "filterConjunction" | "visibleProperties">>;

const COLUMNS = [LIB.name, LIB.category, LIB.scope, LIB.location, LIB.owner, LIB.edited];
const filter = (key: string, propertyId: string, operator: ViewConfig["filters"][number]["operator"], value: unknown = null) =>
  ({ id: `flt-lib-${key}`, propertyId, operator, value });
const newestFirst = (propertyId: string) => [{ id: `srt-${propertyId}`, propertyId, direction: "desc" as const }];
const equals = (key: string, propertyId: string, value: string): ViewSeed["filters"] =>
  [filter(key, propertyId, "equals", libraryOption(value))];
const categoryView = (id: string, name: string, category: LibraryCategory): [string, ViewSeed] =>
  [`v-library-${id}`, { name, filters: equals(id, LIB.category, category), sorts: newestFirst(LIB.edited) }];

/** In tab order. "All files" lists top-level items; a row's children open
 *  under it as sub-items, so the tree is the table's own. */
const VIEW_SEEDS: Array<[string, ViewSeed]> = [
  ["v-library-all", { name: "All files", filters: [filter("top", LIB.location, "is_empty")], sorts: newestFirst(LIB.edited) }],
  ["v-library-recents", {
    name: "Recents", filters: [filter("visited", LIB.visited, "is_not_empty")], sorts: newestFirst(LIB.visited),
    visibleProperties: [LIB.name, LIB.category, LIB.location, LIB.visited],
  }],
  ["v-library-favorites", { name: "Favorites", filters: [filter("favorite", LIB.favorite, "is_checked")], sorts: newestFirst(LIB.edited) }],
  ["v-library-shared", {
    name: "Shared", filterConjunction: "or", sorts: newestFirst(LIB.edited),
    filters: [...equals("shared", LIB.access, "Shared"), ...equals("public", LIB.access, "Public")],
  }],
  ["v-library-private", { name: "Private", filters: equals("private", LIB.access, "Private"), sorts: newestFirst(LIB.edited) }],
  ["v-library-user", { name: "User scope", filters: equals("user", LIB.scope, "User"), sorts: newestFirst(LIB.edited) }],
  ["v-library-workspace", { name: "Workspace scope", filters: equals("workspace", LIB.scope, "Workspace"), sorts: newestFirst(LIB.edited) }],
  categoryView("templates", "Templates", "Template"),
  categoryView("docs", "Docs", "Doc"),
  categoryView("rules", "Rules", "Rule"),
  categoryView("hooks", "Hooks", "Hook"),
  categoryView("skills", "Skills", "Skill"),
  categoryView("agents", "Agents", "Agent"),
  categoryView("commands", "Commands", "Command"),
];

export const LIBRARY_DEFAULT_VIEW = VIEW_SEEDS[0][0];

const AGENTS_VIEW = "v-library-agents";

/** `withAgents`: the workspace has agents on. Off, there is no Agents tab. */
export function libraryViews(withAgents: boolean): NotionState["views"] {
  const views: NotionState["views"] = {};
  for (const [id, seed] of VIEW_SEEDS) {
    if (id === AGENTS_VIEW && !withAgents) continue;
    views[id] = {
      id, databaseId: LIBRARY_DB_ID, type: "table", filterConjunction: "and", visibleProperties: COLUMNS, ...seed,
      // The Library page carries its own "Library" heading; the table title would repeat it.
      settings: { tableStyle: "minimal", showTitle: false, showPageIcon: true, wrapContent: false, openPagesIn: "side_peek" },
    };
  }
  return views;
}

const NOT_A_VIEW_ID = new Set(["__proto__", "constructor", "prototype"]);

/** The shipped views with the workspace's curated ones on top: an edited shipped view
 *  keeps the edit, an added view is appended, one bound elsewhere is dropped. */
export function mergeLibraryViews(stored: unknown, withAgents: boolean): NotionState["views"] {
  const views = libraryViews(withAgents);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return views;
  for (const [id, view] of Object.entries(stored as Record<string, unknown>)) {
    if (NOT_A_VIEW_ID.has(id) || !view || typeof view !== "object") continue;
    if (id === AGENTS_VIEW && !withAgents) continue;
    const candidate = view as ViewConfig;
    if (candidate.databaseId !== LIBRARY_DB_ID || typeof candidate.type !== "string") continue;
    views[id] = { ...candidate, id };
  }
  return views;
}

/** What a curator saves: only the views that differ from the shipped ones, so a later
 *  change to a shipped view still reaches a workspace that never touched it. */
export function curatedLibraryViews(views: NotionState["views"]): NotionState["views"] {
  const shipped = libraryViews(true);
  return Object.fromEntries(Object.entries(views).filter(([id, view]) =>
    view.databaseId === LIBRARY_DB_ID && JSON.stringify(view) !== JSON.stringify(shipped[id])));
}
