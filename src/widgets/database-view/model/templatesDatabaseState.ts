/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   templatesDatabaseState.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Read-only live adapter exposing the active workspace's template pages
 * (isTemplate && !archivedAt) as one NDS database with a single carousel
 * gallery. Reads usePageStore.templatePages (no copy) and re-emits when pages
 * or the active workspace change. Records keep the real page id, so the host's
 * renderPage seam opens the template exactly like WorkspaceDatabaseBlock.
 * Mirrors workspaceDatabaseState.ts / recentsDatabaseState.ts.
 *
 * ponytail: read-only adapter shell duplicated from recentsDatabaseState.ts;
 * extract a shared `createReadOnlyGalleryAdapter` if a third such surface lands.
 */

import type { ChangeEvent, NotionState, Page, PageQuery, PropertyType, SchemaProperty } from "@notion-db/object-database";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import type { PageEntry } from "@/entities/page";
import type { PersistableObjectDatabaseAdapter } from "./knownDatabaseState";
import { TEMPLATES_DB_ID, TEMPLATES_GALLERY_VIEW } from "./workspaceDatabaseConstants";

const TEMPLATE_TITLE = "home-template-title";

/** The active workspace's template pages (isTemplate, not archived, readable). */
function templateEntries(): PageEntry[] {
  const workspaceId = useUserStore.getState().activeWorkspace()?._id;
  if (!workspaceId) return [];
  return usePageStore.getState().templatePages(workspaceId);
}

/** osionos template page → a minimal gallery card record (id === real page id). */
function entryToCard(entry: PageEntry): Page {
  const at = entry.updatedAt ?? new Date().toISOString();
  return {
    id: entry._id,
    databaseId: TEMPLATES_DB_ID,
    icon: entry.icon,
    cover: entry.cover,
    properties: { [TEMPLATE_TITLE]: entry.title || "Untitled template" },
    content: [],
    createdAt: at,
    updatedAt: at,
    createdBy: "You",
    lastEditedBy: "You",
    parentPageId: entry.parentPageId ?? undefined,
  };
}

/** One NotionState: the Templates database + its carousel gallery view. */
function templatesState(): NotionState {
  const pages: Record<string, Page> = {};
  for (const entry of templateEntries()) pages[entry._id] = entryToCard(entry);
  return {
    databases: {
      [TEMPLATES_DB_ID]: {
        id: TEMPLATES_DB_ID,
        name: "Templates",
        icon: "🧩",
        description: "Start a new page from one of your templates.",
        titlePropertyId: TEMPLATE_TITLE,
        properties: { [TEMPLATE_TITLE]: { id: TEMPLATE_TITLE, name: "Name", type: "title" } },
      },
    },
    pages,
    views: {
      [TEMPLATES_GALLERY_VIEW]: {
        id: TEMPLATES_GALLERY_VIEW,
        databaseId: TEMPLATES_DB_ID,
        name: "Templates",
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

class TemplatesDatabaseAdapter implements PersistableObjectDatabaseAdapter {
  private readonly subscribers = new Set<(event: ChangeEvent) => void>();

  async loadState(): Promise<NotionState> { return templatesState(); }

  async findPages(query: PageQuery): Promise<Page[]> {
    const pages = Object.values(templatesState().pages);
    const scoped = query.databaseId ? pages.filter((page) => page.databaseId === query.databaseId) : pages;
    return typeof query.limit === "number" ? scoped.slice(0, query.limit) : scoped;
  }

  async getPage(id: string): Promise<Page | null> { return templatesState().pages[id] ?? null; }

  // Records are real osionos template pages — CRUD is not the adapter's job.
  // Signal a reload instead of mutating, exactly like WorkspaceDatabaseAdapter.
  async insertPage(databaseId: string, page: Omit<Page, "id">): Promise<Page> {
    this.emit({ type: "state-replaced" });
    return { ...page, id: `pending-${Date.now()}`, databaseId };
  }

  async patchPage(id: string): Promise<Page> {
    this.emit({ type: "state-replaced" });
    const found = templatesState().pages[id];
    if (!found) throw new Error(`Templates record ${id} not found`);
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
      if (state.pages !== prev.pages || state.pageRevisions !== prev.pageRevisions) {
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

let cachedAdapter: TemplatesDatabaseAdapter | null = null;

/** Cached singleton read-only adapter: workspace templates as a carousel gallery. */
export function getTemplatesDatabaseAdapter(): PersistableObjectDatabaseAdapter {
  cachedAdapter ??= new TemplatesDatabaseAdapter();
  return cachedAdapter;
}
