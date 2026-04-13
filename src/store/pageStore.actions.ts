/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageStore.actions.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 03:57:43 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { api } from "@/shared/api/client";
import { SEED_PAGES } from "../data/seedPages";
import {
  seedToEntry,
  localId,
  updatePageInState,
  isMongoId,
  saveRecents,
  getAllDescendantIds,
  savePagesCache,
  mergeWorkspacePages,
  isValidMove,
} from "./pageStore.helpers";
import type { PageEntry, PageStore, ActivePage } from "@/entities/page";

type SetFn = (
  partial: Partial<PageStore> | ((s: PageStore) => Partial<PageStore>),
) => void;
type GetFn = () => PageStore;

export function createSeedOfflinePages(set: SetFn, get: GetFn) {
  return () => {
    if (get().seeded) return;
    const existingPages = get().pages;
    if (Object.keys(existingPages).length > 0) {
      set({ seeded: true });
      savePagesCache(existingPages);
      return;
    }
    const grouped: Record<string, PageEntry[]> = {};
    for (const sp of SEED_PAGES) {
      if (!grouped[sp.workspaceId]) grouped[sp.workspaceId] = [];
      grouped[sp.workspaceId].push(seedToEntry(sp));
    }
    set({ pages: grouped, seeded: true });
    savePagesCache(grouped);
  };
}

export function createSeedOnlinePages(set: SetFn, get: GetFn) {
  return async (workspaceMap: Record<string, string>, jwt: string) => {
    if (get().seeded) return;
    set({ seeded: true });
    for (const sp of SEED_PAGES) {
      const realWsId = workspaceMap[sp.workspaceId];
      if (!realWsId) continue;
      if ((get().pages[realWsId] ?? []).length > 0) continue;
      try {
        const page = await api.post<PageEntry>(
          "/api/pages",
          {
            workspaceId: realWsId,
            title: sp.title,
            icon: sp.icon,
            content: sp.content,
          },
          jwt,
        );
        set((s) => ({
          pages: {
            ...s.pages,
            [realWsId]: [...(s.pages[realWsId] ?? []), page],
          },
        }));
        savePagesCache(get().pages);
      } catch (err) {
        console.warn("[pageStore] Failed to seed page:", sp.title, err);
      }
    }
  };
}

export function createFetchPages(set: SetFn, get: GetFn) {
  return async (workspaceId: string, jwt: string) => {
    if (!jwt) return;
    if (get().loadingIds.has(workspaceId)) return;
    set((s) => ({ loadingIds: new Set([...s.loadingIds, workspaceId]) }));
    try {
      const data = await api.get<PageEntry[]>(
        `/api/pages/all?workspaceId=${workspaceId}`,
        jwt,
      );
      set((s) => ({
        pages: {
          ...s.pages,
          [workspaceId]: mergeWorkspacePages(s.pages[workspaceId], data),
        },
        loadingIds: new Set(
          [...s.loadingIds].filter((id) => id !== workspaceId),
        ),
      }));
      savePagesCache(get().pages);
    } catch {
      set((s) => ({
        loadingIds: new Set(
          [...s.loadingIds].filter((id) => id !== workspaceId),
        ),
      }));
    }
  };
}

export function createFetchPageContent(set: SetFn, get: GetFn) {
  return async (pageId: string, jwt: string) => {
    if (!jwt || !isMongoId(pageId)) return; // skip for offline seed pages
    try {
      const fullPage = await api.get<PageEntry>(`/api/pages/${pageId}`, jwt);
      if (!fullPage) return;
      set((s) => ({
        pages: updatePageInState(s.pages, pageId, (p) => ({
          ...p,
          content: fullPage.content ?? p.content,
          title: fullPage.title ?? p.title,
          icon: fullPage.icon ?? p.icon,
        })),
      }));
      savePagesCache(get().pages);
    } catch (err) {
      console.warn("[pageStore] fetchPageContent failed:", pageId, err);
    }
  };
}

export function createAddPage(set: SetFn, get: GetFn) {
  return async (
    workspaceId: string,
    title: string,
    jwt: string,
    parentPageId?: string,
  ): Promise<PageEntry | null> => {
    if (jwt) {
      try {
        const page = await api.post<PageEntry>(
          "/api/pages",
          { workspaceId, title, parentPageId, content: [] },
          jwt,
        );
        set((s) => ({
          pages: {
            ...s.pages,
            [workspaceId]: [...(s.pages[workspaceId] ?? []), page],
          },
        }));
        savePagesCache(get().pages);
        return page;
      } catch {
        return null;
      }
    }
    const newPage: PageEntry = {
      _id: localId(),
      title,
      workspaceId,
      parentPageId: parentPageId ?? null,
      databaseId: null,
      archivedAt: null,
      content: [],
    };
    set((s) => ({
      pages: {
        ...s.pages,
        [workspaceId]: [...(s.pages[workspaceId] ?? []), newPage],
      },
    }));
    savePagesCache(get().pages);
    return newPage;
  };
}

export function createDeletePage(set: SetFn, get: GetFn) {
  return async (pageId: string, workspaceId: string, jwt: string) => {
    if (jwt && isMongoId(pageId)) {
      try {
        await api.delete(`/api/pages/${pageId}`, jwt);
      } catch {
        /* silent */
      }
    }
    set((s) => {
      const wsPages = s.pages[workspaceId] ?? [];
      const descendantIds = getAllDescendantIds(wsPages, pageId);
      const deletedIds = new Set([pageId, ...descendantIds]);

      const newRecents = s.recents.filter((r) => !deletedIds.has(r.id));
      if (newRecents.length !== s.recents.length) {
        saveRecents(newRecents);
      }

      return {
        pages: {
          ...s.pages,
          [workspaceId]: wsPages.filter((p) => !deletedIds.has(p._id)),
        },
        recents: newRecents,
      };
    });
    savePagesCache(get().pages);
  };
}

