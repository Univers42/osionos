/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageFileFacadeStore.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#+    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { API_BASE, getActivePageJwt } from "@/shared/api/client";
import { usePageStore } from "@/store/usePageStore";
import { canChangePageVisibility, canEditPage, canReadPage, getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";
import { sanitizeSegment } from "@/features/ide/model/idePaths";

import type { PageFacade } from "@/features/ide/vfs/pageProvider";

import { createPageFileFacade, type NewPage, type PageFileStore } from "./pageFileFacade";

/** The REAL PageFacade over usePageStore — wires the live store like
 *  pageStoreFacade (store access, per-call jwt, lazy fetchPageContent) plus the
 *  canReadPage/canEditPage ACL, with the page-file dual FILE+DIR layout. The ONLY
 *  facade module that imports the store and client: that chain pulls a JSON seed and
 *  `import.meta.env`, neither of which loads under node, so the facade proper
 *  (pageFileFacade.ts) stays importable by the canvas tests and the bench. */
export function pageFileFacade(workspaceId: string): PageFacade {
  return createPageFileFacade(pageFileStoreDeps(workspaceId));
}

/** The live store as the facade's dependency set — shared by the facade above and
 *  the inbound session, which builds its own facade over the same views. */
export function pageFileStoreDeps(workspaceId: string): PageFileStore {
  const store = () => usePageStore.getState();
  const context = () => getCurrentPageAccessContext();
  const jwt = (): string => getActivePageJwt() ?? "";

  return {
    workspaceId,
    pages: () => store().pages[workspaceId] ?? [],
    access: context,
    canRead: (page) => canReadPage(page, context()),
    canEdit: (page) => canEditPage(page, context()),
    canChangeSharing: (page) => canChangePageVisibility(page, context()),
    loadContent: async (pageId) => {
      if (API_BASE && jwt()) await store().fetchPageContent(pageId, jwt());
    },
    subscribe: (listener) => usePageStore.subscribe(listener),
    addPage: (input: NewPage) => store().addPage(workspaceId, input.title, jwt(), input.parentId ?? undefined, {
      surface: input.surface,
      content: input.content,
    }),
    patchPage: (pageId, patch) => store().patchPage(pageId, patch),
    updatePageContent: (pageId, blocks) => store().updatePageContent(pageId, blocks),
    updatePageTitle: (pageId, title) => store().updatePageTitle(pageId, title),
    updateBlock: (pageId, blockId, updates) => store().updateBlock(pageId, blockId, updates),
    movePage: (pageId, parentId) => store().movePage(pageId, parentId, workspaceId),
    archivePage: (pageId) => store().archivePage(pageId, workspaceId, jwt()),
    toSegment: sanitizeSegment,
  };
}
