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

import { create } from 'zustand';
import {
  loadRecents, saveRecents,
  updatePageInState,
  applyBlockUpdate, applyBlockInsert, applyBlockDelete, applyBlockMove,
  applyBlockIndent, applyBlockOutdent, applyBlockTypeChange,
} from './pageStore.helpers';
import {
  createSeedOfflinePages, createSeedOnlinePages,
  createFetchPages, createFetchPageContent,
  createAddPage, createDeletePage,
} from './pageStore.actions';
import {
  debouncePersistContent, persistPageTitle, getActiveJwt, registerPageLookup,
} from './pageStore.persistence';
import type { PageStore } from './pageStore.types';

// Re-export types so existing imports from this module still work
export type { PageEntry, ActivePageKind, ActivePage } from './pageStore.types';

/** Zustand store managing page tree, active page, recents, and block-level CRUD. */
export const usePageStore = create<PageStore>((set, get) => ({
  pages:      {},
  activePage: null,
  recents:    loadRecents(),
  loadingIds: new Set<string>(),
  seeded:     false,

  seedOfflinePages:  createSeedOfflinePages(set, get),
  seedOnlinePages:   createSeedOnlinePages(set, get),
  fetchPages:        createFetchPages(set, get),
  fetchPageContent:  createFetchPageContent(set),
  addPage:           createAddPage(set),
  deletePage:        createDeletePage(set),

  openPage: (page) => {
    set(s => {
      const recents = [page, ...s.recents.filter(r => r.id !== page.id)].slice(0, 10);
      saveRecents(recents);
      return { activePage: page, recents };
    });
    const jwt = getActiveJwt();
    if (jwt && page.kind === 'page') {
      get().fetchPageContent(page.id, jwt);
    }
  },

  clearWorkspace: (workspaceId) => {
    set(s => {
      const pages = { ...s.pages };
      delete pages[workspaceId];
      return { pages };
    });
  },

  updateBlock: (pageId, blockId, updates) => {
    set(s => ({ pages: updatePageInState(s.pages, pageId, applyBlockUpdate(blockId, updates)) }));
    debouncePersistContent(pageId);
  },

  insertBlock: (pageId, afterBlockId, block) => {
    set(s => ({ pages: updatePageInState(s.pages, pageId, applyBlockInsert(afterBlockId, block)) }));
    debouncePersistContent(pageId);
  },

  deleteBlock: (pageId, blockId) => {
    set(s => ({ pages: updatePageInState(s.pages, pageId, applyBlockDelete(blockId)) }));
    debouncePersistContent(pageId);
  },

  moveBlock: (pageId, blockId, targetIndex, parentBlockId = null) => {
    set(s => ({ pages: updatePageInState(s.pages, pageId, applyBlockMove(blockId, targetIndex, parentBlockId)) }));
    debouncePersistContent(pageId);
  },

  indentBlock: (pageId, blockId) => {
    set(s => ({ pages: updatePageInState(s.pages, pageId, applyBlockIndent(blockId)) }));
    debouncePersistContent(pageId);
  },

  outdentBlock: (pageId, blockId) => {
    set(s => ({ pages: updatePageInState(s.pages, pageId, applyBlockOutdent(blockId)) }));
    debouncePersistContent(pageId);
  },

  changeBlockType: (pageId, blockId, newType) => {
    set(s => ({ pages: updatePageInState(s.pages, pageId, applyBlockTypeChange(blockId, newType)) }));
    debouncePersistContent(pageId);
  },

  updatePageContent: (pageId, blocks) => {
    set(s => ({ pages: updatePageInState(s.pages, pageId, page => ({ ...page, content: blocks })) }));
    debouncePersistContent(pageId);
  },

  updatePageTitle: (pageId, title) => {
    set(s => ({ pages: updatePageInState(s.pages, pageId, page => ({ ...page, title })) }));
    persistPageTitle(pageId, title);
  },

  pagesForWorkspace: (workspaceId) => get().pages[workspaceId] ?? [],

  rootPages: (workspaceId) =>
    (get().pages[workspaceId] ?? []).filter(p => !p.parentPageId && !p.archivedAt),

  childPages: (parentId, workspaceId) =>
    (get().pages[workspaceId] ?? []).filter(p => p.parentPageId === parentId && !p.archivedAt),

  pageById: (pageId) => {
    const allPages = Object.values(get().pages).flat();
    return allPages.find(p => p._id === pageId);
  },
}));

// Register store access for persistence layer (avoids circular imports)
registerPageLookup((pageId) => usePageStore.getState().pageById(pageId));
