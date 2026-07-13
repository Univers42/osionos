/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useLayoutPagePrune.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect } from "react";

import { usePageStore } from "@/store/usePageStore";
import { collectPanes } from "./layoutTree";
import { useWorkspaceLayout } from "./workspaceLayout";

type PageState = ReturnType<typeof usePageStore.getState>;

/**
 * Keep the tab tree honest against the page store. "Open page" has two sources of
 * truth (the layout tab tree + legacy `activePage`); archiving/deleting a page
 * only updated the page store, so the main-content tab bar kept showing a page the
 * sidebar had already dropped. This subscribes (widget → store, correct direction —
 * no import cycle) and closes any pane tab whose page just became archived (→ trash)
 * or was removed. Auto-covers the root AND every archived descendant, every path.
 */
export function useLayoutPagePrune(): void {
  useEffect(() => {
    const prune = (state: PageState, prev?: PageState) => {
      const layout = useWorkspaceLayout.getState();
      const openIds = collectPanes(layout.root)
        .flatMap((pane) => pane.tabs)
        .map((tab) => tab.pageId)
        .filter(Boolean);
      if (openIds.length === 0) return;

      const dead = new Set<string>();
      for (const id of openIds) {
        const page = state.pageById(id);
        if (page?.archivedAt) dead.add(id); // archived → moved to trash
        // Present last tick, gone now = a real delete (NOT a workspace unload, which
        // drops the whole pages[ws] array — a single id vanishing is a deletion).
        else if (!page && prev?.pagesIndex[id]) dead.add(id);
      }
      if (dead.size > 0) layout.closeTabsForPages(dead);
    };

    prune(usePageStore.getState()); // catch a page archived before this mounted
    return usePageStore.subscribe(prune);
  }, []);
}
