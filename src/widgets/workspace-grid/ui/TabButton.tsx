/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TabButton.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
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
}

/** One onglet: draggable between panes, click to focus, × to close. */
export const TabButton: React.FC<Props> = ({ tab, paneId, active, onSelect, onClose }) => {
  const beginTabDrag = useSidebarTreeDnd((s) => s.beginTabDrag);
  const endDrag = useSidebarTreeDnd((s) => s.endDrag);

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
      title={tab.title || "Untitled"}
      className={[
        "group/tab relative flex items-center gap-1 h-8 pl-2 pr-1 max-w-[180px] shrink-0 cursor-pointer select-none",
        "border-r border-[var(--osio-border-default)] text-xs transition-colors duration-[120ms]",
        active
          ? "bg-[var(--osio-bg-muted)] text-[var(--osio-fg-strong)] shadow-[inset_0_-2px_0_var(--osio-accent)]"
          : "bg-[var(--osio-bg-page)] text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]",
      ].join(" ")}
    >
      {tab.kind === "folder"
        ? <Folder size={14} className="shrink-0 text-[var(--osio-fg-muted)]" />
        : <IconValueView value={tab.icon ?? "icon:page"} size={14} className="shrink-0" />}
      <span className="truncate flex-1">{tab.title || "Untitled"}</span>
      <button
        type="button"
        className="shrink-0 rounded-md p-0.5 opacity-0 transition-colors duration-[120ms] group-hover/tab:opacity-100 hover:bg-[var(--osio-bg-hover)]"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        title="Close tab"
      >
        <X size={14} />
      </button>
    </div>
  );
};
