/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceDatabaseState.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Live adapter exposing the existing osionos_pages records as two related
 * Notion tables (Folders + Files). It reads usePageStore (no copy), writes
 * back through persistState → the page store outbox → BaaS, and re-emits when
 * the live data or the folder filter changes. See the approved plan.
 */

import type { ChangeEvent, NotionState, Page, PageQuery, PropertyType, SchemaProperty } from "@notion-db/object-database";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import type { PersistableObjectDatabaseAdapter } from "./knownDatabaseState";
import { synthesizeWorkspaceState } from "./workspaceDatabaseLoad";
import { applyWorkspacePersist } from "./workspaceDatabaseWrites";
import { useWorkspaceNav } from "./workspaceNav";
import { FILE, WS_FILES_GALLERY_VIEW } from "./workspaceDatabaseConstants";

function liveWorkspaceState(): NotionState {
  const workspaceId = useUserStore.getState().activeWorkspace()?._id;
  const entries = workspaceId ? usePageStore.getState().pagesForWorkspace(workspaceId) : [];
  return applyFolderFilter(synthesizeWorkspaceState(entries));
}

function applyFolderFilter(state: NotionState): NotionState {
  const folderId = useWorkspaceNav.getState().activeFolderId;
  const gallery = state.views[WS_FILES_GALLERY_VIEW];
  if (!folderId || !gallery) return state;
  return {
    ...state,
    views: {
      ...state.views,
      [WS_FILES_GALLERY_VIEW]: {
        ...gallery,
        filters: [{ id: "flt-active-folder", propertyId: FILE.folder, operator: "contains", value: folderId }],
      },
    },
  };
}

class WorkspaceDatabaseAdapter implements PersistableObjectDatabaseAdapter {
  private readonly subscribers = new Set<(event: ChangeEvent) => void>();

  async loadState(): Promise<NotionState> {
    return liveWorkspaceState();
  }

  async findPages(query: PageQuery): Promise<Page[]> {
    const pages = Object.values(liveWorkspaceState().pages);
    const scoped = query.databaseId ? pages.filter((page) => page.databaseId === query.databaseId) : pages;
    return typeof query.limit === "number" ? scoped.slice(0, query.limit) : scoped;
  }

  async getPage(id: string): Promise<Page | null> {
    return liveWorkspaceState().pages[id] ?? null;
  }

  // The ObjectDatabase host persists in-view edits via persistState; the direct
  // CRUD methods are not on that path, so they delegate to a reload signal.
  async insertPage(databaseId: string, page: Omit<Page, "id">): Promise<Page> {
    this.emit({ type: "state-replaced" });
    return { ...page, id: `pending-${Date.now()}`, databaseId };
  }

  async patchPage(id: string): Promise<Page> {
    this.emit({ type: "state-replaced" });
    const found = liveWorkspaceState().pages[id];
    if (!found) throw new Error(`Workspace record ${id} not found`);
    return found;
  }

  async deletePage(): Promise<void> { this.emit({ type: "state-replaced" }); }
  async addProperty(_databaseId: string, _prop: SchemaProperty): Promise<void> { /* fixed schema */ }
  async removeProperty(): Promise<void> { /* fixed schema */ }
  async changePropertyType(_databaseId: string, _propertyId: string, _newType: PropertyType): Promise<void> { /* fixed schema */ }

  // Arrow property, not a method: the ObjectDatabase host EXTRACTS this function
  // and calls it detached (object_database.tsx useAdapterStatePersistence), so
  // `this` must be lexically bound or `this.emit` is undefined (crash loop).
  persistState = (next: NotionState, previous?: NotionState): void => {
    if (applyWorkspacePersist(next, previous)) this.emit({ type: "state-replaced" });
  };

  subscribe(callback: (event: ChangeEvent) => void): () => void {
    this.subscribers.add(callback);
    const offPages = usePageStore.subscribe((state, prev) => {
      if (state.pages !== prev.pages || state.pageRevisions !== prev.pageRevisions) this.emit({ type: "state-replaced" });
    });
    const offNav = useWorkspaceNav.subscribe((state, prev) => {
      if (state.activeFolderId !== prev.activeFolderId) this.emit({ type: "state-replaced" });
    });
    return () => { this.subscribers.delete(callback); offPages(); offNav(); };
  }

  private emit(event: ChangeEvent): void {
    queueMicrotask(() => { for (const callback of this.subscribers) callback(event); });
  }
}

let cachedAdapter: WorkspaceDatabaseAdapter | null = null;

/** Cached singleton live workspace-database adapter. */
export function getWorkspaceDatabaseAdapter(): PersistableObjectDatabaseAdapter {
  cachedAdapter ??= new WorkspaceDatabaseAdapter();
  return cachedAdapter;
}
