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
 * the live stores: the pages of the active workspace and of the viewer's private
 * workspace that the viewer can still read, their recents and favorites, the
 * databases registered on this device, and the skills, agents and commands of
 * the AI service (libraryRemoteSources.ts). Records are real ids, so a row opens
 * the page or database it stands for. Record edits are discarded by a reload.
 * View edits are kept for a curator (owner or admin) and refused for anyone else:
 * the schema arrives locked, the kit's store guard drops the edit, and nothing is
 * written here.
 *
 * Caveat: a curator's views persist in this browser's localStorage, per user and
 * workspace — another device, and every other member, starts from the shipped
 * views, and a deleted shipped view comes back on reload. Upgrade path (L2): views
 * in the workspace settings, written through the owner/admin PATCH.
 * Caveat: the Database rows are the databases registered on this device
 * (useDatabaseStore), not every database the workspace holds.
 * Caveat: a locked view also refuses the kit's quieter writes (column widths,
 * calculations, timeline zoom, calendar mode, manual row order); for a member those
 * controls do nothing and do not say why.
 */

import type { ChangeEvent, NotionState, Page, PageQuery, PropertyType, SchemaProperty } from "@notion-db/object-database";
import { useUserStore } from "@/features/auth";
import { getCurrentPageAccessContext, type PageAccessContext } from "@/shared/lib/auth/pageAccess";
import { useDatabaseStore } from "@/store/useDatabaseStore";
import { useFavoritesStore } from "@/store/favorites/favoritesStore";
import { useWorkspaceMembersStore } from "@/store/settings/useWorkspaceMembersStore";
import { usePageStore } from "@/store/usePageStore";
import type { PersistableObjectDatabaseAdapter } from "./knownDatabaseState";
import {
  canCurateLibrary, LIBRARY_DB_ID, libraryRecords, librarySchema, readableLibraryPages, type LibrarySources,
} from "./libraryDatabaseModel";
import { libraryRemote, type LibraryRemote } from "./libraryRemoteSources";
import { libraryViews, mergeLibraryViews } from "./libraryViews";

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
 *  change to a shipped view still reaches a curator who never touched it. */
function writeStoredViews(views: NotionState["views"]): void {
  const key = viewsKey();
  if (!key) return;
  const shipped = libraryViews(true);
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

/** Who is looking: none for a signed-out or workspace-less viewer, who gets an empty,
 *  locked Library and no request at all. */
function viewer(): { workspaceId: string; access: PageAccessContext; canCurate: boolean } | null {
  const workspace = useUserStore.getState().activeWorkspace();
  const access = getCurrentPageAccessContext();
  if (!workspace || !access) return null;
  return { workspaceId: workspace._id, access, canCurate: canCurateLibrary(workspace, access.userId, new Set(access.privateWorkspaceIds)) };
}

function sources(workspaceId: string, access: PageAccessContext, remote: LibraryRemote): LibrarySources {
  const pages = usePageStore.getState();
  const workspaceIds = [workspaceId, ...access.privateWorkspaceIds];
  const listed = new Set(workspaceIds);
  return {
    pages: readableLibraryPages(pages.pages, workspaceIds, access),
    recents: pages.recents.filter((recent) => listed.has(recent.workspaceId)),
    favoriteIds: useFavoritesStore.getState().pageIds,
    databases: useDatabaseStore.getState().created,
    skills: remote.skills,
    agents: remote.agents ?? [],
    commands: remote.commands,
    ownerNames: ownerNames(workspaceId),
    userId: access.userId,
    privateWorkspaceIds: new Set(access.privateWorkspaceIds),
  };
}

const EMPTY_STATE = (): NotionState => ({ databases: { [LIBRARY_DB_ID]: librarySchema(false) }, pages: {}, views: libraryViews(false) });
const stripViews = (state: NotionState) => ({ databases: state.databases, pages: state.pages });

class LibraryDatabaseAdapter implements PersistableObjectDatabaseAdapter {
  private readonly subscribers = new Set<(event: ChangeEvent) => void>();

  async loadState(): Promise<NotionState> { return this.state(); }

  async findPages(query: PageQuery): Promise<Page[]> {
    const pages = Object.values(this.state().pages);
    return typeof query.limit === "number" ? pages.slice(0, query.limit) : pages;
  }

  async getPage(id: string): Promise<Page | null> { return this.state().pages[id] ?? null; }

  // The rows are pages, databases and AI items owned elsewhere: an in-table edit
  // is discarded by a reload, as in the other read-only adapters.
  async insertPage(databaseId: string, page: Omit<Page, "id">): Promise<Page> {
    this.reload();
    return { ...page, id: `pending-${Date.now()}`, databaseId };
  }

  async patchPage(id: string): Promise<Page> {
    this.reload();
    const found = this.state().pages[id];
    if (!found) throw new Error(`Library record ${id} not found`);
    return found;
  }

  async deletePage(): Promise<void> { this.reload(); }
  async addProperty(_databaseId: string, _prop: SchemaProperty): Promise<void> { /* read-only schema */ }
  async removeProperty(): Promise<void> { /* read-only schema */ }
  async changePropertyType(_databaseId: string, _propertyId: string, _newType: PropertyType): Promise<void> { /* read-only schema */ }

  // Arrow: the host calls it detached. A curator's view edit is kept; a record edit
  // reloads. Comparing content, not identity, lets the reload settle.
  persistState = (next: NotionState, previous?: NotionState): void => {
    if (!previous) return;
    if (viewer()?.canCurate && JSON.stringify(next.views) !== JSON.stringify(previous.views)) writeStoredViews(next.views);
    if (JSON.stringify(stripViews(next)) !== JSON.stringify(stripViews(previous))) this.reload();
  };

  subscribe(callback: (event: ChangeEvent) => void): () => void {
    this.subscribers.add(callback);
    const reload = this.reload;
    const offPages = usePageStore.subscribe((state, prev) => {
      if (state.pages !== prev.pages || state.recents !== prev.recents || state.pageRevisions !== prev.pageRevisions) reload();
    });
    // Sessions carry the workspace role: a refresh that demotes an admin relocks at once.
    const offUser = useUserStore.subscribe((state, prev) => {
      if (state.sessions !== prev.sessions || state.activeUserId !== prev.activeUserId
        || state.activeWorkspaceByUser !== prev.activeWorkspaceByUser) reload();
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
    const current = viewer();
    if (!current) return EMPTY_STATE();
    const { workspaceId, access, canCurate } = current;
    const remote = libraryRemote(access.userId, workspaceId, this.reload);
    const viewAccess = { canCurate, withAgents: remote.agents !== null };
    return {
      databases: { [LIBRARY_DB_ID]: librarySchema(canCurate) },
      pages: libraryRecords(sources(workspaceId, access, remote)),
      views: mergeLibraryViews(canCurate ? readStoredViews() : null, viewAccess),
    };
  }

  private readonly reload = (): void => {
    queueMicrotask(() => { for (const callback of this.subscribers) callback({ type: "state-replaced" }); });
  };
}

let cachedAdapter: LibraryDatabaseAdapter | null = null;

/** Cached singleton: every item the viewer can reach from the active workspace, as one database. */
export function getLibraryDatabaseAdapter(): PersistableObjectDatabaseAdapter {
  cachedAdapter ??= new LibraryDatabaseAdapter();
  return cachedAdapter;
}
