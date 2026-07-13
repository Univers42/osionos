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

import React, { useRef, useState } from "react";
import { SplitSquareHorizontal, SplitSquareVertical, X } from "lucide-react";
import { IconButton } from "@/shared/ui/atoms/IconButton";
import { useSidebarTreeDnd } from "@/widgets/sidebar/model/sidebarTreeDnd";
import { usePageStore } from "@/store/usePageStore";
import { useWorkspaceLayout } from "../model/workspaceLayout";
import { pageEntryToTab } from "../model/pageToTab";
import { TAB_DND_MIME } from "../model/paneDropZone";
import type { PaneNode } from "../model/layoutTree";
import { TabButton } from "./TabButton";

interface DropHint {
  index: number;
  replaceTabId?: string;
}

const InsertBar: React.FC = () => (
  <div className="w-0.5 self-stretch shrink-0 bg-[var(--osio-accent)]" aria-hidden="true" />
);

/** Header bar of one pane: its onglets + split/close actions. Accepts tabs
 *  dragged from other panes AND files dragged from the sidebar tree — showing an
 *  insertion bar (where it lands) or a full-tab highlight (drop ONTO a tab to
 *  replace it, VSCode-style — so it's not always about accumulating tabs). */
export const TabStrip: React.FC<{ pane: PaneNode }> = ({ pane }) => {
  const { setActiveTab, closeTab, setActivePane, splitActivePane, closePane, moveTab, openTabAt, replaceTabWith } =
    useWorkspaceLayout.getState();
  const endDrag = useSidebarTreeDnd((s) => s.endDrag);
  const listRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState<DropHint | null>(null);

  function computeHint(clientX: number): DropHint {
    const children = listRef.current
      ? (Array.from(listRef.current.querySelectorAll("[data-tab-id]")) as HTMLElement[])
      : [];
    for (let i = 0; i < children.length; i += 1) {
      const r = children[i].getBoundingClientRect();
      if (clientX < r.left + r.width * 0.25) return { index: i };
      if (clientX < r.left + r.width * 0.75) return { index: i, replaceTabId: pane.tabs[i]?.tabId };
      if (clientX < r.right) return { index: i + 1 };
    }
    return { index: pane.tabs.length };
  }

  // Read the LIVE dragKind (not the render-time selector) so the handler works
  // even if React hasn't re-rendered the strip since the drag started — the
  // gated `onDragOver={dndActive ? … : undefined}` attachment was racing the
  // native drag events and silently rejecting drops.
  function onDragOver(event: React.DragEvent<HTMLDivElement>) {
    const kind = useSidebarTreeDnd.getState().dragKind;
    if (kind !== "page" && kind !== "tab") return;
    event.preventDefault(); // REQUIRED — without it the browser refuses the drop
    if (kind === "page") {
      // MUST match the drag source's effectAllowed ("move", set in usePageRowDnd) —
      // a "copy" dropEffect against an effectAllowed of "move" is incompatible, so
      // the browser silently CANCELS the drop (onDragOver shows the hint but the
      // drop event never fires). This was why the tab never landed.
      event.dataTransfer.dropEffect = "move";
      setHint(computeHint(event.clientX));
    }
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    const kind = useSidebarTreeDnd.getState().dragKind;
    if (kind !== "page" && kind !== "tab") return;
    event.preventDefault();
    event.stopPropagation();
    const tabRaw = event.dataTransfer.getData(TAB_DND_MIME);
    if (tabRaw) {
      try {
        const { paneId: fromPaneId, tabId } = JSON.parse(tabRaw) as { paneId: string; tabId: string };
        moveTab(fromPaneId, tabId, pane.id);
      } catch {
        /* malformed payload */
      }
      setHint(null);
      return;
    }
    const pageId = event.dataTransfer.getData("text/plain") || useSidebarTreeDnd.getState().draggingId || "";
    const page = pageId ? usePageStore.getState().pageById(pageId) : null;
    const drop = computeHint(event.clientX);
    if (page && page.surface !== "folder") {
      const tab = pageEntryToTab(page);
      if (drop.replaceTabId) replaceTabWith(pane.id, drop.replaceTabId, tab);
      else openTabAt(tab, pane.id, drop.index);
    }
    setHint(null);
    endDrag();
  }

  function onDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHint(null);
  }

  return (
    <div
      data-osio-tabstrip
      className="flex items-stretch h-9 shrink-0 bg-[var(--osio-bg-muted)] border-b border-[var(--osio-border-default)]"
      onMouseDown={() => setActivePane(pane.id)}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
    >
      <div ref={listRef} className="flex items-stretch min-w-0 flex-1 overflow-x-auto osio-scrollbar-hidden">
        {pane.tabs.map((tab, index) => (
          <React.Fragment key={tab.tabId}>
            {hint && hint.replaceTabId === undefined && hint.index === index ? <InsertBar /> : null}
            <TabButton
              tab={tab}
              paneId={pane.id}
              active={tab.tabId === pane.activeTabId}
              replaceTarget={hint?.replaceTabId === tab.tabId}
              onSelect={() => setActiveTab(pane.id, tab.tabId)}
              onClose={() => closeTab(pane.id, tab.tabId)}
            />
          </React.Fragment>
        ))}
        {hint && hint.replaceTabId === undefined && hint.index >= pane.tabs.length ? <InsertBar /> : null}
      </div>
      <div className="flex items-center gap-0.5 px-1 shrink-0">
        <IconButton size="sm" title="Split right" onClick={() => splitActivePane(pane.id, "row")}>
          <SplitSquareHorizontal size={14} />
        </IconButton>
        <IconButton size="sm" title="Split down" onClick={() => splitActivePane(pane.id, "column")}>
          <SplitSquareVertical size={14} />
        </IconButton>
        <IconButton size="sm" title="Close pane" onClick={() => closePane(pane.id)}>
          <X size={14} />
        </IconButton>
      </div>
    </div>
  );
};
