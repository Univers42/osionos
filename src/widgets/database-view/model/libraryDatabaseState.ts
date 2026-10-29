/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   libraryDatabaseState.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

/**
 * Read-only adapter serving the Library database (libraryDatabaseModel.ts) from
 * the live stores: the active workspace's pages and templates, the viewer's
 * recents and favorites, the databases registered on this device, and the
 * workspace skills (fetched once per workspace). Records are real ids, so a row
 * opens the page or database it stands for. Record edits are discarded by a
 * reload; view edits (filters, sorts, new views) are kept.
 *
 * Caveat: views persist in this browser's localStorage, per user and workspace —
 * another device starts from the shipped views, and a deleted shipped view comes
 * back on reload. Upgrade path: a `library` section in the bridge's self-data views.
 * Caveat: the Database rows are the databases registered on this device
 * (useDatabaseStore), not every database the workspace holds.
 */

import type { ChangeEvent, NotionState, Page, PageQuery, PropertyType, SchemaProperty } from "@notion-db/object-database";
import { listWorkspaceSkills } from "@/features/ai/api/aiClient";
import { useUserStore } from "@/features/auth";
import { useDatabaseStore } from "@/store/useDatabaseStore";
import { useFavoritesStore } from "@/store/favorites/favoritesStore";
import { useWorkspaceMembersStore } from "@/store/settings/useWorkspaceMembersStore";
import { usePageStore } from "@/store/usePageStore";
import type { PersistableObjectDatabaseAdapter } from "./knownDatabaseState";
import {
  LIBRARY_DB_ID, libraryRecords, librarySchema, libraryViews, mergeLibraryViews,
  type LibrarySkill, type LibrarySources,
} from "./libraryDatabaseModel";

const skillsByWorkspace = new Map<string, readonly LibrarySkill[]>();

function viewsKey(): string | null {
  const users = useUserStore.getState();
  const workspaceId = users.activeWorkspace()?._id;
  return workspaceId ? `osionos:library:views:v1:${users.activeUserId ?? "anon"}:${workspaceId}` : null;
}

function readStoredViews(): unknown {
  const key = viewsKey();
  if (!key) return null;
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Only the views that differ from the shipped ones are written, so a later
 *  change to a shipped view still reaches a viewer who never touched it. */
function writeStoredViews(views: NotionState["views"]): void {
  const key = viewsKey();
  if (!key) return;
  const shipped = libraryViews();
  const own = Object.fromEntries(Object.entries(views).filter(([id, view]) =>
    view.databaseId === LIBRARY_DB_ID && JSON.stringify(view) !== JSON.stringify(shipped[id])));
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(own));
  } catch (error) {
    console.warn("[library] views not saved on this device", error);
  }
}

function ownerNames(workspaceId: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const member of useWorkspaceMembersStore.getState().data[workspaceId] ?? []) {
    if (member.name) names.set(member.userId, member.name);
  }
  for (const persona of useUserStore.getState().personas) {
    if (persona.id && persona.name) names.set(persona.id, persona.name);
  }
  return names;
}

function sources(workspaceId: string): LibrarySources {
  const pages = usePageStore.getState();
  return {
    pages: pages.pagesForWorkspace(workspaceId),
    recents: pages.recents.filter((recent) => recent.workspaceId === workspaceId),
    favoriteIds: useFavoritesStore.getState().pageIds,
    databases: useDatabaseStore.getState().created,
    skills: skillsByWorkspace.get(workspaceId) ?? [],
    ownerNames: ownerNames(workspaceId),
  };
}

const stripViews = (state: NotionState) => ({ databases: state.databases, pages: state.pages });

class LibraryDatabaseAdapter implements PersistableObjectDatabaseAdapter {
  private readonly subscribers = new Set<(event: ChangeEvent) => void>();
  private readonly skillRequests = new Set<string>();

  async loadState(): Promise<NotionState> { return this.state(); }

  async findPages(query: PageQuery): Promise<Page[]> {
    const pages = Object.values(this.state().pages);
    return typeof query.limit === "number" ? pages.slice(0, query.limit) : pages;
  }

