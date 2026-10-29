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
 * The views are the workspace's (libraryServerViews.ts): every member sees what its
 * owner and admins curated, and only they may change it — the bridge refuses anyone
 * else with 403. For a non-curator the schema arrives locked, the kit's store guard
 * drops a view edit, and nothing is sent.
 *
 * Caveat: a curated record holds the views that differ from the shipped ones, so a
 * shipped view an admin deleted comes back on reload.
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
import { libraryServerViews, saveLibraryViews } from "./libraryServerViews";
import { curatedLibraryViews, libraryViews, mergeLibraryViews } from "./libraryViews";

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

interface Viewer { workspaceId: string; access: PageAccessContext; canCurate: boolean }

/** Who is looking: none for a signed-out or workspace-less viewer, who gets an empty,
 *  locked Library and no request at all. A curator is one the bridge says curates AND
 *  whose session still says owner or admin, so a refresh that demotes relocks at once. */
function viewer(onChange: () => void): (Viewer & { stored: unknown }) | null {
  const workspace = useUserStore.getState().activeWorkspace();
  const access = getCurrentPageAccessContext();
  if (!workspace || !access) return null;
  const server = libraryServerViews(access.userId, workspace._id, onChange);
  const byRole = canCurateLibrary(workspace, access.userId, new Set(access.privateWorkspaceIds));
  return { workspaceId: workspace._id, access, canCurate: byRole && server?.canCurate === true, stored: server?.views ?? null };
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

  // Arrow: the host calls it detached. A curator's view edit is saved; a record edit
  // reloads. Comparing content, not identity, lets the reload settle.
  persistState = (next: NotionState, previous?: NotionState): void => {
    if (!previous) return;
    const current = viewer(this.reload);
    if (current?.canCurate && JSON.stringify(next.views) !== JSON.stringify(previous.views)) {
      saveLibraryViews(current.access.userId, current.workspaceId, curatedLibraryViews(next.views), this.reload);
    }
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
    const current = viewer(this.reload);
    if (!current) return EMPTY_STATE();
    const { workspaceId, access, canCurate, stored } = current;
    const remote = libraryRemote(access.userId, workspaceId, this.reload);
    return {
      databases: { [LIBRARY_DB_ID]: librarySchema(canCurate) },
      pages: libraryRecords(sources(workspaceId, access, remote)),
      views: mergeLibraryViews(stored, remote.agents !== null),
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
