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

import { api } from '../api/client';
import { SEED_PAGES } from '../data/seedPages';
import { seedToEntry, localId, updatePageInState, isMongoId } from './pageStore.helpers';
import type { PageEntry, PageStore } from './pageStore.types';

type SetFn = (partial: Partial<PageStore> | ((s: PageStore) => Partial<PageStore>)) => void;
type GetFn = () => PageStore;

export function createSeedOfflinePages(set: SetFn, get: GetFn) {
  return () => {
    if (get().seeded) return;
    const grouped: Record<string, PageEntry[]> = {};
    for (const sp of SEED_PAGES) {
      if (!grouped[sp.workspaceId]) grouped[sp.workspaceId] = [];
      grouped[sp.workspaceId].push(seedToEntry(sp));
    }
    set({ pages: grouped, seeded: true });
  };
}

export function createSeedOnlinePages(set: SetFn, get: GetFn) {
  return async (workspaceMap: Record<string, string>, jwt: string) => {
    if (get().seeded) return;
    set({ seeded: true });
    for (const sp of SEED_PAGES) {
      const realWsId = workspaceMap[sp.workspaceId];
      if (!realWsId) continue;
      try {
        const page = await api.post<PageEntry>(
          '/api/pages',
          {
            workspaceId: realWsId,
            title:       sp.title,
            icon:        sp.icon,
            content:     sp.content,
          },
          jwt,
        );
        set(s => ({
          pages: {
            ...s.pages,
            [realWsId]: [...(s.pages[realWsId] ?? []), page],
          },
        }));
      } catch (err) {
        console.warn('[pageStore] Failed to seed page:', sp.title, err);
      }
    }
  };
}

export function createFetchPages(set: SetFn, get: GetFn) {
  return async (workspaceId: string, jwt: string) => {
    if (!jwt) return;
    if (get().loadingIds.has(workspaceId)) return;
    set(s => ({ loadingIds: new Set([...s.loadingIds, workspaceId]) }));
    try {
      const data = await api.get<PageEntry[]>(
        `/api/pages/all?workspaceId=${workspaceId}`, jwt,
      );
      set(s => ({
        pages:      { ...s.pages, [workspaceId]: data },
        loadingIds: new Set([...s.loadingIds].filter(id => id !== workspaceId)),
      }));
    } catch {
      set(s => ({
        loadingIds: new Set([...s.loadingIds].filter(id => id !== workspaceId)),
      }));
    }
  };
}

export function createFetchPageContent(set: SetFn) {
  return async (pageId: string, jwt: string) => {
    if (!jwt || !isMongoId(pageId)) return;  // skip for offline seed pages
    try {
      const fullPage = await api.get<PageEntry>(`/api/pages/${pageId}`, jwt);
      if (!fullPage) return;
      set(s => ({
        pages: updatePageInState(s.pages, pageId, p => ({
          ...p,
          content: fullPage.content ?? p.content,
          title:   fullPage.title ?? p.title,
          icon:    fullPage.icon ?? p.icon,
        })),
      }));
    } catch (err) {
      console.warn('[pageStore] fetchPageContent failed:', pageId, err);
    }
  };
}

export function createAddPage(set: SetFn) {
  return async (
    workspaceId: string, title: string, jwt: string, parentPageId?: string,
  ): Promise<PageEntry | null> => {
    if (jwt) {
      try {
        const page = await api.post<PageEntry>(
          '/api/pages',
          { workspaceId, title, parentPageId, content: [] },
          jwt,
        );
        set(s => ({
          pages: {
            ...s.pages,
            [workspaceId]: [...(s.pages[workspaceId] ?? []), page],
          },
        }));
        return page;
      } catch {
        return null;
      }
    }
    const newPage: PageEntry = {
      _id:          localId(),
      title,
      workspaceId,
      parentPageId: parentPageId ?? null,
      databaseId:   null,
      archivedAt:   null,
      content:      [],
    };
    set(s => ({
      pages: {
        ...s.pages,
        [workspaceId]: [...(s.pages[workspaceId] ?? []), newPage],
      },
    }));
    return newPage;
  };
}

export function createDeletePage(set: SetFn) {
  return async (pageId: string, workspaceId: string, jwt: string) => {
    if (jwt && isMongoId(pageId)) {
      try { await api.delete(`/api/pages/${pageId}`, jwt); } catch { /* silent */ }
    }
    set(s => ({
      pages: {
        ...s.pages,
        [workspaceId]: (s.pages[workspaceId] ?? []).filter(p => p._id !== pageId),
      },
    }));
  };
}
