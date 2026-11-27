/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useTabStripDrop.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 23:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 23:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { useDragSession } from "@/store/dragSession";
import { usePageStore } from "@/store/usePageStore";
import { useWorkspaceLayout } from "../model/workspaceLayout";
import { pageEntryToTab } from "../model/pageToTab";
import { TAB_DND_MIME } from "../model/paneDropZone";
import type { PaneNode } from "../model/layoutTree";
import { moveTargetIndex, readTabSlots, slotEdge, tabDropHint, type TabDropHint } from "../model/tabDropHint";

/** A drop hint plus where its gap starts, in the strip's scroll coordinates. */
export interface StripDrop extends TabDropHint {
  edge: number;
}

// A page has no tab to measure yet: about one tab's width.
const PAGE_GAP_PX = 120;

const snapTwoFrames = (setSnap: (on: boolean) => void) => {
  setSnap(true);
  requestAnimationFrame(() => requestAnimationFrame(() => setSnap(false)));
};

const sameDrop =(a: StripDrop | null, b: StripDrop) =>
  a !== null && a.index === b.index && a.replaceTabId === b.replaceTabId && a.edge === b.edge;

/**
 * The drop side of one pane's tab strip: where a dragged tab or sidebar page would land, which
 * tab is the one being dragged (folded away while it is carried), and which tab just landed (it
 * settles in). `snap` is on for the two frames where the layout and the slide swap places — the
 * drag start and the drop — so motion.css turns the transitions off and nothing visibly jumps.
 */
export function useTabStripDrop(pane: PaneNode) {
  const listRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState<StripDrop | null>(null);
  const [snap, setSnap] = useState(false);
  const [settlingTabId, setSettlingTabId] = useState<string | null>(null);
  const dragKind = useDragSession((s) => s.dragKind);
  const dragTabId = useDragSession((s) => s.dragTabId);
  const dragTabWidth = useDragSession((s) => s.dragTabWidth);
  const sourceIndex = dragTabId ? pane.tabs.findIndex((tab) => tab.tabId === dragTabId) : -1;

  // A drag cancelled with Escape ends with no dragleave on this strip.
  if (dragKind === null && hint !== null) setHint(null);

  // The carried tab folds away and the gap opens in its place in the same frame, so its
  // neighbours stay where they are until the pointer moves. Once per carried tab: a
  // same-strip drop reorders the tabs before the drag ends, and must not reopen the gap.
  const openedFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (dragTabId === null) openedFor.current = null;
    const list = listRef.current;
    if (sourceIndex < 0 || !list || openedFor.current === dragTabId) return;
    openedFor.current = dragTabId;
    setHint({ index: sourceIndex, edge: slotEdge(readTabSlots(list), sourceIndex) });
    snapTwoFrames(setSnap);
  }, [dragTabId, sourceIndex]);

  function dropAt(clientX: number, kind: "tab" | "page"): StripDrop {
    const list = listRef.current;
    if (!list) return { index: pane.tabs.length, edge: 0 };
    const slots = readTabSlots(list);
    const x = clientX - list.getBoundingClientRect().left + list.scrollLeft;
    const drop = tabDropHint(x, slots, pane.tabs.map((tab) => tab.tabId), kind);
    return { ...drop, edge: slotEdge(slots, drop.index) };
  }

  // Reads the LIVE dragKind, not the render-time one: a handler attached only while a
  // drag was rendered raced the native events and silently rejected drops.
  function onDragOver(event: React.DragEvent<HTMLDivElement>) {
    const kind = useDragSession.getState().dragKind;
    if (kind !== "page" && kind !== "tab") return;
    event.preventDefault(); // without it the browser refuses the drop
    // Must match the sources' effectAllowed ("move"): a mismatch cancels the drop silently.
    event.dataTransfer.dropEffect = "move";
    const next = dropAt(event.clientX, kind);
    setHint((previous) => (sameDrop(previous, next) ? previous : next));
  }

  function dropTab(raw: string, clientX: number) {
    const { paneId: fromPaneId, tabId } = JSON.parse(raw) as { paneId: string; tabId: string };
    const { index } = dropAt(clientX, "tab");
    const fromIndex = fromPaneId === pane.id ? pane.tabs.findIndex((tab) => tab.tabId === tabId) : -1;
    useWorkspaceLayout.getState().moveTab(fromPaneId, tabId, pane.id, fromIndex < 0 ? index : moveTargetIndex(fromIndex, index));
    setSettlingTabId(tabId);
  }

  function dropPage(event: React.DragEvent<HTMLDivElement>) {
    const pageId = event.dataTransfer.getData("text/plain") || useDragSession.getState().draggingId || "";
    const page = pageId ? usePageStore.getState().pageById(pageId) : null;
    if (!page || page.surface === "folder") return;
    const drop = dropAt(event.clientX, "page");
    const tab = pageEntryToTab(page);
    const { replaceTabWith, openTabAt } = useWorkspaceLayout.getState();
    if (drop.replaceTabId) replaceTabWith(pane.id, drop.replaceTabId, tab);
    else openTabAt(tab, pane.id, drop.index);
    setSettlingTabId(tab.tabId);
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    const kind = useDragSession.getState().dragKind;
    if (kind !== "page" && kind !== "tab") return;
    event.preventDefault();
    event.stopPropagation();
    snapTwoFrames(setSnap);
    setHint(null);
    const tabRaw = event.dataTransfer.getData(TAB_DND_MIME);
    if (!tabRaw) {
      dropPage(event);
      useDragSession.getState().endDrag();
      return;
    }
    try {
      dropTab(tabRaw, event.clientX);
    } catch {
      /* malformed payload: nothing moves */
    }
  }

  function onDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHint(null);
  }

  return {
    listRef,
    hint,
    snap,
    sourceIndex,
    settlingTabId,
    clearSettling: () => setSettlingTabId(null),
    gapPx: dragKind === "tab" && dragTabWidth > 0 ? dragTabWidth : PAGE_GAP_PX,
    dropHandlers: { onDragOver, onDrop, onDragLeave },
  };
}
