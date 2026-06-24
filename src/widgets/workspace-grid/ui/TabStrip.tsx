/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TabStrip.tsx                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { SplitSquareHorizontal, SplitSquareVertical, X } from "lucide-react";
import { IconButton } from "@/shared/ui/atoms/IconButton";
import { useSidebarTreeDnd } from "@/widgets/sidebar/model/sidebarTreeDnd";
import { useWorkspaceLayout } from "../model/workspaceLayout";
import { TAB_DND_MIME } from "../model/paneDropZone";
import type { PaneNode } from "../model/layoutTree";
import { TabButton } from "./TabButton";

/** Header bar of one pane: its onglets + split/close actions. */
export const TabStrip: React.FC<{ pane: PaneNode }> = ({ pane }) => {
  const { setActiveTab, closeTab, setActivePane, splitActivePane, closePane, moveTab } = useWorkspaceLayout.getState();
  const tabDragActive = useSidebarTreeDnd((s) => s.dragKind === "tab");

  function onStripDrop(event: React.DragEvent<HTMLDivElement>) {
    const raw = event.dataTransfer.getData(TAB_DND_MIME);
    if (!raw) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      const { paneId: fromPaneId, tabId } = JSON.parse(raw) as { paneId: string; tabId: string };
      moveTab(fromPaneId, tabId, pane.id);
    } catch { /* malformed payload */ }
  }

  return (
    <div
      className="flex items-stretch h-8 shrink-0 bg-[var(--osio-bg-muted)] border-b border-[var(--osio-border-default)]"
      onMouseDown={() => setActivePane(pane.id)}
      onDragOver={tabDragActive ? (e) => e.preventDefault() : undefined}
      onDrop={tabDragActive ? onStripDrop : undefined}
    >
      <div className="flex items-stretch min-w-0 flex-1 overflow-x-auto">
        {pane.tabs.map((tab) => (
          <TabButton
            key={tab.tabId}
            tab={tab}
            paneId={pane.id}
            active={tab.tabId === pane.activeTabId}
            onSelect={() => setActiveTab(pane.id, tab.tabId)}
            onClose={() => closeTab(pane.id, tab.tabId)}
          />
        ))}
      </div>
      <div className="flex items-center gap-0.5 px-1 shrink-0">
        <IconButton size="xs" title="Split right" onClick={() => splitActivePane(pane.id, "row")}>
          <SplitSquareHorizontal size={14} />
        </IconButton>
        <IconButton size="xs" title="Split down" onClick={() => splitActivePane(pane.id, "column")}>
          <SplitSquareVertical size={14} />
        </IconButton>
        <IconButton size="xs" title="Close pane" onClick={() => closePane(pane.id)}>
          <X size={14} />
        </IconButton>
      </div>
    </div>
  );
};
