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
import { temporal } from "zundo";
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
import type { PageStore } from "@/entities/page";
import {
  canEditPage,
  canReadPage,
  getCurrentPageAccessContext,
} from "@/shared/lib/auth/pageAccess";

// Re-export types so existing imports from this module still work
export type { PageEntry, ActivePageKind, ActivePage } from "@/entities/page";

/** Zustand store managing page tree, active page, recents, and block-level CRUD. */
const cachedPages = loadPagesCache();

let isStructuralAction = false;
let contentTimer: ReturnType<typeof setTimeout> | null = null;

export const usePageStore = create<PageStore>()(
  temporal(
    (set, get) => {
      // Helper for actions that should bypass debounce and trigger history instantly
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const structuralSet: typeof set = (partial: any, replace?: any) => {
        isStructuralAction = true;
        set(partial, replace);
      };

      return {
        pages: cachedPages,
        activePage: null,
        recents: loadRecents(),
        loadingIds: new Set<string>(),
        seeded: false,
        showTrash: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        temporal: null as any, // Injected by zundo middleware

        seedOfflinePages: createSeedOfflinePages(structuralSet, get),
        seedOnlinePages: createSeedOnlinePages(structuralSet, get),
        fetchPages: createFetchPages(structuralSet, get),
        fetchPageContent: createFetchPageContent(structuralSet, get),
        addPage: createAddPage(structuralSet, get),
        duplicatePage: createDuplicatePage(structuralSet, get),
        movePage: createMovePage(structuralSet, get),
        deletePage: createDeletePage(structuralSet, get),
        restorePage: createRestorePage(structuralSet, get),
        permanentlyDeletePage: createPermanentlyDeletePage(structuralSet, get),

        forceHistorySnapshot: () => {
          if (contentTimer) {
            clearTimeout(contentTimer);
            contentTimer = null;
          }
          get().temporal?.getState().snapshot();
        },

        openPage: (page) => {
          const context = getCurrentPageAccessContext();
          const currentPage = get().pageById(page.id);
          if (
            page.kind === "page" &&
            (!currentPage || !canReadPage(currentPage, context))
          ) {
            structuralSet({ activePage: null, showTrash: false });
            return;
          }

          structuralSet((s) => {
            const recents = [
              page,
              ...s.recents.filter((r) => r.id !== page.id),
            ].slice(0, 10);
            saveRecents(recents);
            return { activePage: page, recents, showTrash: false };
          });
          const jwt = getActiveJwt();
          if (jwt && page.kind === "page") {
            get().fetchPageContent(page.id, jwt);
          }
        },

        clearWorkspace: (workspaceId) => {
          structuralSet((s) => {
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
          if (!page || !canEditPage(page, getCurrentPageAccessContext()))
            return;

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
          if (!page || !canEditPage(page, getCurrentPageAccessContext()))
            return;

          structuralSet((s) => {
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
          if (!page || !canEditPage(page, getCurrentPageAccessContext()))
            return;

          structuralSet((s) => {
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
          if (!page || !canEditPage(page, getCurrentPageAccessContext()))
            return;

          structuralSet((s) => {
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

        moveBlockAcrossTree: (
          pageId,
          blockId,
          targetParentBlockId,
          targetIndex,
        ) => {
          const page = get().pageById(pageId);
          if (!page || !canEditPage(page, getCurrentPageAccessContext()))
            return;

          structuralSet((s) => {
            const pages = updatePageInState(
              s.pages,
              pageId,
              applyBlockMoveAcrossTree(
                blockId,
                targetParentBlockId,
                targetIndex,
              ),
            );
            savePagesCache(pages);
            return { pages };
          });
          debouncePersistContent(pageId);
        },

        indentBlock: (pageId, blockId) => {
          const page = get().pageById(pageId);
          if (!page || !canEditPage(page, getCurrentPageAccessContext()))
            return;

          structuralSet((s) => {
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
          if (!page || !canEditPage(page, getCurrentPageAccessContext()))
            return;

          structuralSet((s) => {
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
          if (!page || !canEditPage(page, getCurrentPageAccessContext()))
            return;

          structuralSet((s) => {
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
          if (!page || !canEditPage(page, getCurrentPageAccessContext()))
            return;

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
          if (!page || !canEditPage(page, getCurrentPageAccessContext()))
            return;

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

        trashPages: (workspaceId) =>
          (get().pages[workspaceId] ?? []).filter(
            (p) =>
              p.archivedAt && canReadPage(p, getCurrentPageAccessContext()),
          ),

        pageById: (pageId) => {
          const allPages = Object.values(get().pages).flat();
          const page = allPages.find((p) => p._id === pageId);
          if (!page) return undefined;
          return canReadPage(page, getCurrentPageAccessContext())
            ? page
            : undefined;
        },
      };
    },
    {
      limit: 50,
      partialize: (state) => ({
        pages: state.pages,
        activePage: state.activePage,
        recents: state.recents,
      }),
      handleSet: (handleSet) => (state) => {
        if (isStructuralAction) {
          handleSet(state);
          isStructuralAction = false;
          if (contentTimer) {
            clearTimeout(contentTimer);
            contentTimer = null;
          }
        } else {
          if (contentTimer) clearTimeout(contentTimer);
          contentTimer = setTimeout(() => {
            handleSet(state);
            contentTimer = null;
          }, 2000);
        }
      },
    },
  ),
);

// Register store access for persistence layer (avoids circular imports)
registerPageLookup((pageId) => usePageStore.getState().pageById(pageId));
