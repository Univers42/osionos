/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layoutSync.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { ActivePage, ActivePageKind } from "@/entities/page";
import { getActivePageJwt } from "@/shared/api/client";
import { addRecent, saveRecents } from "@/store/pageStore.helpers";
import { usePageStore } from "@/store/usePageStore";
import type { WorkspaceTab } from "./layoutTree";

/** The legacy ActivePage projection of a tab (null for Home/Trash/Folder/Console). */
export function tabToActivePage(tab: WorkspaceTab): ActivePage | null {
  if (tab.kind === "home" || tab.kind === "trash" || tab.kind === "folder" || tab.kind === "console") return null;
  return {
    id: tab.pageId,
    workspaceId: tab.workspaceId,
    kind: tab.kind as ActivePageKind,
    title: tab.title,
    icon: tab.icon,
    databaseId: tab.databaseId ?? null,
  };
}

/**
 * Mirror the active pane's active tab into the legacy single-active-page store so
 * existing readers (graph highlight, session restore, OsionosPage header) keep
 * working: updates activePage/showTrash + recents and fetches page content lazily.
 */
export function mirrorActiveTab(tab: WorkspaceTab | null): void {
  const store = usePageStore.getState();
  const activePage = tab ? tabToActivePage(tab) : null;

  if (!activePage) {
    usePageStore.setState({ activePage: null, showTrash: tab?.kind === "trash", navigationPath: [] });
    return;
  }

  const recents = addRecent(store.recents, activePage);
  saveRecents(recents);
  usePageStore.setState({ activePage, showTrash: false, recents, navigationPath: [activePage] });

  if (activePage.kind === "page") {
    const jwt = getActivePageJwt();
    if (jwt && !store.pageById(activePage.id)) store.fetchPageContent(activePage.id, jwt);
  }
}
