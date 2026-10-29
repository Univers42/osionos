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
 * for, and its sub-items are the page's child pages, so the table is the
 * workspace tree. A skill row has nowhere to open yet and stays put.
 */

import type { ObjectDatabaseSubItemsController } from "@notion-db/object-database";
import { useUserStore } from "@/features/auth";
import { useDatabaseStore } from "@/store/useDatabaseStore";
import { usePageStore } from "@/store/usePageStore";
import { liveDatabaseTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { libraryChildren } from "./libraryDatabaseModel";

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

/** A new page in the active workspace, under `parentId` when given, opened at once. */
export async function createLibraryPage(parentId?: string): Promise<void> {
  const users = useUserStore.getState();
  const workspace = users.activeWorkspace();
  if (!workspace) return;
  const pages = usePageStore.getState();
  const page = await pages.addPage(workspace._id, "Untitled", users.activePageJwt() ?? "", parentId, { visibility: "private" });
  if (page) pages.openPage({ id: page._id, workspaceId: workspace._id, kind: "page", title: page.title });
}

export function createLibrarySubItemsController(): ObjectDatabaseSubItemsController {
  return {
    fetchRows: async (recordId) => {
      const workspaceId = useUserStore.getState().activeWorkspace()?._id;
      if (!workspaceId) return [];
      return libraryChildren(usePageStore.getState().pagesForWorkspace(workspaceId), recordId)
        .map((child) => ({ id: child._id, title: child.title || "Untitled", icon: child.icon ?? undefined, pageId: child._id }));
    },
    openRow: openLibraryItem,
    createRow: (recordId) => createLibraryPage(recordId),
  };
}
