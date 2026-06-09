/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePaneDnd.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { usePageStore } from "@/store/usePageStore";
import { useSidebarTreeDnd } from "@/widgets/sidebar/model/sidebarTreeDnd";
import { useWorkspaceLayout } from "../model/workspaceLayout";
import { pageEntryToTab } from "../model/pageToTab";
import type { WorkspaceTab } from "../model/layoutTree";
import { computeDropZone, zoneToSplit, TAB_DND_MIME, type DropZone } from "../model/paneDropZone";

interface DroppedItem {
  tab: WorkspaceTab;
  move?: { fromPaneId: string; tabId: string };
}

/** Read the drag payload: a moved pane-tab, else a sidebar page (skip folders). */
function readDrop(event: React.DragEvent<HTMLElement>): DroppedItem | null {
  const tabRaw = event.dataTransfer.getData(TAB_DND_MIME);
  if (tabRaw) {
    try {
      const parsed = JSON.parse(tabRaw) as { paneId: string; tabId: string; tab: WorkspaceTab };
      return { tab: parsed.tab, move: { fromPaneId: parsed.paneId, tabId: parsed.tabId } };
    } catch { return null; }
  }
  const pageId = event.dataTransfer.getData("text/plain");
  if (!pageId) return null;
  const page = usePageStore.getState().pageById(pageId);
  if (!page) return null;
  return { tab: pageEntryToTab(page) };
}

/** Drop behavior for a pane body: center → tab, edge → split. */
export function usePaneDnd(paneId: string) {
  const [zone, setZone] = useState<DropZone | null>(null);
  const dragActive = useSidebarTreeDnd((s) => s.dragKind !== null);
  const { openTab, moveTab, splitWith, splitMoveTab } = useWorkspaceLayout.getState();

  function onDragOver(event: React.DragEvent<HTMLElement>) {
    if (!dragActive) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setZone(computeDropZone(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect()));
  }

  function onDrop(event: React.DragEvent<HTMLElement>) {
    if (!dragActive) return;
    event.preventDefault();
    const resolvedZone = computeDropZone(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    setZone(null);
    const dropped = readDrop(event);
    if (!dropped) return;
    const split = zoneToSplit(resolvedZone);
    if (!split) {
      if (dropped.move) moveTab(dropped.move.fromPaneId, dropped.move.tabId, paneId);
      else openTab(dropped.tab, paneId);
      return;
    }
    if (dropped.move) splitMoveTab(dropped.move.fromPaneId, dropped.move.tabId, paneId, split.direction, split.side);
    else splitWith(paneId, split.direction, dropped.tab, split.side);
  }

  return {
    dragActive,
    dropZone: dragActive ? zone : null,
    dropHandlers: { onDragOver, onDragLeave: () => setZone(null), onDrop },
  };
}
