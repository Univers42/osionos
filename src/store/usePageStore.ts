/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePageStore.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 01:31:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";
import {
  loadRecents,
  saveRecents,
  loadPagesCache,
  savePagesCache,
  updatePageInState,
  applyBlockUpdate,
  applyBlockInsert,
  applyBlockDelete,
  applyBlockMove,
  applyBlockIndent,
  applyBlockOutdent,
  applyBlockTypeChange,
} from "./pageStore.helpers";
import {
  createSeedOfflinePages,
  createSeedOnlinePages,
  createFetchPages,
  createFetchPageContent,
  createAddPage,
  createDeletePage,
} from "./pageStore.actions";
import {
  debouncePersistContent,
  persistPageTitle,
  getActiveJwt,
  registerPageLookup,
} from "./pageStore.persistence";
import type { PageStore } from "@/entities/page";

// Re-export types so existing imports from this module still work
export type { PageEntry, ActivePageKind, ActivePage } from "@/entities/page";

/** Zustand store managing page tree, active page, recents, and block-level CRUD. */
const cachedPages = loadPagesCache();

export const usePageStore = create<PageStore>((set, get) => ({
  pages: cachedPages,
  activePage: null,
  recents: loadRecents(),
  loadingIds: new Set<string>(),
  seeded: false,

  seedOfflinePages: createSeedOfflinePages(set, get),
  seedOnlinePages: createSeedOnlinePages(set, get),
  fetchPages: createFetchPages(set, get),
  fetchPageContent: createFetchPageContent(set, get),
  addPage: createAddPage(set, get),
  deletePage: createDeletePage(set, get),

  openPage: (page) => {
    set((s) => {
      const recents = [
        page,
        ...s.recents.filter((r) => r.id !== page.id),
      ].slice(0, 10);
      saveRecents(recents);
      return { activePage: page, recents };
    });
    const jwt = getActiveJwt();
    if (jwt && page.kind === "page") {
      get().fetchPageContent(page.id, jwt);
    }
  },

  clearWorkspace: (workspaceId) => {
    set((s) => {
      const pages = { ...s.pages };
      delete pages[workspaceId];
      savePagesCache(pages);
      return { pages };
    });
  },

  updateBlock: (pageId, blockId, updates) => {
    set((s) => {
      const pages = updatePageInState(
        s.pages,
        pageId,
        applyBlockUpdate(blockId, updates),
      );
      savePagesCache(pages);
      return { pages };
    });
    debouncePersistContent(pageId);
  },

  insertBlock: (pageId, afterBlockId, block) => {
    set((s) => {
      const pages = updatePageInState(
        s.pages,
        pageId,
        applyBlockInsert(afterBlockId, block),
      );
      savePagesCache(pages);
      return { pages };
    });
    debouncePersistContent(pageId);
  },

  deleteBlock: (pageId, blockId) => {
    set((s) => {
      const pages = updatePageInState(
        s.pages,
        pageId,
        applyBlockDelete(blockId),
      );
      savePagesCache(pages);
      return { pages };
    });
    debouncePersistContent(pageId);
  },

  moveBlock: (pageId, blockId, targetIndex, parentBlockId = null) => {
    set((s) => {
      const pages = updatePageInState(
        s.pages,
        pageId,
        applyBlockMove(blockId, targetIndex, parentBlockId),
      );
      savePagesCache(pages);
      return { pages };
    });
    debouncePersistContent(pageId);
  },

  indentBlock: (pageId, blockId) => {
    set((s) => {
      const pages = updatePageInState(
        s.pages,
        pageId,
        applyBlockIndent(blockId),
      );
      savePagesCache(pages);
      return { pages };
    });
    debouncePersistContent(pageId);
  },

  outdentBlock: (pageId, blockId) => {
    set((s) => {
      const pages = updatePageInState(
        s.pages,
        pageId,
        applyBlockOutdent(blockId),
      );
      savePagesCache(pages);
      return { pages };
    });
    debouncePersistContent(pageId);
  },

  changeBlockType: (pageId, blockId, newType) => {
    set((s) => {
      const pages = updatePageInState(
        s.pages,
        pageId,
        applyBlockTypeChange(blockId, newType),
      );
      savePagesCache(pages);
      return { pages };
    });
    debouncePersistContent(pageId);
  },

  updatePageContent: (pageId, blocks) => {
    set((s) => {
      const pages = updatePageInState(s.pages, pageId, (page) => ({
        ...page,
        content: blocks,
      }));
      savePagesCache(pages);
      return { pages };
    });
    debouncePersistContent(pageId);
  },

  updatePageTitle: (pageId, title) => {
    set((s) => {
      const pages = updatePageInState(s.pages, pageId, (page) => ({
        ...page,
        title,
      }));
      savePagesCache(pages);
      return { pages };
    });
    persistPageTitle(pageId, title);
  },

  pagesForWorkspace: (workspaceId) => get().pages[workspaceId] ?? [],

  rootPages: (workspaceId) =>
    (get().pages[workspaceId] ?? []).filter(
      (p) => !p.parentPageId && !p.archivedAt,
    ),

  childPages: (parentId, workspaceId) =>
    (get().pages[workspaceId] ?? []).filter(
      (p) => p.parentPageId === parentId && !p.archivedAt,
    ),

  pageById: (pageId) => {
    const allPages = Object.values(get().pages).flat();
    return allPages.find((p) => p._id === pageId);
  },
}));

// Register store access for persistence layer (avoids circular imports)
registerPageLookup((pageId) => usePageStore.getState().pageById(pageId));
