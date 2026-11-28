/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TabButton.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 15:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Folder, X } from "lucide-react";
import { IconValueView } from "@osionos/ui/atoms/IconValueView";
import { useDragSession } from "@/store/dragSession";
import type { WorkspaceTab } from "../model/layoutTree";
import { TAB_DND_MIME } from "../model/paneDropZone";

interface Props {
  tab: WorkspaceTab;
  paneId: string;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
  /** Highlighted as the drop target that will be REPLACED by a dragged file. */
  replaceTarget?: boolean;
  /** The tab being carried: folded away (Slide) or dimmed (Line) until the drop. */
  dragSource?: boolean;
  /** Sits after the drop gap: slid aside by the gap's width. */
  dropShift?: boolean;
  /** Just landed: plays the settle-in once, then `onSettled`. */
  settling?: boolean;
  onSettled?: () => void;
}

/** One onglet: draggable between panes, click to focus, × to close. The Home tab
 *  is a normal tab now — its variant picker (Dashboard / Second Brain / Database /
 *  Gallery) moved to the activity rail's Home button (RailHomeButton). */
export const TabButton: React.FC<Props> = ({ tab, paneId, active, onSelect, onClose, replaceTarget, dragSource, dropShift, settling, onSettled }) => {
  const beginTabDrag = useDragSession((s) => s.beginTabDrag);
  const endDrag = useDragSession((s) => s.endDrag);
  const title = tab.title || (tab.kind === "home" ? "Home" : "Untitled");

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(TAB_DND_MIME, JSON.stringify({ paneId, tabId: tab.tabId, tab }));
        beginTabDrag(tab.tabId, e.currentTarget.offsetWidth);
      }}
      onDragEnd={endDrag}
      onAnimationEnd={settling ? (e) => { if (e.target === e.currentTarget) onSettled?.(); } : undefined}
      onClick={onSelect}
      title={title}
      data-tab-id={tab.tabId}
      data-active={active ? "" : undefined}
      data-drop-item
      data-drag-source={dragSource ? "" : undefined}
      data-drop-shift={dropShift ? "" : undefined}
      data-settling={settling ? "" : undefined}
      className={[
        "osio-tab group/tab relative my-1 pointer-coarse:my-0 flex items-center gap-1.5 h-7 pointer-coarse:h-[var(--osio-touch-target)] pl-3 pr-1.5 max-w-[200px] shrink-0 cursor-pointer select-none rounded-[var(--osio-radius-chip)] text-xs",
        active
          ? "bg-[var(--osio-bg-hover)] text-[var(--osio-fg-default)]"
          : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-subtle)] hover:text-[var(--osio-fg-default)]",
        replaceTarget ? "ring-2 ring-inset ring-[var(--osio-accent)] bg-[var(--osio-accent-subtle)]" : "",
      ].join(" ")}
    >
      {tab.kind === "folder"
        ? <Folder size={14} className="shrink-0 text-[var(--osio-fg-muted)]" />
        : <IconValueView value={tab.icon ?? "icon:page"} size={14} className="shrink-0" />}
      <span className="truncate flex-1">{title}</span>
      <button
        type="button"
        aria-label={`Close ${title}`}
        className="shrink-0 rounded-[var(--osio-radius-chip)] p-1 pointer-coarse:grid pointer-coarse:min-h-[var(--osio-touch-target)] pointer-coarse:min-w-[var(--osio-touch-target)] pointer-coarse:place-items-center text-[var(--osio-fg-muted)] opacity-0 pointer-coarse:opacity-100 transition-[opacity,background-color,color] duration-[var(--osio-dur-fast)] group-hover/tab:opacity-100 focus-visible:opacity-100 hover:bg-[var(--osio-bg-muted)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--osio-focus-ring-color)]"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        title="Close tab"
      >
        <X size={14} />
      </button>
    </div>
  );
};
