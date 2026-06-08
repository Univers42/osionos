/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PaneView.tsx                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { PaneContent } from "@/widgets/page-renderer/ui/PaneContent";
import { useWorkspaceLayout } from "../model/workspaceLayout";
import type { PaneNode } from "../model/layoutTree";
import { TabStrip } from "./TabStrip";
import { PaneDropOverlay } from "./PaneDropOverlay";
import { usePaneDnd } from "./usePaneDnd";

/** A single tab-group leaf: tab bar + the active tab's content + drop zones. */
export const PaneView: React.FC<{ pane: PaneNode }> = ({ pane }) => {
  const isActive = useWorkspaceLayout((s) => s.activePaneId === pane.id);
  const { dropZone, dropHandlers } = usePaneDnd(pane.id);
  const activeTab = pane.tabs.find((t) => t.tabId === pane.activeTabId) ?? pane.tabs[0] ?? null;

  return (
    <div
      className={[
        "relative flex flex-col min-w-0 min-h-0 flex-1 overflow-hidden bg-[var(--osio-bg-page)]",
        isActive ? "ring-1 ring-inset ring-[var(--osio-accent)]/35" : "",
      ].join(" ")}
    >
      <TabStrip pane={pane} />
      <div className="relative flex-1 min-h-0 overflow-hidden" {...dropHandlers}>
        {activeTab ? (
          <PaneContent tab={activeTab} paneId={pane.id} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[var(--osio-fg-subtle)]">
            Drag a page here
          </div>
        )}
        <PaneDropOverlay zone={dropZone} />
      </div>
    </div>
  );
};
