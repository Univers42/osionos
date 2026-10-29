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
 * The Library as one database: every item the viewer can reach is a file — a
 * page, a folder, a template, a database, a skill, an agent, a command — and
 * its kind is the Category column. Scope says where the item lives: User (the
 * viewer's own: their private workspace, or a page only they can see), Workspace
 * (shared with the workspace) or Built-in (shipped with osionos). Both columns
 * are derived from where the item is stored, never typed in, so they cannot
 * disagree with the storage they describe. The shipped views (libraryViews.ts)
 * filter on them. Pure: no store reads, so rows and views are tested in the
 * canvas suite.
 */

import type { DatabaseSchema, SelectOption } from "@notion-db/contract-types";
import type { Page } from "@notion-db/object-database";
import type { ActivePage, PageEntry } from "@/entities/page";
import type { Workspace } from "@/entities/user";
import { isWorkspaceOwner } from "@/features/settings/model/workspaceOwnership";
import { canReadPage, normalizeRole, type PageAccessContext } from "@/shared/lib/auth/pageAccess";
import { UNKNOWN_TIME } from "./readOnlyPersist";

export const LIBRARY_DB_ID = "workspace-library";

export const LIB = {
  name: "lib-name",
  category: "lib-category",
  scope: "lib-scope",
  location: "lib-location",
  access: "lib-access",
  owner: "lib-owner",
  edited: "lib-edited",
  visited: "lib-visited",
  favorite: "lib-favorite",
} as const;

// Appended, never reordered: an option's colour is its index.
export const LIBRARY_CATEGORIES = [
  "Page", "Folder", "Template", "Database", "Skill", "Agent", "Wiki", "App", "Code", "Home",
  "Command", "Rule", "Hook", "Doc",
] as const;
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];

/** The page property a page's Library kind is kept in, set by the Library "New" menu. */
export const LIBRARY_KIND_KEY = "library-kind";
export const LIBRARY_KINDS = ["Doc", "Rule", "Hook"] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];
/** What each kind is, said where one is made: Rule and Hook pages are notes, not
 *  something osionos runs or enforces. */
export const LIBRARY_KIND_NOTES: Record<LibraryKind, string> = {
  Doc: "A written page: a guide, a spec, a reference",
  Rule: "A note on how the team works. Nothing enforces it",
  Hook: "A note describing a hook. It runs nothing",
};

const ACCESS = ["Private", "Shared", "Public"] as const;
type LibraryAccess = (typeof ACCESS)[number];
const SCOPES = ["User", "Workspace", "Built-in"] as const;
type LibraryScope = (typeof SCOPES)[number];

const COLORS = ["default", "blue", "green", "orange", "purple", "pink", "brown", "yellow", "red", "gray"];
export const libraryOption = (value: string): string => `opt-${value.toLowerCase()}`;
const options = (values: readonly string[]): SelectOption[] =>
  values.map((value, index) => ({ id: libraryOption(value), value, color: COLORS[index % COLORS.length] }));

/** Row ids of items that are not pages: each kind gets a namespace of its own. */
export const SKILL_ROW_PREFIX = "skill:";
export const AGENT_ROW_PREFIX = "agent:";
export const COMMAND_ROW_PREFIX = "command:";

export interface LibrarySkill { id: string; name: string; updatedAt?: string }
export interface LibraryDatabase { id: string; name: string; createdAt: number }
export interface LibraryAgent { id: string; name: string; scope: "user" | "workspace" | "builtin" }
export interface LibraryCommand { name: string }

export interface LibrarySources {
  /** The active workspace's pages and the viewer's private workspace pages. */
  pages: readonly PageEntry[];
  recents: readonly ActivePage[];
  favoriteIds: readonly string[];
  databases: readonly LibraryDatabase[];
  skills: readonly LibrarySkill[];
  agents: readonly LibraryAgent[];
  commands: readonly LibraryCommand[];
  ownerNames: ReadonlyMap<string, string>;
  userId: string;
  privateWorkspaceIds: ReadonlySet<string>;
}

/** The owner or an admin of the workspace curates its Library views; a private
 *  workspace is its owner's, and carries no `role` (the bridge stamps one only
 *  from a membership row). Never settings.role: it holds the creator's. */
export function canCurateLibrary(
  workspace: Pick<Workspace, "_id" | "ownerId" | "role"> | null | undefined,
  userId: string,
  privateWorkspaceIds: ReadonlySet<string>,
): boolean {
  if (!workspace) return false;
  return privateWorkspaceIds.has(workspace._id) || isWorkspaceOwner(workspace, userId) || normalizeRole(workspace.role) === "admin";
}

/** The pages a Library lists from these workspaces: only those the viewer can still
 *  read. The page cache is filled additively, so a page whose access was revoked
 *  stays in it until a reload; the read check keeps it out of the Library. */
export function readableLibraryPages(
  pagesByWorkspace: Readonly<Record<string, readonly PageEntry[]>>,
  workspaceIds: readonly string[],
  context: PageAccessContext | null,
): PageEntry[] {
  return [...new Set(workspaceIds)].flatMap((id) => pagesByWorkspace[id] ?? []).filter((page) => canReadPage(page, context));
}

