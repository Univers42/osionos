/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePageStore.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/12 23:14:08 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import {
  loadRecents,
  saveRecents,
  addRecent,
  saveActivePage,
  loadPagesCache,
  derivePageState,
  savePagesCache,
  schedulePagesCachePersist,
  updatePageInState,
  withTimestamp,
  applyBlockUpdate,
  applyBlockInsert,
  applyBlockDelete,
  applyBlockMove,
  applyBlockMoveAcrossTree,
  pruneColumns,
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
  createAddDatabasePage,
  createArchivePage,
  createDeletePage,
  createRestorePage,
  createPermanentlyDeletePage,
  createDuplicatePage,
  createMovePage,
  createReorderSibling,
  createAddTemplate,
  createSetDefaultTemplate,
  createCreatePageFromTemplate,
  createPatchTemplateRecurrence,
} from "./pageStore.actions";
import {
  debouncePersistContent,
  persistPageTitle,
  getActivePageJwt,
  registerPageLookup,
} from "./pageStore.persistence";
import type { PageEntry, PageStore, ActivePage } from "@/entities/page";
import {
  canEditPage,
  canReadPage,
  getCurrentPageAccessContext,
} from "@/shared/lib/auth/pageAccess";
import { timed } from "@/shared/lib/perf/measure";

// Re-export types so existing imports from this module still work
export type { PageEntry, ActivePageKind, ActivePage } from "@/entities/page";

/** Zustand store managing page tree, active page, recents, and block-level CRUD. */
const cachedPages = loadPagesCache();
const cachedPageState = derivePageState(cachedPages);

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

function applyPageContentUpdate(blocks: NonNullable<PageEntry["content"]>) {
  return (page: PageEntry): PageEntry => ({
    ...page,
    content: pruneColumns(blocks),
  });
}

type PagePatch = Partial<PageEntry> | ((page: PageEntry) => Partial<PageEntry>);

function applyPagePatch(page: PageEntry, patch: PagePatch): PageEntry {
  const resolvedPatch = typeof patch === "function" ? patch(page) : patch;
  return {
    ...page,
    ...resolvedPatch,
  };
}

function patchPageInWorkspace(
  workspacePages: PageEntry[],
  pageId: string,
  patch: PagePatch,
): { changed: boolean; pages: PageEntry[] } {
  let changed = false;
  const pages = workspacePages.map((workspacePage) => {
    if (workspacePage._id !== pageId) return workspacePage;
    changed = true;
    return applyPagePatch(workspacePage, patch);
  });

  return { changed, pages };
}

function bumpPageRevision(
  pageRevisions: Record<string, number>,
  pageId: string,
): Record<string, number> {
  return {
    ...pageRevisions,
    [pageId]: (pageRevisions[pageId] ?? 0) + 1,
  };
}


/** Tabs snapshot titles/icons at open time — refresh them on every title/icon write.
 *  `patch` only carries the keys that were ACTUALLY part of the incoming page patch
 *  (checked via `in`, not `!== undefined`) — a title/icon can be legitimately cleared
 *  to `undefined` (e.g. "Remove icon"), which must still refresh the tab snapshot;
 *  comparing against `undefined` made a clear indistinguishable from "untouched" and
 *  left the tab (and the pane's `activePage` fallback derived from it) stuck on the
 *  stale icon forever. Dynamic import: the layout store is widget-side; a static
 *  import here would be a store ↔ widget module cycle at init. */
function notifyTabsOfPagePatch(pageId: string, patch: { title?: string; icon?: string }): void {
  if (!("title" in patch) && !("icon" in patch)) return;
  void import("@/widgets/workspace-grid/model/workspaceLayout")
    .then((m) => m.useWorkspaceLayout.getState().updateTabsForPage(pageId, patch))
    .catch(() => undefined);
}

