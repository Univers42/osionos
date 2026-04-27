/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePageStore.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: vjan-nie <vjan-nie@student.42madrid.com    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/19 20:10:34 by vjan-nie         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";
import {
  loadRecents,
  saveRecents,
  loadPagesCache,
  savePagesCache,
  schedulePagesCachePersist,
  updatePageInState,
  applyBlockUpdate,
  applyBlockInsert,
  applyBlockDelete,
  applyBlockMove,
  applyBlockMoveAcrossTree,
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
  createArchivePage,
  createDeletePage,
  createRestorePage,
  createPermanentlyDeletePage,
  createDuplicatePage,
  createMovePage,
} from "./pageStore.actions";
import {
  debouncePersistContent,
  persistPageTitle,
  getActiveJwt,
  registerPageLookup,
} from "./pageStore.persistence";
import type { PageStore, ActivePage } from "@/entities/page";
import {
  canEditPage,
  canReadPage,
  getCurrentPageAccessContext,
} from "@/shared/lib/auth/pageAccess";

// Re-export types so existing imports from this module still work
export type { PageEntry, ActivePageKind, ActivePage } from "@/entities/page";

/** Zustand store managing page tree, active page, recents, and block-level CRUD. */
const cachedPages = loadPagesCache();

/**
 * Builds the navigation path for breadcrumb tracking.
 * If page exists in path, truncates to that point (stack behavior).
 * Otherwise, appends the page to the path.
 */
function buildNavigationPath(
  currentPath: ActivePage[],
  page: ActivePage,
): ActivePage[] {
  if (page.kind !== "page") {
    return [];
  }
  const existingIndex = currentPath.findIndex((p) => p.id === page.id);
  if (existingIndex >= 0) {
    return currentPath.slice(0, existingIndex + 1);
  }
  return [...currentPath, page];
}

