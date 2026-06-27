/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WorkspaceGrid.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { useWorkspaceLayout } from "../model/workspaceLayout";
import type { LayoutNode, SplitNode } from "../model/layoutTree";
import { PaneView } from "./PaneView";
import { PaneSplitter } from "./PaneSplitter";

const MIN_PANE_PERCENT = 8;

const LayoutNodeView: React.FC<{ node: LayoutNode }> = ({ node }) =>
  node.type === "pane" ? <PaneView pane={node} /> : <SplitView split={node} />;

const SplitView: React.FC<{ split: SplitNode }> = ({ split }) => {
  const resize = useWorkspaceLayout((s) => s.resize);
  const isRow = split.direction === "row";
  // Sizes captured at pointer-down; the divider reports an ABSOLUTE delta from there, so the
  // drag accumulates instead of jittering back to the start size on every store re-render.
  const dragStartSizes = React.useRef<number[]>(split.sizes);
  // Frame path is DOM-only: pointermove writes flexBasis straight onto the two
  // adjacent cells, and the store — with its tree clone, React re-render, and
  // localStorage persist — is touched exactly once, on pointer-up. A small
  // feedback governor paces the writes: each write triggers a relayout of the
  // two panes, and when that relayout blows the frame budget (heavy panes —
  // dashboards, databases) the gap between writes doubles, so the pointer stays
  // responsive at the fastest live-resize rate the content can actually afford.
  // Light panes converge to a write every frame (full 60Hz live resize).
  const cellRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const pendingSizes = React.useRef<number[] | null>(null);
  const drag = React.useRef({ raf: 0, lastWrite: -1, lastTick: 0, minGap: 0, costPending: false, index: 0 });

  function applyResize(index: number, deltaFraction: number) {
    const sizes = [...dragStartSizes.current];
    const deltaPercent = deltaFraction * 100;
    const before = sizes[index] + deltaPercent;
    const after = sizes[index + 1] - deltaPercent;
    if (before < MIN_PANE_PERCENT || after < MIN_PANE_PERCENT) return;
    sizes[index] = before;
    sizes[index + 1] = after;
    pendingSizes.current = sizes;
    drag.current.index = index;
    if (drag.current.raf) return;
    const tick = (t: number) => {
      const s = drag.current;
      if (s.costPending) {
        // The first frame after a write carries its relayout cost: adapt the gap.
        const frameCost = t - s.lastTick;
        s.minGap = frameCost > 34 ? Math.min(250, s.minGap * 2 + 16) : Math.max(0, s.minGap / 2 - 4);
        s.costPending = false;
      }
      const pending = pendingSizes.current;
      if (pending && (s.lastWrite < 0 || t - s.lastWrite >= s.minGap)) {
        const cellBefore = cellRefs.current[s.index];
        const cellAfter = cellRefs.current[s.index + 1];
        if (cellBefore) cellBefore.style.flexBasis = `${pending[s.index]}%`;
        if (cellAfter) cellAfter.style.flexBasis = `${pending[s.index + 1]}%`;
        s.lastWrite = t;
        s.costPending = true;
      }
      s.lastTick = t;
      s.raf = requestAnimationFrame(tick);
    };
    drag.current.raf = requestAnimationFrame(tick);
  }

  function commitResize() {
    const s = drag.current;
    if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; }
    s.lastWrite = -1;
    s.minGap = 0;
    s.costPending = false;
    const pending = pendingSizes.current;
    pendingSizes.current = null;
    if (pending) resize(split.id, pending);
  }

  const dragOnUnmount = drag;
  React.useEffect(() => () => { if (dragOnUnmount.current.raf) cancelAnimationFrame(dragOnUnmount.current.raf); }, [dragOnUnmount]);

  return (
    <div className={["flex w-full h-full min-w-0 min-h-0", isRow ? "flex-row" : "flex-col"].join(" ")}>
      {split.children.map((child, index) => (
        <React.Fragment key={child.id}>
          <div
            ref={(el) => { cellRefs.current[index] = el; }}
            className="flex min-w-0 min-h-0 overflow-hidden"
            style={{ flexBasis: `${split.sizes[index]}%`, flexGrow: 0, flexShrink: 1 }}
          >
            <LayoutNodeView node={child} />
          </div>
          {index < split.children.length - 1 && (
            <PaneSplitter
              direction={split.direction}
              onResizeStart={() => { dragStartSizes.current = [...split.sizes]; }}
              onResize={(deltaFraction) => applyResize(index, deltaFraction)}
              onResizeEnd={commitResize}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

/** The whole editor area: a resizable grid of tabbed panes (VSCode-style). */
export const WorkspaceGrid: React.FC = () => {
  const root = useWorkspaceLayout((s) => s.root);
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden bg-[var(--osio-bg-page)]">
      <LayoutNodeView node={root} />
    </div>
  );
};
