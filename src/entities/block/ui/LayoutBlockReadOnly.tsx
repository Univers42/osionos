/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LayoutBlockReadOnly.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import type { Block, LayoutCell } from "@/entities/block";
import { gridConfigFromLegacy } from "@/features/block-editor/ui/canvas/model/migration";
import { ReadOnlyBlock } from "./ReadOnlyBlock";

/**
 * Read-only renderer for `/canvas` layout blocks. Both schema versions persist to
 * the SAME legacy `layoutCells` (`colStart/colSpan/rowStart/rowSpan`) — the V2
 * frame model is editor-only — so a single CSS-grid pass covers both. Reuses the
 * editor's tokenized `.osionos-layout-*` classes (which include the narrow-width
 * column-stack media query) so it stays responsive with no new CSS.
 */
export function LayoutBlockReadOnly({ block }: { block: Block }): React.ReactElement | null {
  const cells = block.layoutCells ?? [];
  if (cells.length === 0) return null;
  const grid = gridConfigFromLegacy(block.layoutConfig);
  const style: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
    // Rows grow with content (read-only shells must never clip a bound bio/field);
    // rowHeight is a floor, not a fixed height.
    gridAutoRows: `minmax(${grid.rowHeight}px, auto)`,
    columnGap: `${grid.columnGap}px`,
    rowGap: `${grid.rowGap}px`,
    minHeight: "auto",
    padding: "8px",
  };
  return (
    <div className="osionos-layout-grid my-2" data-layout-guides="false" style={style}>
      {cells.map((cell) => (
        <LayoutCellReadOnly key={cell.id} cell={cell} />
      ))}
    </div>
  );
}

/** Grid placement + per-cell surface colors, mirroring the editor's cell style. */
function cellPlacementStyle(cell: LayoutCell): React.CSSProperties {
  const offset = cell.offset ?? { x: 0, y: 0 };
  return {
    gridColumn: `${cell.colStart} / span ${cell.colSpan}`,
    gridRow: `${cell.rowStart} / span ${cell.rowSpan}`,
    ["--osionos-layout-cell-offset-x" as string]: `${offset.x}px`,
    ["--osionos-layout-cell-offset-y" as string]: `${offset.y}px`,
    background: cell.backgroundColor ?? cell.tint ?? undefined,
    color: cell.textColor ?? undefined,
  };
}

function LayoutCellReadOnly({ cell }: { cell: LayoutCell }): React.ReactElement {
  const blocks = cell.blocks ?? [];
  return (
    <div
      className="osionos-layout-cell"
      data-layout-sizing={cell.sizing ?? "auto-height"}
      data-layout-padding={cell.padding}
      data-layout-font-size={cell.fontSize}
      data-layout-wrap={cell.wrap === false ? "false" : "true"}
      data-section={cell.section}
      style={cellPlacementStyle(cell)}
    >
      <div className="osionos-layout-cell-editor" style={{ paddingTop: "var(--osio-cell-padding-block)" }}>
        {cell.label ? (
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--osio-fg-muted)]">{cell.label}</div>
        ) : null}
        {blocks.length > 0
          ? blocks.map((child, index) => <ReadOnlyBlock key={child.id} block={child} index={index} />)
          : cell.content
            ? <p className="text-sm leading-relaxed text-[var(--osio-fg-default)]">{cell.content}</p>
            : null}
      </div>
    </div>
  );
}