export const usePageStore = create<PageStore>((set, get) => ({
  ...cachedPageState,
  pageRevisions: {},
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
  addDatabasePage: createAddDatabasePage(set, get),
  duplicatePage: createDuplicatePage(set, get),
  addTemplate: createAddTemplate(set, get),
  setDefaultTemplate: createSetDefaultTemplate(set, get),
  createPageFromTemplate: createCreatePageFromTemplate(set, get),
  patchTemplateRecurrence: createPatchTemplateRecurrence(set, get),
  movePage: createMovePage(set, get),
  reorderSibling: createReorderSibling(set),
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
      const recents = addRecent(s.recents, page);
      saveRecents(recents);

      const newPath = buildNavigationPath(s.navigationPath, page);

      return {
        activePage: page,
        recents,
        showTrash: false,
        navigationPath: newPath,
      };
    });
    const jwt = getActivePageJwt();
    if (jwt && page.kind === "page") {
      get().fetchPageContent(page.id, jwt);
    }
    // Reflect the opened page as a tab in the active pane (grid is the renderer).
    useWorkspaceLayout.getState().syncFromActivePage(page);
  },

  clearWorkspace: (workspaceId) => {
    set((s) => {
      const pages = { ...s.pages };
      delete pages[workspaceId];
      savePagesCache(pages, workspaceId);
      return derivePageState(pages, s.pageIdsByWorkspace);
    });
  },

  setShowTrash: (show) => {
    set({ showTrash: show });
  },

  updateBlock: (pageId, blockId, updates) => {
    timed("updateBlock", () => {
      const page = get().pageById(pageId);
      if (!page || !canEditPage(page, getCurrentPageAccessContext())) return;

      set((s) => {
        const pages = updatePageInState(
          s.pages,
          pageId,
          withTimestamp(applyBlockUpdate(blockId, updates)),
        );
        schedulePagesCachePersist(pages, page.workspaceId);
        return {
          ...derivePageState(pages, s.pageIdsByWorkspace),
          pageRevisions: bumpPageRevision(s.pageRevisions, pageId),
        };
      });
      debouncePersistContent(pageId);
    });
  },

  insertBlock: (pageId, afterBlockId, block) => {
    const page = get().pageById(pageId);
    if (!page || !canEditPage(page, getCurrentPageAccessContext())) return;

    set((s) => {
      const pages = updatePageInState(
        s.pages,
        pageId,
        withTimestamp(applyBlockInsert(afterBlockId, block)),
      );
      schedulePagesCachePersist(pages, page.workspaceId);
      return {
        ...derivePageState(pages, s.pageIdsByWorkspace),
        pageRevisions: bumpPageRevision(s.pageRevisions, pageId),
      };
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
        withTimestamp(applyBlockDelete(blockId)),
      );
      schedulePagesCachePersist(pages, page.workspaceId);
      return {
        ...derivePageState(pages, s.pageIdsByWorkspace),
        pageRevisions: bumpPageRevision(s.pageRevisions, pageId),
      };
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
        withTimestamp(applyBlockMove(blockId, targetIndex, parentBlockId)),
      );
      schedulePagesCachePersist(pages, page.workspaceId);
      return {
        ...derivePageState(pages, s.pageIdsByWorkspace),
        pageRevisions: bumpPageRevision(s.pageRevisions, pageId),
      };
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
        withTimestamp(
          applyBlockMoveAcrossTree(blockId, targetParentBlockId, targetIndex),
        ),
      );
      savePagesCache(pages, page.workspaceId);
      return {
        ...derivePageState(pages, s.pageIdsByWorkspace),
        pageRevisions: bumpPageRevision(s.pageRevisions, pageId),
      };
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
        withTimestamp(applyBlockIndent(blockId)),
      );
      schedulePagesCachePersist(pages, page.workspaceId);
      return {
        ...derivePageState(pages, s.pageIdsByWorkspace),
        pageRevisions: bumpPageRevision(s.pageRevisions, pageId),
      };
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
        withTimestamp(applyBlockOutdent(blockId)),
      );
      schedulePagesCachePersist(pages, page.workspaceId);
      return {
        ...derivePageState(pages, s.pageIdsByWorkspace),
        pageRevisions: bumpPageRevision(s.pageRevisions, pageId),
      };
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
        withTimestamp(applyBlockTypeChange(blockId, newType)),
      );
      schedulePagesCachePersist(pages, page.workspaceId);
      return {
        ...derivePageState(pages, s.pageIdsByWorkspace),
        pageRevisions: bumpPageRevision(s.pageRevisions, pageId),
      };
    });
    debouncePersistContent(pageId);
  },

  updatePageContent: (pageId, blocks) => {
    timed("updatePageContent", () => {
      const page = get().pageById(pageId);
      if (!page || !canEditPage(page, getCurrentPageAccessContext())) return;

      set((s) => {
        const pages = updatePageInState(
          s.pages,
          pageId,
          withTimestamp(applyPageContentUpdate(blocks)),
        );
        schedulePagesCachePersist(pages, page.workspaceId);
        return {
          ...derivePageState(pages, s.pageIdsByWorkspace),
          pageRevisions: bumpPageRevision(s.pageRevisions, pageId),
        };
      });
      debouncePersistContent(pageId);
    });
  },

  patchPage: (pageId, patch) => {
    const page = get().pageById(pageId);
    if (!page || !canEditPage(page, getCurrentPageAccessContext())) return;

    set((s) => timed("patchPage", () => {
      const result = patchPageInWorkspace(s.pages[page.workspaceId] ?? [], pageId, patch);

      if (!result.changed) return {};
      const pages = {
        ...s.pages,
        [page.workspaceId]: result.pages,
      };
      schedulePagesCachePersist(pages, page.workspaceId);
      return {
        ...derivePageState(pages, s.pageIdsByWorkspace),
        pageRevisions: bumpPageRevision(s.pageRevisions, pageId),
      };
    }));
    if (typeof patch !== "function") {
      const tabPatch: { title?: string; icon?: string } = {};
      if ("title" in patch) tabPatch.title = patch.title;
      if ("icon" in patch) tabPatch.icon = patch.icon;
      notifyTabsOfPagePatch(pageId, tabPatch);
    }
  },

  updatePageTitle: (pageId, title) => {
    const page = get().pageById(pageId);
    if (!page || !canEditPage(page, getCurrentPageAccessContext())) return;

    set((s) => {
      const pages = updatePageInState(
        s.pages,
        pageId,
        withTimestamp((page) => ({
          ...page,
          title,
        })),
      );
      schedulePagesCachePersist(pages, page.workspaceId);
      return {
        ...derivePageState(pages, s.pageIdsByWorkspace),
        pageRevisions: bumpPageRevision(s.pageRevisions, pageId),
      };
    });
    persistPageTitle(pageId, title);
    notifyTabsOfPagePatch(pageId, { title });
  },

  pagesForWorkspace: (workspaceId) => get().pages[workspaceId] ?? [],

  rootPages: (workspaceId) =>
    (get().pages[workspaceId] ?? []).filter(
      (p) =>
        !p.parentPageId &&
        !p.archivedAt &&
        !p.isTemplate &&
        canReadPage(p, getCurrentPageAccessContext()),
    ),

  childPages: (parentId, workspaceId) =>
    (get().pages[workspaceId] ?? []).filter(
      (p) =>
        p.parentPageId === parentId &&
        !p.archivedAt &&
        !p.isTemplate &&
        canReadPage(p, getCurrentPageAccessContext()),
    ),

  archivedPages: (workspaceId) =>
    (get().pages[workspaceId] ?? []).filter(
      (p) => p.archivedAt && canReadPage(p, getCurrentPageAccessContext()),
    ),

  templatePages: (workspaceId) =>
    (get().pages[workspaceId] ?? []).filter(
      (p) =>
        p.isTemplate &&
        !p.archivedAt &&
        canReadPage(p, getCurrentPageAccessContext()),
    ),

  defaultTemplate: (workspaceId) =>
    get()
      .templatePages(workspaceId)
      .find((p) => p.isDefaultTemplate),

  templatePageBySurface: (workspaceId, surface) =>
    get()
      .templatePages(workspaceId)
      .find((p) => p.templateSurface === surface),

  pageById: (pageId) => {
    const state = get();
    const index = state.pagesIndex[pageId];
    const page = index ? state.pages[index.workspaceId]?.[index.index] : undefined;
    if (!page) return undefined;
    return canReadPage(page, getCurrentPageAccessContext()) ? page : undefined;
  },
}));

// Register store access for persistence layer (avoids circular imports)
registerPageLookup((pageId) => usePageStore.getState().pageById(pageId));

// Persist the open page so a refresh restores it instead of dropping to Home.
usePageStore.subscribe((state, previous) => {
  if (state.activePage?.id !== previous.activePage?.id) {
    saveActivePage(state.activePage);
  }
});
