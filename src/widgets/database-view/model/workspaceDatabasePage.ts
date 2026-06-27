/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceDatabasePage.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { WS_FILES_DB_ID, WS_FILES_GALLERY_VIEW } from "./workspaceDatabaseConstants";

const WS_GALLERY_PAGE_TITLE = "Files Gallery";

/** A database block that embeds the Files gallery (for inserting into any page). */
export function buildWorkspaceGalleryBlock(): Block {
  return {
    id: crypto.randomUUID(),
    type: "database_inline",
    content: "",
    databaseId: WS_FILES_DB_ID,
    viewId: WS_FILES_GALLERY_VIEW,
  };
}

/** Open (creating once) a dedicated full page that renders the Files gallery. */
export async function ensureWorkspaceGalleryPage(): Promise<void> {
  const workspaceId = useUserStore.getState().activeWorkspace()?._id;
  if (!workspaceId) return;
  const store = usePageStore.getState();
  const existing = store
    .pagesForWorkspace(workspaceId)
    .find((page) => page.databaseId === WS_FILES_DB_ID && !page.archivedAt);
  if (existing) {
    store.openPage({ id: existing._id, workspaceId, kind: "database", title: existing.title, databaseId: WS_FILES_DB_ID });
    return;
  }
  const jwt = useUserStore.getState().activeSession()?.accessToken ?? "";
  const page = await store.addDatabasePage(workspaceId, WS_GALLERY_PAGE_TITLE, jwt, WS_FILES_DB_ID);
  if (page) {
    store.openPage({ id: page._id, workspaceId, kind: "database", title: page.title, databaseId: WS_FILES_DB_ID });
  }
}
