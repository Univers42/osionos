/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   libraryDatabaseModel.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Library as one database: every item of the workspace is a file — a page,
 * a folder, a template, a database, a skill — and its kind is the Category
 * column. The shipped views are the old Library tabs (Recents, Favorites,
 * Shared, Private) plus one per category; a viewer filters, sorts and adds
 * views with the database's own controls. Pure: no store reads, so the rows
 * and views are tested in the canvas suite.
 */

import type { DatabaseSchema, SelectOption, ViewConfig } from "@notion-db/contract-types";
import type { NotionState, Page } from "@notion-db/object-database";
import type { ActivePage, PageEntry } from "@/entities/page";
import { UNKNOWN_TIME } from "./readOnlyPersist";

export const LIBRARY_DB_ID = "workspace-library";

export const LIB = {
  name: "lib-name",
  category: "lib-category",
  location: "lib-location",
  access: "lib-access",
  owner: "lib-owner",
  edited: "lib-edited",
  visited: "lib-visited",
  favorite: "lib-favorite",
} as const;

export const LIBRARY_CATEGORIES = [
  "Page", "Folder", "Template", "Database", "Skill", "Agent", "Wiki", "App", "Code", "Home",
] as const;
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];

const ACCESS = ["Private", "Shared", "Public"] as const;
type LibraryAccess = (typeof ACCESS)[number];

const COLORS = ["default", "blue", "green", "orange", "purple", "pink", "brown", "yellow", "red", "gray"];
const optionId = (value: string): string => `opt-${value.toLowerCase()}`;
const options = (values: readonly string[]): SelectOption[] =>
  values.map((value, index) => ({ id: optionId(value), value, color: COLORS[index % COLORS.length] }));

/** A skill row's id: skills are not pages, so their ids get a namespace of their own. */
export const SKILL_ROW_PREFIX = "skill:";

export interface LibrarySkill { id: string; name: string; updatedAt?: string }
export interface LibraryDatabase { id: string; name: string; createdAt: number }

export interface LibrarySources {
  pages: readonly PageEntry[];
  recents: readonly ActivePage[];
  favoriteIds: readonly string[];
  databases: readonly LibraryDatabase[];
  skills: readonly LibrarySkill[];
  ownerNames: ReadonlyMap<string, string>;
}

/** A page's kind: a template first (whatever its surface), then its surface. */
export function libraryCategory(entry: PageEntry): LibraryCategory {
  if (entry.isTemplate) return "Template";
  switch (entry.surface) {
    case "folder": return "Folder";
    case "agent": return "Agent";
    case "wiki": return "Wiki";
    case "app": return "App";
    case "code": return "Code";
    case "home": return "Home";
    default: return "Page";
  }
}

function accessOf(entry: PageEntry): LibraryAccess {
  if (entry.visibility === "public") return "Public";
  if (entry.visibility === "shared" || (entry.collaborators?.length ?? 0) > 0) return "Shared";
  return "Private";
}

