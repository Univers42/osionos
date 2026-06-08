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

  function applyResize(index: number, deltaFraction: number) {
    const sizes = [...dragStartSizes.current];
    const deltaPercent = deltaFraction * 100;
    const before = sizes[index] + deltaPercent;
    const after = sizes[index + 1] - deltaPercent;
    if (before < MIN_PANE_PERCENT || after < MIN_PANE_PERCENT) return;
    sizes[index] = before;
    sizes[index + 1] = after;
    resize(split.id, sizes);
  }

  return (
    <div className={["flex w-full h-full min-w-0 min-h-0", isRow ? "flex-row" : "flex-col"].join(" ")}>
      {split.children.map((child, index) => (
        <React.Fragment key={child.id}>
          <div className="flex min-w-0 min-h-0 overflow-hidden" style={{ flexBasis: `${split.sizes[index]}%`, flexGrow: 0, flexShrink: 1 }}>
            <LayoutNodeView node={child} />
          </div>
          {index < split.children.length - 1 && (
            <PaneSplitter
              direction={split.direction}
              onResizeStart={() => { dragStartSizes.current = [...split.sizes]; }}
              onResize={(deltaFraction) => applyResize(index, deltaFraction)}
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