export function createDuplicatePage(set: SetFn, get: GetFn) {
  return async (pageId: string, workspaceId: string): Promise<string | null> => {
    const state = get();
    const wsPages = state.pages[workspaceId] ?? [];
    const rootPage = wsPages.find((p) => p._id === pageId);
    if (!rootPage) return null;

    const descendantIds = getAllDescendantIds(wsPages, pageId);
    const allIdsToClone = [pageId, ...descendantIds];
    const pagesToClone = wsPages.filter((p) => allIdsToClone.includes(p._id));

    // ID mapping: oldId -> newId
    const idMap: Record<string, string> = {};
    allIdsToClone.forEach((id) => {
      idMap[id] = localId();
    });

    const clonedPages: PageEntry[] = pagesToClone.map((p) => {
      const newId = idMap[p._id];
      const isRoot = p._id === pageId;
      return {
        ...p,
        _id: newId,
        title: isRoot ? `${p.title} (Copy)` : p.title,
        parentPageId: p.parentPageId
          ? idMap[p.parentPageId] ?? p.parentPageId
          : p.parentPageId,
      };
    });

    const newRootId = idMap[pageId];
    const newRootPage = clonedPages.find((p) => p._id === newRootId);

    set((s) => {
      const currentWsPages = s.pages[workspaceId] ?? [];
      const rootIdx = currentWsPages.findIndex((p) => p._id === pageId);

      const nextPages = [...currentWsPages];
      // Insert cloned pages after the original root page
      nextPages.splice(rootIdx + 1, 0, ...clonedPages);

      const nextAllPages = {
        ...s.pages,
        [workspaceId]: nextPages,
      };
      savePagesCache(nextAllPages);

      if (newRootPage) {
        const newActivePage: ActivePage = {
          id: newRootPage._id,
          workspaceId,
          kind: "page",
          title: newRootPage.title,
          icon: newRootPage.icon,
        };

        const recents = [
          newActivePage,
          ...s.recents.filter((r) => r.id !== newRootId),
        ].slice(0, 10);
        saveRecents(recents);

        return {
          pages: nextAllPages,
          activePage: newActivePage,
          recents,
        };
      }

      return { pages: nextAllPages };
    });

    return newRootId;
  };
}

export function createMovePage(set: SetFn, get: GetFn) {
  return (
    pageId: string,
    targetParentId: string | null,
    targetWorkspaceId: string
  ) => {
    const state = get();
    const allPagesRecord = state.pages;

    // 1. Validate move
    if (!isValidMove(allPagesRecord, pageId, targetParentId)) {
      console.error("[pageStore] Invalid move operation", {
        pageId,
        targetParentId,
      });
      return;
    }

    // 2. Find the page and its source workspace
    let sourceWorkspaceId: string | null = null;
    let targetPage: PageEntry | null = null;

    for (const wsId of Object.keys(allPagesRecord)) {
      const page = allPagesRecord[wsId].find((p) => p._id === pageId);
      if (page) {
        sourceWorkspaceId = wsId;
        targetPage = page;
        break;
      }
    }

    if (!sourceWorkspaceId || !targetPage) {
      console.error("[pageStore] Page not found for move", { pageId });
      return;
    }

    // 3. Perform atomic update
    set((s) => {
      const nextPages = { ...s.pages };

      if (sourceWorkspaceId === targetWorkspaceId) {
        // Simple re-parenting within same workspace
        nextPages[sourceWorkspaceId] = nextPages[sourceWorkspaceId].map((p) =>
          p._id === pageId ? { ...p, parentPageId: targetParentId } : p
        );

        savePagesCache(nextPages);
        return { pages: nextPages };
      } else {
        // Cross-workspace move
        const sourceList = nextPages[sourceWorkspaceId] ?? [];
        const descendantIds = getAllDescendantIds(sourceList, pageId);
        const allIdsToMove = new Set([pageId, ...descendantIds]);

        const pagesToMove = sourceList
          .filter((p) => allIdsToMove.has(p._id))
          .map((p) => ({
            ...p,
            workspaceId: targetWorkspaceId,
            parentPageId: p._id === pageId ? targetParentId : p.parentPageId,
          }));

        // Remove from source
        nextPages[sourceWorkspaceId] = sourceList.filter(
          (p) => !allIdsToMove.has(p._id)
        );

        // Add to target
        nextPages[targetWorkspaceId] = [
          ...(nextPages[targetWorkspaceId] ?? []),
          ...pagesToMove,
        ];

        // Update recents and activePage if they are affected by workspace change
        const updatedRecents = s.recents.map((r) =>
          allIdsToMove.has(r.id) ? { ...r, workspaceId: targetWorkspaceId } : r
        );

        let updatedActivePage = s.activePage;
        if (s.activePage && allIdsToMove.has(s.activePage.id)) {
          updatedActivePage = {
            ...s.activePage,
            workspaceId: targetWorkspaceId,
          };
        }

        saveRecents(updatedRecents);
        savePagesCache(nextPages);

        return {
          pages: nextPages,
          recents: updatedRecents,
          activePage: updatedActivePage,
        };
      }
    });
  };
}