export const usePageStore = create<PageStore>((set, get) => ({
  pages: cachedPages,
  activePage: null,
  navigationPath: [],
  recents: loadRecents(),
  loadingIds: new Set<string>(),
  seeded: false,
  showTrash: false,

  seedOfflinePages: createSeedOfflinePages(set, get),
  seedOnlinePages: createSeedOnlinePages(set, get),
  fetchPages: createFetchPages(set, get),
  fetchPageContent: createFetchPageContent(set, get),
  addPage: createAddPage(set, get),
  duplicatePage: createDuplicatePage(set, get),
  movePage: createMovePage(set, get),
  archivePage: createArchivePage(set, get),
  deletePage: createDeletePage(set, get),
  restorePage: createRestorePage(set, get),
  permanentlyDeletePage: createPermanentlyDeletePage(set, get),

  openPage: (page) => {
    const context = getCurrentPageAccessContext();
    const currentPage = get().pageById(page.id);
    if (
      page.kind === "page" &&
      (!currentPage || !canReadPage(currentPage, context))
    ) {
      set({ activePage: null, showTrash: false, navigationPath: [] });
      return;
    }

    set((s) => {
      const recents = [
        page,
        ...s.recents.filter((r) => r.id !== page.id),
      ].slice(0, 10);
      saveRecents(recents);

      const newPath = buildNavigationPath(s.navigationPath, page);

      return {
        activePage: page,
        recents,
        showTrash: false,
        navigationPath: newPath,
      };
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

  setShowTrash: (show) => {
    set({ showTrash: show });
  },

  updateBlock: (pageId, blockId, updates) => {
    const page = get().pageById(pageId);
    if (!page || !canEditPage(page, getCurrentPageAccessContext())) return;

    set((s) => {
      const pages = updatePageInState(
        s.pages,
        pageId,
        applyBlockUpdate(blockId, updates),
      );
      schedulePagesCachePersist(pages);
      return { pages };
    });
    debouncePersistContent(pageId);
  },

  insertBlock: (pageId, afterBlockId, block) => {
    const page = get().pageById(pageId);
    if (!page || !canEditPage(page, getCurrentPageAccessContext())) return;

    set((s) => {
      const pages = updatePageInState(
        s.pages,
        pageId,
        applyBlockInsert(afterBlockId, block),
      );
      schedulePagesCachePersist(pages);
      return { pages };
    });
    debouncePersistContent(pageId);
  },

  deleteBlock: (pageId, blockId) => {
    const page = get().pageById(pageId);
    if (!page || !canEditPage(page, getCurrentPageAccessContext())) return;

    set((s) => {
      const pages = updatePageInState(
        s.pages,
        pageId,
        applyBlockDelete(blockId),
      );
      schedulePagesCachePersist(pages);
      return { pages };
    });
    debouncePersistContent(pageId);
  },

  moveBlock: (pageId, blockId, targetIndex, parentBlockId = null) => {
    const page = get().pageById(pageId);
    if (!page || !canEditPage(page, getCurrentPageAccessContext())) return;

    set((s) => {
      const pages = updatePageInState(
        s.pages,
        pageId,
        applyBlockMove(blockId, targetIndex, parentBlockId),
      );
      schedulePagesCachePersist(pages);
      return { pages };
    });
    debouncePersistContent(pageId);
  },

  moveBlockAcrossTree: (pageId, blockId, targetParentBlockId, targetIndex) => {
    const page = get().pageById(pageId);
    if (!page || !canEditPage(page, getCurrentPageAccessContext())) return;

    set((s) => {
      const pages = updatePageInState(
        s.pages,
        pageId,
        applyBlockMoveAcrossTree(blockId, targetParentBlockId, targetIndex),
      );
      savePagesCache(pages);
      return { pages };
    });
    debouncePersistContent(pageId);
  },

  indentBlock: (pageId, blockId) => {
    const page = get().pageById(pageId);
    if (!page || !canEditPage(page, getCurrentPageAccessContext())) return;

    set((s) => {
      const pages = updatePageInState(
        s.pages,
        pageId,
        applyBlockIndent(blockId),
      );
      schedulePagesCachePersist(pages);
      return { pages };
    });
    debouncePersistContent(pageId);
  },

  outdentBlock: (pageId, blockId) => {
    const page = get().pageById(pageId);
    if (!page || !canEditPage(page, getCurrentPageAccessContext())) return;

    set((s) => {
      const pages = updatePageInState(
        s.pages,
        pageId,
        applyBlockOutdent(blockId),
      );
      schedulePagesCachePersist(pages);
      return { pages };
    });
    debouncePersistContent(pageId);
  },

  changeBlockType: (pageId, blockId, newType) => {
    const page = get().pageById(pageId);
    if (!page || !canEditPage(page, getCurrentPageAccessContext())) return;

    set((s) => {
      const pages = updatePageInState(
        s.pages,
        pageId,
        applyBlockTypeChange(blockId, newType),
      );
      schedulePagesCachePersist(pages);
      return { pages };
    });
    debouncePersistContent(pageId);
  },

  updatePageContent: (pageId, blocks) => {
    const page = get().pageById(pageId);
    if (!page || !canEditPage(page, getCurrentPageAccessContext())) return;

    set((s) => {
      const pages = updatePageInState(s.pages, pageId, (page) => ({
        ...page,
        content: blocks,
      }));
      schedulePagesCachePersist(pages);
      return { pages };
    });
    debouncePersistContent(pageId);
  },

  updatePageTitle: (pageId, title) => {
    const page = get().pageById(pageId);
    if (!page || !canEditPage(page, getCurrentPageAccessContext())) return;

    set((s) => {
      const pages = updatePageInState(s.pages, pageId, (page) => ({
        ...page,
        title,
      }));
      schedulePagesCachePersist(pages);
      return { pages };
    });
    persistPageTitle(pageId, title);
  },

  pagesForWorkspace: (workspaceId) => get().pages[workspaceId] ?? [],

  rootPages: (workspaceId) =>
    (get().pages[workspaceId] ?? []).filter(
      (p) =>
        !p.parentPageId &&
        !p.archivedAt &&
        canReadPage(p, getCurrentPageAccessContext()),
    ),

  childPages: (parentId, workspaceId) =>
    (get().pages[workspaceId] ?? []).filter(
      (p) =>
        p.parentPageId === parentId &&
        !p.archivedAt &&
        canReadPage(p, getCurrentPageAccessContext()),
    ),

  archivedPages: (workspaceId) =>
    (get().pages[workspaceId] ?? []).filter(
      (p) => p.archivedAt && canReadPage(p, getCurrentPageAccessContext()),
    ),

  pageById: (pageId) => {
    const allPages = Object.values(get().pages).flat();
    const page = allPages.find((p) => p._id === pageId);
    if (!page) return undefined;
    return canReadPage(page, getCurrentPageAccessContext()) ? page : undefined;
  },
}));

// Register store access for persistence layer (avoids circular imports)
registerPageLookup((pageId) => usePageStore.getState().pageById(pageId));