  async getPage(id: string): Promise<Page | null> { return this.state().pages[id] ?? null; }

  // The rows are pages, databases and skills owned elsewhere: an in-table edit
  // is discarded by a reload, as in the other read-only adapters.
  async insertPage(databaseId: string, page: Omit<Page, "id">): Promise<Page> {
    this.emit({ type: "state-replaced" });
    return { ...page, id: `pending-${Date.now()}`, databaseId };
  }

  async patchPage(id: string): Promise<Page> {
    this.emit({ type: "state-replaced" });
    const found = this.state().pages[id];
    if (!found) throw new Error(`Library record ${id} not found`);
    return found;
  }

  async deletePage(): Promise<void> { this.emit({ type: "state-replaced" }); }
  async addProperty(_databaseId: string, _prop: SchemaProperty): Promise<void> { /* read-only schema */ }
  async removeProperty(): Promise<void> { /* read-only schema */ }
  async changePropertyType(_databaseId: string, _propertyId: string, _newType: PropertyType): Promise<void> { /* read-only schema */ }

  // Arrow: the host calls it detached. A view edit is the viewer's and is kept;
  // a record edit reloads. Comparing content, not identity, lets the reload settle.
  persistState = (next: NotionState, previous?: NotionState): void => {
    if (!previous) return;
    if (JSON.stringify(next.views) !== JSON.stringify(previous.views)) writeStoredViews(next.views);
    if (JSON.stringify(stripViews(next)) !== JSON.stringify(stripViews(previous))) this.emit({ type: "state-replaced" });
  };

  subscribe(callback: (event: ChangeEvent) => void): () => void {
    this.subscribers.add(callback);
    const reload = () => this.emit({ type: "state-replaced" });
    const offPages = usePageStore.subscribe((state, prev) => {
      if (state.pages !== prev.pages || state.recents !== prev.recents || state.pageRevisions !== prev.pageRevisions) reload();
    });
    const offUser = useUserStore.subscribe((state, prev) => {
      if (state.activeWorkspace()?._id !== prev.activeWorkspace()?._id) reload();
    });
    const offFavorites = useFavoritesStore.subscribe((state, prev) => { if (state.pageIds !== prev.pageIds) reload(); });
    const offDatabases = useDatabaseStore.subscribe((state, prev) => { if (state.created !== prev.created) reload(); });
    const offMembers = useWorkspaceMembersStore.subscribe((state, prev) => { if (state.data !== prev.data) reload(); });
    return () => {
      this.subscribers.delete(callback);
      offPages(); offUser(); offFavorites(); offDatabases(); offMembers();
    };
  }

  private state(): NotionState {
    const workspaceId = useUserStore.getState().activeWorkspace()?._id ?? "";
    if (workspaceId) this.requestSkills(workspaceId);
    return {
      databases: { [LIBRARY_DB_ID]: librarySchema() },
      pages: workspaceId ? libraryRecords(sources(workspaceId)) : {},
      views: mergeLibraryViews(readStoredViews()),
    };
  }

  /** Skills live on the AI service: fetched once per workspace, then a reload shows them. */
  private requestSkills(workspaceId: string): void {
    if (this.skillRequests.has(workspaceId)) return;
    this.skillRequests.add(workspaceId);
    listWorkspaceSkills(workspaceId)
      .then((skills) => {
        skillsByWorkspace.set(workspaceId, skills.map(({ id, name, updatedAt }) => ({ id, name, updatedAt })));
        this.emit({ type: "state-replaced" });
      })
      .catch((error: unknown) => console.warn("[library] workspace skills unavailable", error));
  }

  private emit(event: ChangeEvent): void {
    queueMicrotask(() => { for (const callback of this.subscribers) callback(event); });
  }
}

let cachedAdapter: LibraryDatabaseAdapter | null = null;

/** Cached singleton: every item of the active workspace as one database. */
export function getLibraryDatabaseAdapter(): PersistableObjectDatabaseAdapter {
  cachedAdapter ??= new LibraryDatabaseAdapter();
  return cachedAdapter;
}