const isoOf = (value: number | string | undefined): string | null => {
  if (value === undefined || value === 0) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

function record(id: string, icon: string | undefined, at: string | null, properties: Page["properties"]): Page {
  return {
    id, databaseId: LIBRARY_DB_ID, icon, properties, content: [],
    createdAt: at ?? UNKNOWN_TIME, updatedAt: at ?? UNKNOWN_TIME, createdBy: "", lastEditedBy: "",
  };
}

/** Every Library row, keyed by id: pages keep their real page id, so opening one opens the page. */
export function libraryRecords(sources: LibrarySources): Record<string, Page> {
  const live = sources.pages.filter((page) => !page.archivedAt);
  const byId = new Map(live.map((page) => [page._id, page]));
  const visited = new Map<string, number>();
  for (const recent of sources.recents) if (!visited.has(recent.id)) visited.set(recent.id, recent.visitedAt ?? 0);
  const favorites = new Set(sources.favoriteIds);
  const out: Record<string, Page> = {};

  for (const page of live) {
    const parent = page.parentPageId ? byId.get(page.parentPageId) : undefined;
    const owner = page.ownerId ? sources.ownerNames.get(page.ownerId) ?? sources.ownerNames.get(page.ownerId.toLowerCase()) : undefined;
    out[page._id] = record(page._id, page.icon, isoOf(page.updatedAt), {
      [LIB.name]: page.title || "Untitled",
      [LIB.category]: optionId(libraryCategory(page)),
      [LIB.location]: parent ? parent.title || "Untitled" : "",
      [LIB.access]: optionId(accessOf(page)),
      [LIB.owner]: owner ?? "",
      [LIB.edited]: isoOf(page.updatedAt),
      [LIB.visited]: isoOf(visited.get(page._id)),
      [LIB.favorite]: favorites.has(page._id),
    });
  }
  for (const database of sources.databases) {
    const at = isoOf(database.createdAt);
    out[database.id] = record(database.id, "🗃️", at, {
      [LIB.name]: database.name || "Untitled database",
      [LIB.category]: optionId("Database"),
      [LIB.location]: "",
      [LIB.edited]: at,
      [LIB.favorite]: false,
    });
  }
  for (const skill of sources.skills) {
    const at = isoOf(skill.updatedAt);
    out[`${SKILL_ROW_PREFIX}${skill.id}`] = record(`${SKILL_ROW_PREFIX}${skill.id}`, "✨", at, {
      [LIB.name]: skill.name,
      [LIB.category]: optionId("Skill"),
      [LIB.location]: "",
      [LIB.access]: optionId("Shared"),
      [LIB.edited]: at,
      [LIB.favorite]: false,
    });
  }
  return out;
}

export function librarySchema(): DatabaseSchema {
  return {
    id: LIBRARY_DB_ID,
    name: "Workspace files",
    icon: "🗂️",
    description: "Every page, folder, template, database and skill of this workspace.",
    titlePropertyId: LIB.name,
    properties: {
      [LIB.name]: { id: LIB.name, name: "Name", type: "title" },
      [LIB.category]: { id: LIB.category, name: "Category", type: "select", options: options(LIBRARY_CATEGORIES) },
      [LIB.location]: { id: LIB.location, name: "Location", type: "text" },
      [LIB.access]: { id: LIB.access, name: "Access", type: "select", options: options(ACCESS) },
      [LIB.owner]: { id: LIB.owner, name: "Owner", type: "text" },
      [LIB.edited]: { id: LIB.edited, name: "Edited", type: "date" },
      [LIB.visited]: { id: LIB.visited, name: "Visited", type: "date" },
      [LIB.favorite]: { id: LIB.favorite, name: "Favorite", type: "checkbox" },
    },
  };
}

type ViewSeed = Pick<ViewConfig, "name" | "filters" | "sorts"> & Partial<Pick<ViewConfig, "filterConjunction" | "visibleProperties">>;

const COLUMNS = [LIB.name, LIB.category, LIB.location, LIB.owner, LIB.edited];
const filter = (key: string, propertyId: string, operator: ViewConfig["filters"][number]["operator"], value: unknown = null) =>
  ({ id: `flt-lib-${key}`, propertyId, operator, value });
const newestFirst = (propertyId: string) => [{ id: `srt-${propertyId}`, propertyId, direction: "desc" as const }];

/** The shipped views, in tab order. "All files" lists top-level items; a row's
 *  children open under it as sub-items, so the tree is the table's own. */
const VIEW_SEEDS: Array<[string, ViewSeed]> = [
  ["v-library-all", { name: "All files", filters: [filter("top", LIB.location, "is_empty")], sorts: newestFirst(LIB.edited) }],
  ["v-library-recents", {
    name: "Recents", filters: [filter("visited", LIB.visited, "is_not_empty")], sorts: newestFirst(LIB.visited),
    visibleProperties: [LIB.name, LIB.category, LIB.location, LIB.visited],
  }],
  ["v-library-favorites", { name: "Favorites", filters: [filter("favorite", LIB.favorite, "is_checked")], sorts: newestFirst(LIB.edited) }],
  ["v-library-shared", {
    name: "Shared", filterConjunction: "or", sorts: newestFirst(LIB.edited),
    filters: [filter("shared", LIB.access, "equals", optionId("Shared")), filter("public", LIB.access, "equals", optionId("Public"))],
  }],
  ["v-library-private", { name: "Private", filters: [filter("private", LIB.access, "equals", optionId("Private"))], sorts: newestFirst(LIB.edited) }],
  ["v-library-templates", { name: "Templates", filters: [filter("templates", LIB.category, "equals", optionId("Template"))], sorts: newestFirst(LIB.edited) }],
  ["v-library-skills", { name: "Skills", filters: [filter("skills", LIB.category, "equals", optionId("Skill"))], sorts: newestFirst(LIB.edited) }],
];

export const LIBRARY_DEFAULT_VIEW = VIEW_SEEDS[0][0];

export function libraryViews(): NotionState["views"] {
  const views: NotionState["views"] = {};
  for (const [id, seed] of VIEW_SEEDS) {
    views[id] = {
      id, databaseId: LIBRARY_DB_ID, type: "table", filterConjunction: "and", visibleProperties: COLUMNS, ...seed,
      // The Library page carries its own "Library" heading; the table title would repeat it.
      settings: { tableStyle: "minimal", showTitle: false, showPageIcon: true, wrapContent: false, openPagesIn: "side_peek" },
    };
  }
  return views;
}

/** The shipped views with the viewer's own on top: an edited shipped view keeps the
 *  edit, a view the viewer added is appended, one bound elsewhere is dropped. */
export function mergeLibraryViews(stored: unknown): NotionState["views"] {
  const views = libraryViews();
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return views;
  for (const [id, view] of Object.entries(stored as Record<string, unknown>)) {
    if (id === "__proto__" || !view || typeof view !== "object") continue;
    const candidate = view as ViewConfig;
    if (candidate.databaseId !== LIBRARY_DB_ID || typeof candidate.type !== "string") continue;
    views[id] = { ...candidate, id };
  }
  return views;
}

/** The pages directly under one page, for the table's sub-item rows. */
export function libraryChildren(pages: readonly PageEntry[], parentId: string): PageEntry[] {
  return pages.filter((page) => !page.archivedAt && page.parentPageId === parentId);
}
