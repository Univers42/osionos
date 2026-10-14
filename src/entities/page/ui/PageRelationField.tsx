/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageRelationField.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";

import { clampTriggerAlignedMenuPosition } from "@/shared/ui";
import { usePageStore } from "@/store/usePageStore";
import type { PagePropertyEntry } from "../model/types";
import { asStringArray } from "./pageProperties.helpers";

interface Props {
  workspaceId: string;
  excludePageId: string;
  value: PagePropertyEntry["value"];
  editable: boolean;
  onChange: (ids: string[]) => void;
}

/**
 * Pins the open picker beside its trigger, inside the viewport: a field near the
 * right edge of a phone would otherwise push an anchored picker off-screen.
 * Hidden until the frame that measures it, so it never shows at the origin.
 *
 * Ponytail: placed once when it opens. Scrolling or resizing while it is open
 * leaves it where it was; it closes on pick, which is the normal exit.
 */
function usePickerPlacement(open: boolean) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<React.CSSProperties>({ opacity: 0 });
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      if (!triggerRef.current || !pickerRef.current) return;
      const { offsetWidth: width, offsetHeight: height } = pickerRef.current;
      setPlacement(clampTriggerAlignedMenuPosition(triggerRef.current.getBoundingClientRect(), { width, height }, { align: "start" }));
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);
  return { triggerRef, pickerRef, placement };
}

/** Relation value cell: related pages as navigable chips + a picker to relate other pages. */
export const PageRelationField: React.FC<Props> = ({ workspaceId, excludePageId, value, editable, onChange }) => {
  const [picking, setPicking] = useState(false);
  const { triggerRef, pickerRef, placement } = usePickerPlacement(picking);
  const ids = asStringArray(value);
  const openPage = usePageStore((s) => s.openPage);
  const wsPages = usePageStore((s) => s.pages[workspaceId]);
  const pages = useMemo(
    () => (wsPages ?? []).filter((page) => !page.archivedAt).map((page) => ({ id: page._id, title: page.title })),
    [wsPages],
  );
  const titleOf = (id: string) => pages.find((page) => page.id === id)?.title || "Untitled";
  const candidates = pages.filter((page) => page.id !== excludePageId && !ids.includes(page.id));

  return (
    <div className="flex flex-wrap items-center gap-1">
      {ids.map((id) => (
        <span key={id} className="osio-chip">
          <button type="button" className="max-w-40 min-h-[24px] truncate hover:underline" onClick={() => openPage({ id, workspaceId, kind: "page", title: titleOf(id) })}>
            {titleOf(id)}
          </button>
          {editable ? (
            <button type="button" title="Remove relation" aria-label={`Remove relation ${titleOf(id)}`}
              className="inline-flex min-h-[24px] min-w-[24px] items-center justify-center -mr-0.5"
              onClick={() => onChange(ids.filter((other) => other !== id))}>
              <X size={11} />
            </button>
          ) : null}
        </span>
      ))}
      {ids.length === 0 && !editable ? <span className="text-sm text-[var(--osio-fg-subtle)]">No relations</span> : null}
      {editable ? (
        <div className="relative">
          <button ref={triggerRef} type="button" onClick={() => setPicking((open) => !open)}
            className="inline-flex min-h-[24px] items-center gap-0.5 rounded-xs px-1.5 py-0.5 text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]">
            <Plus size={12} /> Relate
          </button>
          {/* Portaled: the editor column is a size container, so `fixed` inside it
              resolves against the column and drifts from the trigger's viewport rect. */}
          {picking ? createPortal(
            <div data-testid="relation-picker" ref={pickerRef} style={placement} className="osio-surface-overlay fixed z-[var(--osio-z-popover)] max-h-56 w-56 overflow-auto">
              {candidates.length === 0 ? (
                <p className="px-2 py-1 text-xs text-[var(--osio-fg-subtle)]">No other pages</p>
              ) : (
                candidates.map((page) => (
                  <button key={page.id} type="button" onClick={() => { onChange([...ids, page.id]); setPicking(false); }}
                    className="osio-menu-item">
                    <span className="min-w-0 truncate">{page.title || "Untitled"}</span>
                  </button>
                ))
              )}
            </div>,
            document.body,
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
