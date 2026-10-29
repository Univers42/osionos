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
 * carries a Kind property; the Kind only sorts it in the Library.
 */

import type { ObjectDatabaseSubItemsController } from "@notion-db/object-database";
import { useUserStore } from "@/features/auth";
import { getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";
import { useDatabaseStore } from "@/store/useDatabaseStore";
import { usePageStore } from "@/store/usePageStore";
import { liveDatabaseTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { LIBRARY_KIND_KEY, LIBRARY_KINDS, libraryChildren, readableLibraryPages, type LibraryKind } from "./libraryDatabaseModel";

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

export function createLibrarySubItemsController(): ObjectDatabaseSubItemsController {
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
  };
}
