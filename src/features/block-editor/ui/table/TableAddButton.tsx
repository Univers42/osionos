/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TableAddButton.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { Plus } from "lucide-react";
import { startPointerDrag, stopPointerDrag } from "./tableCaretDom";
import type { Axis } from "./tableTypes";

const ADD_BUTTON_CLASS = "z-[var(--osio-z-raised)] flex h-6 w-6 items-center justify-center rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-[var(--osio-fg-muted)] opacity-0 shadow-[var(--osio-shadow-sm)] transition-colors transition-opacity hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] group-hover/table:opacity-100 group-focus-within/table:opacity-100";
const STEP_PX = { column: 110, row: 40 };

/**
 * Edge "+" that adds one row/column on click, several when dragged along the
 * axis (one per ~row-height / ~column-width of travel, with a live +N badge),
 * and exposes a 2/3/5 hover flyout. Keyboard: Enter/Space adds one.
 */
export function AddAxisButton({ axis, onAdd }: Readonly<{ axis: Axis; onAdd: (axis: Axis, count: number) => void }>) {
  const isColumn = axis === "column";
  const [dragCount, setDragCount] = useState(0);
  const label = isColumn ? "column" : "row";
  const anchorClass = isColumn ? "absolute -right-3 top-1/2 -translate-y-1/2 flex-col" : "absolute -bottom-3 left-1/2 -translate-x-1/2 flex-row";

  const startDrag = (event: React.PointerEvent) => {
    event.preventDefault();
    const origin = isColumn ? event.clientX : event.clientY;
    const step = isColumn ? STEP_PX.column : STEP_PX.row;
    let count = 1;
    let dragging = false;
    const move = (moveEvent: PointerEvent) => {
      const travel = (isColumn ? moveEvent.clientX : moveEvent.clientY) - origin;
      if (!dragging && Math.abs(travel) < 6) return;
      dragging = true;
      count = Math.max(1, Math.min(50, 1 + Math.floor(Math.max(0, travel) / step)));
      setDragCount(count);
    };
    const up = () => {
      setDragCount(0);
      onAdd(axis, dragging ? count : 1);
      stopPointerDrag(move, up);
    };
    startPointerDrag(isColumn ? "ew-resize" : "ns-resize", move, up);
  };

  return (
    <div className={`group/add ${anchorClass} z-[var(--osio-z-raised)] flex items-center gap-1`} data-table-handle>
      <button
        type="button"
        aria-label={`Add ${label}`}
        title={`Add ${label} — click, or drag for several`}
        onPointerDown={startDrag}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onAdd(axis, 1); } }}
        className={ADD_BUTTON_CLASS}
      >
        <Plus size={14} />
      </button>
      {dragCount > 0 && <span className="pointer-events-none rounded-full bg-[var(--osio-accent)] px-1.5 text-[11px] font-semibold leading-5 text-[var(--osio-accent-fg)] shadow-[var(--osio-shadow-sm)]">+{dragCount}</span>}
      <div className={`hidden group-hover/add:flex ${isColumn ? "flex-col" : "flex-row"} items-center gap-0.5 rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-1 py-0.5 shadow-[var(--osio-shadow-menu)]`}>
        {[2, 3, 5].map((count) => (
          <button key={count} type="button" title={`Add ${count} ${label}s`} onClick={() => onAdd(axis, count)} className="rounded-md px-1.5 text-[11px] font-semibold leading-5 text-[var(--osio-fg-muted)] transition-colors hover:text-[var(--osio-fg-default)]">
            {count}
          </button>
        ))}
      </div>
    </div>
  );
}
