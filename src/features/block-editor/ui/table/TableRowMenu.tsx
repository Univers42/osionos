/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TableRowMenu.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useLayoutEffect, useRef } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Trash2 } from "lucide-react";
import { useClickOutside } from "@/shared/ui";
import type { TableMenuAction } from "./tableMenuActions";

export interface TableRowMenuProps {
  x: number;
  y: number;
  canDeleteRow: boolean;
  canDeleteColumn: boolean;
  onSelect: (action: TableMenuAction) => void;
  onClose: () => void;
}

const ITEMS: ReadonlyArray<{ action: TableMenuAction; label: string; Icon: typeof ArrowUp; danger?: boolean }> = [
  { action: "row-above", label: "Insert row above", Icon: ArrowUp },
  { action: "row-below", label: "Insert row below", Icon: ArrowDown },
  { action: "col-left", label: "Insert column left", Icon: ArrowLeft },
  { action: "col-right", label: "Insert column right", Icon: ArrowRight },
  { action: "row-delete", label: "Delete row", Icon: Trash2, danger: true },
  { action: "col-delete", label: "Delete column", Icon: Trash2, danger: true },
];

/** Compact popover of per-row/column actions, anchored to the row grip. */
export function TableRowMenu({ x, y, canDeleteRow, canDeleteColumn, onSelect, onClose }: Readonly<TableRowMenuProps>) {
  const ref = useRef<HTMLDivElement | null>(null);
  useClickOutside(ref, onClose);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Keep the popover inside the viewport, adjusting the DOM directly (before
  // paint) instead of through state to avoid a re-render cascade.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const margin = 8;
    element.style.top = `${Math.max(margin, Math.min(y, globalThis.innerHeight - rect.height - margin))}px`;
    element.style.left = `${Math.max(margin, Math.min(x, globalThis.innerWidth - rect.width - margin))}px`;
  }, [x, y]);

  const isDisabled = (action: TableMenuAction) => (action === "row-delete" && !canDeleteRow) || (action === "col-delete" && !canDeleteColumn);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Table row and column actions"
      style={{ top: y, left: x }}
      className="fixed z-[var(--osio-z-popover)] min-w-44 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-1 shadow-[var(--osio-shadow-menu)]"
    >
      {ITEMS.map(({ action, label, Icon, danger }) => (
        <button
          key={action}
          type="button"
          role="menuitem"
          disabled={isDisabled(action)}
          onClick={() => { onSelect(action); onClose(); }}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60 ${danger ? "text-[var(--osio-danger)] hover:bg-[var(--osio-bg-hover)]" : "text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]"}`}
        >
          <Icon size={14} aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
