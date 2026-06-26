/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   recentsDatabaseState.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Read-only live adapter exposing the active user's recently-visited pages as
 * one NDS database with a single horizontally-scrolling gallery (carousel).
 * It reads usePageStore.recents (no copy), resolves each to its PageEntry for
 * title/icon/cover, and re-emits when recents / pages / active workspace change.
 * Records keep the real page id, so the host's renderPage seam opens the page
 * exactly like WorkspaceDatabaseBlock. Mirrors workspaceDatabaseState.ts.
 *
 * ponytail: read-only adapter shell duplicated from templatesDatabaseState.ts;
 * extract a shared `createReadOnlyGalleryAdapter` if a third such surface lands.
 */

import type { ChangeEvent, NotionState, Page, PageQuery, PropertyType, SchemaProperty } from "@notion-db/object-database";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import type { PageEntry } from "@/entities/page";
import type { PersistableObjectDatabaseAdapter } from "./knownDatabaseState";
import { RECENTS_DB_ID, RECENTS_GALLERY_VIEW } from "./workspaceDatabaseConstants";

const RECENT_TITLE = "home-recent-title";

/** The active workspace's recently-visited pages, deduped, freshest first. */
function recentEntries(): PageEntry[] {
  const store = usePageStore.getState();
  const workspaceId = useUserStore.getState().activeWorkspace()?._id;
  if (!workspaceId) return [];
  const seen = new Set<string>();
  const out: PageEntry[] = [];
  for (const recent of store.recents) {
    if (recent.kind !== "page" || recent.workspaceId !== workspaceId || seen.has(recent.id)) continue;
    const entry = store.pageById(recent.id);
    if (!entry || entry.archivedAt) continue;
    seen.add(recent.id);
    out.push(entry);
  }
  return out;
}

/** osionos page → a minimal gallery card record (id === real page id). */
function entryToCard(entry: PageEntry): Page {
  const at = entry.updatedAt ?? new Date().toISOString();
  return {
    id: entry._id,
    databaseId: RECENTS_DB_ID,
    icon: entry.icon,
    cover: entry.cover,
    properties: { [RECENT_TITLE]: entry.title || "Untitled" },
    content: [],
    createdAt: at,
    updatedAt: at,
    createdBy: "You",
    lastEditedBy: "You",
    parentPageId: entry.parentPageId ?? undefined,
  };
}

/** One NotionState: the Recents database + its carousel gallery view. */
function recentsState(): NotionState {
  const pages: Record<string, Page> = {};
  for (const entry of recentEntries()) pages[entry._id] = entryToCard(entry);
  return {
    databases: {
      [RECENTS_DB_ID]: {
        id: RECENTS_DB_ID,
        name: "Recently visited",
        icon: "🕘",
        description: "The pages you opened most recently.",
        titlePropertyId: RECENT_TITLE,
        properties: { [RECENT_TITLE]: { id: RECENT_TITLE, name: "Name", type: "title" } },
      },
    },
    pages,
    views: {
      [RECENTS_GALLERY_VIEW]: {
        id: RECENTS_GALLERY_VIEW,
        databaseId: RECENTS_DB_ID,
        name: "Recently visited",
        type: "gallery",
        filters: [],
        filterConjunction: "and",
        sorts: [],
        visibleProperties: [],
        settings: {
          cardPreview: "page_cover", cardSize: "medium", galleryLayout: "carousel",
          showTitle: true, showPageIcon: true, fitMedia: true, openPagesIn: "side_peek",
        },
      },
    },
  };
}

class RecentsDatabaseAdapter implements PersistableObjectDatabaseAdapter {
  private readonly subscribers = new Set<(event: ChangeEvent) => void>();

  async loadState(): Promise<NotionState> { return recentsState(); }

  async findPages(query: PageQuery): Promise<Page[]> {
    const pages = Object.values(recentsState().pages);
    const scoped = query.databaseId ? pages.filter((page) => page.databaseId === query.databaseId) : pages;
    return typeof query.limit === "number" ? scoped.slice(0, query.limit) : scoped;
  }

  async getPage(id: string): Promise<Page | null> { return recentsState().pages[id] ?? null; }

  // Records are real osionos pages — CRUD is not the adapter's job. Signal a
  // reload instead of mutating, exactly like WorkspaceDatabaseAdapter.
  async insertPage(databaseId: string, page: Omit<Page, "id">): Promise<Page> {
    this.emit({ type: "state-replaced" });
    return { ...page, id: `pending-${Date.now()}`, databaseId };
  }

  async patchPage(id: string): Promise<Page> {
    this.emit({ type: "state-replaced" });
    const found = recentsState().pages[id];
    if (!found) throw new Error(`Recents record ${id} not found`);
    return found;
  }

  async deletePage(): Promise<void> { this.emit({ type: "state-replaced" }); }
  async addProperty(_databaseId: string, _prop: SchemaProperty): Promise<void> { /* read-only schema */ }
  async removeProperty(): Promise<void> { /* read-only schema */ }
  async changePropertyType(_databaseId: string, _propertyId: string, _newType: PropertyType): Promise<void> { /* read-only schema */ }

  // Arrow, not method: the ObjectDatabase host EXTRACTS this and calls it
  // detached, so `this` must be lexically bound. Read-only → just re-emit to
  // discard any in-view edit and reload the live state.
  persistState = (): void => { this.emit({ type: "state-replaced" }); };

  subscribe(callback: (event: ChangeEvent) => void): () => void {
    this.subscribers.add(callback);
    const offPages = usePageStore.subscribe((state, prev) => {
      if (state.recents !== prev.recents || state.pages !== prev.pages || state.pageRevisions !== prev.pageRevisions) {
        this.emit({ type: "state-replaced" });
      }
    });
    const offUser = useUserStore.subscribe((state, prev) => {
      if (state.activeWorkspace()?._id !== prev.activeWorkspace()?._id) this.emit({ type: "state-replaced" });
    });
    return () => { this.subscribers.delete(callback); offPages(); offUser(); };
  }

  private emit(event: ChangeEvent): void {
    queueMicrotask(() => { for (const callback of this.subscribers) callback(event); });
  }
}

let cachedAdapter: RecentsDatabaseAdapter | null = null;

/** Cached singleton read-only adapter: recently-visited pages as a carousel gallery. */
export function getRecentsDatabaseAdapter(): PersistableObjectDatabaseAdapter {
  cachedAdapter ??= new RecentsDatabaseAdapter();
  return cachedAdapter;
}
