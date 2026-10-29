/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   libraryItems.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

/**
 * What a Library row does: opening it opens the page or database it stands
 * for, and its sub-items are the page's readable child pages, in the page's own
 * workspace, so the table is the workspace tree. A skill, agent or command row
 * opens its detail dialog instead (libraryItemDetail). A new Doc, Rule or Hook is a page that
 * carries a Kind property; the Kind only sorts it in the Library. A curator drags a page
 * row under another page of its workspace, or out to that workspace's root.
 */

import type { ObjectDatabaseSubItemsController } from "@notion-db/object-database";
import { useUserStore } from "@/features/auth";
import { getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";
import { useToastStore } from "@/shared/ui";
import { isValidMove } from "@/store/pageStore.helpers";
import { useDatabaseStore } from "@/store/useDatabaseStore";
import { usePageStore } from "@/store/usePageStore";
import { liveDatabaseTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { LIBRARY_KIND_KEY, LIBRARY_KINDS, libraryChildren, readableLibraryPages, type LibraryKind } from "./libraryDatabaseModel";
import { libraryViewerCanCurate } from "./libraryDatabaseState";

export function openLibraryItem(itemId: string): void {
  const pages = usePageStore.getState();
  const page = pages.pageById(itemId);
  if (page) {
    pages.openPage({ id: page._id, workspaceId: page.workspaceId, kind: "page", title: page.title, icon: page.icon });
    return;
  }
  const database = useDatabaseStore.getState().created.find((entry) => entry.id === itemId);
  if (database) useWorkspaceLayout.getState().openTab({ ...liveDatabaseTab(database.id, database.name), viewId: database.viewId });
}

/** A new page, under `parentId` in that page's workspace when given, else in the
 *  active one; opened at once. A `kind` files it under Docs, Rules or Hooks. */
export async function createLibraryPage(parentId?: string, kind?: LibraryKind): Promise<void> {
  const users = useUserStore.getState();
  const pages = usePageStore.getState();
  const workspaceId = (parentId ? pages.pageById(parentId)?.workspaceId : undefined) ?? users.activeWorkspace()?._id;
  if (!workspaceId) return;
  const page = await pages.addPage(workspaceId, "Untitled", users.activePageJwt() ?? "", parentId, { visibility: "private" });
  if (!page) return;
  if (kind) {
    const kindProperty = { key: LIBRARY_KIND_KEY, label: "Kind", type: "select" as const, value: kind, options: [...LIBRARY_KINDS] };
    pages.patchPage(page._id, { properties: [...(page.properties ?? []), kindProperty] });
  }
  pages.openPage({ id: page._id, workspaceId, kind: "page", title: page.title });
}

function refuseMove(description: string): never {
  useToastStore.getState().push({ kind: "error", title: "The page was not moved", description });
  throw new Error(description);
}

/** Re-parents a page row in its own workspace; null puts it at that workspace's root.
 *  A refusal is said once and rejects, so the table keeps its tree as it was. */
export async function moveLibraryPage(rowId: string, parentId: string | null, canCurate: boolean): Promise<void> {
  if (!canCurate) refuseMove("Only a workspace owner or admin can rearrange the Library.");
  const pages = usePageStore.getState();
  const page = pages.pageById(rowId);
  if (!page) refuseMove("Only pages can be nested.");
  if (parentId !== null) {
    if (pages.pageById(parentId)?.workspaceId !== page.workspaceId) refuseMove("A page moves under a page of its own workspace.");
    if (!isValidMove(pages.pages, rowId, parentId)) refuseMove("A page cannot go under itself or one of its sub-pages.");
  }
  pages.movePage(rowId, parentId, page.workspaceId);
  if ((usePageStore.getState().pageById(rowId)?.parentPageId ?? null) !== parentId) refuseMove("You cannot move this page.");
}

export function createLibrarySubItemsController(canCurate: () => boolean = libraryViewerCanCurate): ObjectDatabaseSubItemsController {
  return {
    fetchRows: async (recordId) => {
      const pages = usePageStore.getState();
      const parent = pages.pageById(recordId);
      if (!parent) return [];
      return libraryChildren(readableLibraryPages(pages.pages, [parent.workspaceId], getCurrentPageAccessContext()), recordId)
        .map((child) => ({ id: child._id, title: child.title || "Untitled", icon: child.icon ?? undefined, pageId: child._id }));
    },
    openRow: openLibraryItem,
    createRow: (recordId) => createLibraryPage(recordId),
    moveRow: (rowId, parentId) => moveLibraryPage(rowId, parentId, canCurate()),
    canMoveRow: (rowId) => canCurate() && Boolean(usePageStore.getState().pageById(rowId)),
  };
}
