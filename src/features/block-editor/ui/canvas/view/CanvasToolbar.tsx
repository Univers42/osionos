/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasToolbar.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef, useState } from "react";
import { Grid3X3, LayoutTemplate, Magnet, Plus, Redo2, SlidersHorizontal, Undo2 } from "lucide-react";
import { useStore } from "zustand";

import { CANVAS_TEMPLATES, type CanvasTemplateKind } from "../model/templates";
import type { CanvasStoreApi } from "../store/canvasStore";

interface CanvasToolbarProps {
  store: CanvasStoreApi;
  onAddCell: () => void;
  onApplyTemplate: (kind: CanvasTemplateKind) => void;
  onOpenInspector: () => void;
}

/**
 * Stage toolbar: add cell, the full template gallery (the legacy toolbar
 * only exposed Dashboard), inspector, snap + grid toggles and undo/redo.
 */
export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({ store, onAddCell, onApplyTemplate, onOpenInspector }) => {
  const layoutConfig = useStore(store, (state) => state.layoutConfig);
  const canUndo = useStore(store, (state) => state.history.past.length > 0);
  const canRedo = useStore(store, (state) => state.history.future.length > 0);
  const dispatch = useStore(store, (state) => state.dispatch);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const templatesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!templatesOpen) return undefined;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (templatesRef.current?.contains(event.target as Node)) return;
      setTemplatesOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress, true);
  }, [templatesOpen]);

  return (
    <div className="osionos-layout-toolbar" aria-label="Layout tools">
      <button type="button" onClick={onAddCell}>
        <Plus size={14} aria-hidden />
        <span>Add cell</span>
      </button>
      <div className="relative" ref={templatesRef}>
        <button type="button" onClick={() => setTemplatesOpen((value) => !value)} aria-expanded={templatesOpen}>
          <LayoutTemplate size={14} aria-hidden />
          <span>Templates</span>
        </button>
        {templatesOpen ? (
          <div className="osionos-layout-cell-menu osio-canvas-v2-template-menu" role="menu" aria-label="Layout templates">
            {CANVAS_TEMPLATES.map((template) => (
              <button
                key={template.kind}
                type="button"
                role="menuitem"
                onClick={() => {
                  onApplyTemplate(template.kind);
                  setTemplatesOpen(false);
                }}
              >
                <span aria-hidden>{template.glyph}</span> {template.label}
                <small>{template.description}</small>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button type="button" onClick={onOpenInspector}>
        <SlidersHorizontal size={14} aria-hidden />
        <span>Inspector</span>
      </button>
      <button
        type="button"
        data-active={layoutConfig.snapToGrid ? "true" : undefined}
        onClick={() => dispatch({ type: "setSnapToGrid", enabled: !layoutConfig.snapToGrid })}
      >
        <Magnet size={14} aria-hidden />
        <span>{layoutConfig.snapToGrid ? "Snap on" : "Snap off"}</span>
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: "updateLayoutConfig", patch: { guideVisibility: layoutConfig.guideVisibility === "never" ? "auto" : "never" } })}
      >
        <Grid3X3 size={14} aria-hidden />
        <span>{layoutConfig.guideVisibility === "never" ? "Show grid" : "Hide grid"}</span>
      </button>
      <button type="button" disabled={!canUndo} aria-label="Undo layout change" onClick={() => dispatch({ type: "undo" })}>
        <Undo2 size={14} aria-hidden />
      </button>
      <button type="button" disabled={!canRedo} aria-label="Redo layout change" onClick={() => dispatch({ type: "redo" })}>
        <Redo2 size={14} aria-hidden />
      </button>
    </div>
  );
};
