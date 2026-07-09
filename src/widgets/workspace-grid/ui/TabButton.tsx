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
import { IconValueView } from "@/shared/ui/atoms/IconValueView";
import { useSidebarTreeDnd } from "@/widgets/sidebar/model/sidebarTreeDnd";
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
}

/** One onglet: draggable between panes, click to focus, × to close. The Home tab
 *  is a normal tab now — its variant picker (Dashboard / Second Brain / Database /
 *  Gallery) moved to the activity rail's Home button (RailHomeButton). */
export const TabButton: React.FC<Props> = ({ tab, paneId, active, onSelect, onClose, replaceTarget }) => {
  const beginTabDrag = useSidebarTreeDnd((s) => s.beginTabDrag);
  const endDrag = useSidebarTreeDnd((s) => s.endDrag);
  const title = tab.title || (tab.kind === "home" ? "Home" : "Untitled");

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(TAB_DND_MIME, JSON.stringify({ paneId, tabId: tab.tabId, tab }));
        beginTabDrag();
      }}
      onDragEnd={endDrag}
      onClick={onSelect}
      title={title}
      data-tab-id={tab.tabId}
      className={[
        "group/tab relative flex items-center gap-1.5 h-9 pl-3 pr-1.5 max-w-[200px] shrink-0 cursor-pointer select-none",
        "border-r border-[var(--osio-border-default)] text-xs transition-[background-color,color] duration-[var(--osio-dur-fast)] ease-[var(--osio-ease-standard)]",
        active
          ? "bg-[var(--osio-bg-surface)] text-[var(--osio-fg-strong)] shadow-[inset_0_-2px_0_var(--osio-accent)]"
          : "bg-[var(--osio-bg-page)] text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]",
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
        className="shrink-0 rounded-[var(--osio-radius-chip)] p-1 text-[var(--osio-fg-muted)] opacity-0 transition-[opacity,background-color,color] duration-[var(--osio-dur-fast)] group-hover/tab:opacity-100 focus-visible:opacity-100 hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--osio-focus-ring-color)]"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        title="Close tab"
      >
        <X size={14} />
      </button>
    </div>
  );
};
