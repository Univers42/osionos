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

/**
 * A shared, SERIAL idle queue: it mounts one deferred pane per idle tick instead
 * of letting all inactive panes wake at once. Batched idle callbacks coalesce
 * into a few long tasks (~200ms blocking for 8 panes); serializing turns them
 * into many sub-50ms tasks that each contribute ~0 to blocking time.
 */
const deferredMountQueue: Array<() => void> = [];
let deferredMountPumping = false;
function scheduleDeferredMount(run: () => void): () => void {
  let cancelled = false;
  deferredMountQueue.push(() => { if (!cancelled) run(); });
  if (!deferredMountPumping) {
    deferredMountPumping = true;
    const request = globalThis.requestIdleCallback ?? ((cb: () => void) => globalThis.setTimeout(cb, 1));
    const pump = () => {
      deferredMountQueue.shift()?.();
      if (deferredMountQueue.length > 0) request(pump);
      else deferredMountPumping = false;
    };
    request(pump);
  }
  return () => { cancelled = true; };
}

/**
 * Mount the pane's heavy content immediately for the active pane; defer inactive
 * panes through the serial idle queue so opening 8 panes costs ~1 pane up front
 * and the rest fill in one-per-frame — VSCode-style background-group laziness.
 */
function useDeferredMount(immediate: boolean): boolean {
  const [ready, setReady] = React.useState(immediate);
  React.useEffect(() => {
    if (ready || immediate) return;
    return scheduleDeferredMount(() => setReady(true));
  }, [ready, immediate]);
  return ready || immediate;
}

/** A single tab-group leaf: tab bar + the active tab's content + drop zones. */
const PaneViewImpl: React.FC<{ pane: PaneNode }> = ({ pane }) => {
  const isActive = useWorkspaceLayout((s) => s.activePaneId === pane.id);
  const { dragActive, dropZone, dropHandlers } = usePaneDnd(pane.id);
  const activeTab = pane.tabs.find((t) => t.tabId === pane.activeTabId) ?? pane.tabs[0] ?? null;
  const mounted = useDeferredMount(isActive);

  return (
    <div
      // `contain: layout paint` isolates each pane's rendering so an edit/scroll in
      // one pane can't trigger layout/paint of the other panes (key with 8 open).
      style={{ contain: "layout paint" }}
      className={[
        "relative flex flex-col min-w-0 min-h-0 flex-1 overflow-hidden bg-[var(--osio-bg-page)]",
        isActive ? "ring-1 ring-inset ring-[var(--osio-accent)]/35" : "",
      ].join(" ")}
    >
      <TabStrip pane={pane} />
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {activeTab ? (
          mounted ? (
            <PaneContent tab={activeTab} paneId={pane.id} />
          ) : (
            // Deferred (inactive pane): cheap placeholder until the idle mount.
            <div className="h-full bg-[var(--osio-bg-page)]" aria-busy="true" />
          )
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[var(--osio-fg-subtle)]">
            Drag a page here
          </div>
        )}
        {/* During an external tab/page drag, a transparent capture layer sits ABOVE
            the editor so every region (incl. the bottom) drops onto the pane — the
            editor's own block drag-drop can't steal it. Absent when not dragging. */}
        {dragActive ? <div className="absolute inset-0 z-10" {...dropHandlers} /> : null}
        <PaneDropOverlay zone={dropZone} />
      </div>
    </div>
  );
};

// Memoized on the pane node (immutable per layout mutation): a focus/drag/edit in
// ONE pane changes only that pane's node, so the other panes' editors don't re-render.
export const PaneView = React.memo(PaneViewImpl, (a, b) => a.pane === b.pane);
