/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasCellChrome.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef, useState } from "react";

interface CanvasCellChromeProps {
  label: string;
  colSpan: number;
  rowSpan: number;
  onStartMove: (event: React.PointerEvent<HTMLElement>) => void;
  onRename: (label: string) => void;
  onAddCell: () => void;
  onInspect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/**
 * Handle bar above a selected/hovered cell: move grip, title, size badge and
 * the ⋯ menu. The title is controlled from the store (drafting only while
 * focused) so undo/redo and external edits stay in sync — the legacy bar
 * seeded local state once and drifted. The menu closes on outside pointer
 * down; the listener exists only while the menu is open.
 */
export const CanvasCellChrome: React.FC<CanvasCellChromeProps> = ({
  label,
  colSpan,
  rowSpan,
  onStartMove,
  onRename,
  onAddCell,
  onInspect,
  onDuplicate,
  onDelete,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [labelDraft, setLabelDraft] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress, true);
  }, [menuOpen]);

  return (
    <div className="osionos-layout-cell-handle" data-layout-cell-handle>
      <button
        type="button"
        draggable={false}
        className="osionos-layout-cell-drag"
        title="Move cell"
        aria-label="Drag cell"
        onPointerDown={onStartMove}
      >
        <span aria-hidden>⋮⋮</span>
      </button>
      <input
        value={labelDraft ?? label}
        onFocus={() => setLabelDraft(label)}
        onChange={(event) => setLabelDraft(event.currentTarget.value)}
        onBlur={() => {
          if (labelDraft !== null && labelDraft.trim() !== label) onRename(labelDraft.trim());
          setLabelDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
            event.currentTarget.closest<HTMLElement>("[data-layout-cell-id]")?.querySelector<HTMLElement>('[contenteditable="true"], textarea')?.focus();
          }
        }}
        placeholder="Untitled cell"
        aria-label="Cell title"
        name="cell-title"
        autoComplete="off"
      />
      <span className="osionos-layout-size-badge">⤢ {colSpan}×{rowSpan}</span>
      <div className="relative" ref={menuRef}>
        <button type="button" onClick={() => setMenuOpen((value) => !value)} aria-label="Cell menu" title="Cell menu">⋯</button>
        {menuOpen ? (
          <div className="osionos-layout-cell-menu">
            <button type="button" onClick={() => { onAddCell(); setMenuOpen(false); }}>Add cell</button>
            <button type="button" onClick={() => { onInspect(); setMenuOpen(false); }}>Inspect</button>
            <button type="button" onClick={() => { onDuplicate(); setMenuOpen(false); }}>Duplicate</button>
            <button type="button" onClick={() => { onDelete(); setMenuOpen(false); }}>Delete</button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