function kindOf(entry: PageEntry): LibraryKind | null {
  const value = entry.properties?.find((property) => property.key === LIBRARY_KIND_KEY)?.value;
  return LIBRARY_KINDS.find((kind) => kind === value) ?? null;
}

/** A page's kind: a template first (whatever its surface), then its Library kind, then its surface. */
export function libraryCategory(entry: PageEntry): LibraryCategory {
  if (entry.isTemplate) return "Template";
  const kind = kindOf(entry);
  if (kind) return kind;
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

function pageScope(entry: PageEntry, sources: LibrarySources): LibraryScope {
  if (sources.privateWorkspaceIds.has(entry.workspaceId)) return "User";
  const own = !!entry.ownerId && entry.ownerId.toLowerCase() === sources.userId.toLowerCase();
  return own && accessOf(entry) === "Private" ? "User" : "Workspace";
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

interface ItemRow { id: string; icon: string; at: string | null; name: string; category: LibraryCategory; scope: LibraryScope; access?: LibraryAccess }

/** A row for an item that is not a page: no parent, no owner, never a favorite. */
function itemRecord(row: ItemRow): Page {
  return record(row.id, row.icon, row.at, {
    [LIB.name]: row.name,
    [LIB.category]: libraryOption(row.category),
    [LIB.scope]: libraryOption(row.scope),
    [LIB.location]: "",
    ...(row.access ? { [LIB.access]: libraryOption(row.access) } : {}),
    [LIB.edited]: row.at,
    [LIB.favorite]: false,
  });
}

const AGENT_SCOPE = { user: "User", workspace: "Workspace", builtin: "Built-in" } as const;
const AGENT_ACCESS = { user: "Private", workspace: "Shared", builtin: undefined } as const;

/** Rows for the items that are not pages: databases, skills, agents, commands. */
function itemRecords(sources: LibrarySources): Page[] {
  const rows: ItemRow[] = [
    ...sources.databases.map((database): ItemRow => ({
      id: database.id, icon: "🗃️", at: isoOf(database.createdAt), name: database.name || "Untitled database",
      category: "Database", scope: "User",
    })),
    ...sources.skills.map((skill): ItemRow => ({
      id: `${SKILL_ROW_PREFIX}${skill.id}`, icon: "✨", at: isoOf(skill.updatedAt), name: skill.name,
      category: "Skill", scope: "Workspace", access: "Shared",
    })),
    ...sources.agents.map((agent): ItemRow => ({
      id: `${AGENT_ROW_PREFIX}${agent.id}`, icon: "🤖", at: null, name: agent.name,
      category: "Agent", scope: AGENT_SCOPE[agent.scope], access: AGENT_ACCESS[agent.scope],
    })),
    ...sources.commands.map((command): ItemRow => ({
      id: `${COMMAND_ROW_PREFIX}${command.name}`, icon: "⌨️", at: null, name: `/${command.name}`,
      category: "Command", scope: "Built-in",
    })),
  ];
  return rows.map(itemRecord);
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
      [LIB.category]: libraryOption(libraryCategory(page)),
      [LIB.scope]: libraryOption(pageScope(page, sources)),
      [LIB.location]: parent ? parent.title || "Untitled" : "",
      [LIB.access]: libraryOption(accessOf(page)),
      [LIB.owner]: owner ?? "",
      [LIB.edited]: isoOf(page.updatedAt),
      [LIB.visited]: isoOf(visited.get(page._id)),
      [LIB.favorite]: favorites.has(page._id),
    });
  }
  for (const item of itemRecords(sources)) out[item.id] = item;
  return out;
}

/** The host owns the locks: the database is locked for a viewer who cannot
 *  manage the Library, and nobody can lock or unlock it from its settings. */
export function librarySchema(canManage: boolean): DatabaseSchema {
  return {
    id: LIBRARY_DB_ID,
    name: "Workspace files",
    icon: "🗂️",
    description: "Every page, folder, template, database, skill, agent and command you can reach from this workspace.",
    titlePropertyId: LIB.name,
    locked: !canManage,
    locksManagedByHost: true,
    properties: {
      [LIB.name]: { id: LIB.name, name: "Name", type: "title" },
      [LIB.category]: { id: LIB.category, name: "Category", type: "select", options: options(LIBRARY_CATEGORIES) },
      [LIB.scope]: { id: LIB.scope, name: "Scope", type: "select", options: options(SCOPES) },
      [LIB.location]: { id: LIB.location, name: "Location", type: "text" },
      [LIB.access]: { id: LIB.access, name: "Access", type: "select", options: options(ACCESS) },
      [LIB.owner]: { id: LIB.owner, name: "Owner", type: "text" },
      [LIB.edited]: { id: LIB.edited, name: "Edited", type: "date" },
      [LIB.visited]: { id: LIB.visited, name: "Visited", type: "date" },
      [LIB.favorite]: { id: LIB.favorite, name: "Favorite", type: "checkbox" },
    },
  };
}

/** The pages directly under one page, for the table's sub-item rows. */
export function libraryChildren(pages: readonly PageEntry[], parentId: string): PageEntry[] {
  return pages.filter((page) => !page.archivedAt && page.parentPageId === parentId);
}
