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
import { IconButton } from "@osionos/ui/atoms/IconButton";
import { useWorkspaceLayout } from "../model/workspaceLayout";
import type { PaneNode } from "../model/layoutTree";
import { TabButton } from "./TabButton";
import { useTabStripDrop } from "./useTabStripDrop";

/** Header bar of one pane: its onglets + split/close actions. Accepts tabs dragged from any
 *  pane and pages dragged from the sidebar. While a drag is over it the tabs part to open a gap
 *  where the drop lands (or, with Tab dragging set to Line, a bar marks it); dropping onto the
 *  middle of a tab replaces it with the page, VSCode-style. */
export const TabStrip: React.FC<{ pane: PaneNode; zoom: number }> = ({ pane, zoom }) => {
  const { setActiveTab, closeTab, setActivePane, splitActivePane, closePane, zoomPane } = useWorkspaceLayout.getState();
  const zoomPercent = Math.round(zoom * 100);
  const { listRef, hint, snap, sourceIndex, settlingTabId, clearSettling, gapPx, dropHandlers } = useTabStripDrop(pane);
  const gapIndex = hint && hint.replaceTabId === undefined ? hint.index : -1;

  return (
    <div
      data-osio-tabstrip
      className="flex items-stretch h-9 pointer-coarse:h-[var(--osio-touch-target)] shrink-0 gap-0.5 px-1"
      onMouseDown={() => setActivePane(pane.id)}
      {...dropHandlers}
    >
      <div
        ref={listRef}
        data-drop-list
        data-drop-snap={snap ? "" : undefined}
        style={{ "--osio-drag-gap": `${gapPx}px` } as React.CSSProperties}
        className="relative flex items-stretch min-w-0 flex-1 overflow-x-auto osio-scrollbar-hidden"
      >
        {pane.tabs.map((tab, index) => (
          <TabButton
            key={tab.tabId}
            tab={tab}
            paneId={pane.id}
            active={tab.tabId === pane.activeTabId}
            replaceTarget={hint?.replaceTabId === tab.tabId}
            dragSource={index === sourceIndex}
            dropShift={gapIndex >= 0 && index >= gapIndex && index !== sourceIndex}
            settling={tab.tabId === settlingTabId}
            onSettled={clearSettling}
            onSelect={() => setActiveTab(pane.id, tab.tabId)}
            onClose={() => closeTab(pane.id, tab.tabId)}
          />
        ))}
        {gapIndex >= 0 ? (
          <div className="osio-tab-slot" aria-hidden="true" style={{ transform: `translateX(${hint?.edge ?? 0}px)` }} />
        ) : null}
      </div>
      <div className="flex items-center gap-0.5 px-1 shrink-0">
        {zoomPercent === 100 ? null : (
          <button
            type="button"
            title="Reset zoom"
            aria-label={`Reset zoom (${zoomPercent}%)`}
            onClick={() => zoomPane(pane.id, "reset")}
            className="h-[var(--osio-control-h-xs)] shrink-0 rounded-[var(--osio-radius-chip)] px-1.5 text-xs font-medium tabular-nums text-[var(--osio-fg-muted)] transition-[background-color,color] duration-[var(--osio-dur-fast)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--osio-focus-ring-color)]"
          >
            {zoomPercent}%
          </button>
        )}
        <IconButton size="sm" label="Split right" title="Split right" onClick={() => splitActivePane(pane.id, "row")}>
          <SplitSquareHorizontal size={14} />
        </IconButton>
        <IconButton size="sm" label="Split down" title="Split down" onClick={() => splitActivePane(pane.id, "column")}>
          <SplitSquareVertical size={14} />
        </IconButton>
        <IconButton size="sm" label="Close pane" title="Close pane" onClick={() => closePane(pane.id)}>
          <X size={14} />
        </IconButton>
      </div>
    </div>
  );
};
