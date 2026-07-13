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

/** The legacy ActivePage projection of a tab (null for Home/Trash/Folder/Console/Draw). */
export function tabToActivePage(tab: WorkspaceTab): ActivePage | null {
  if (tab.kind === "home" || tab.kind === "trash" || tab.kind === "folder" || tab.kind === "console" || tab.kind === "draw") return null;
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
  const snapshot = tab ? tabToActivePage(tab) : null;

  if (!snapshot) {
    usePageStore.setState({ activePage: null, showTrash: tab?.kind === "trash", navigationPath: [] });
    return;
  }

  // Prefer the LIVE page record over the tab's creation-time snapshot: a tab
  // opened before a rename must never push its stale "Untitled" back into the
  // active page (the rename-reverts-on-tab-click bug).
  const live = store.pageById(snapshot.id);
  const activePage = live
    ? { ...snapshot, title: live.title, icon: live.icon ?? snapshot.icon }
    : snapshot;

  const recents = addRecent(store.recents, activePage);
  saveRecents(recents);
  usePageStore.setState({ activePage, showTrash: false, recents, navigationPath: [activePage] });

  if (activePage.kind === "page") {
    const jwt = getActivePageJwt();
    if (jwt && !store.pageById(activePage.id)) store.fetchPageContent(activePage.id, jwt);
  }
}
