/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasToolbarExtras.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical,
  AlignHorizontalDistributeCenter, AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter,
} from "lucide-react";

import { alignFrames, distributeFrames, type CanvasAlignEdge } from "../model/alignOps";
import type { CanvasCell, CanvasFrame } from "../model/types";

/** Cell fill presets — the warm-editorial swatch row (tints mixed onto surface). */
export const CANVAS_FILL_SWATCHES: { label: string; background?: string; foreground?: string }[] = [
  { label: "None" },
  { label: "Surface", background: "var(--osio-bg-surface)", foreground: "var(--osio-fg-default)" },
  { label: "Sand", background: "color-mix(in srgb, var(--osio-accent) 8%, var(--osio-bg-surface))", foreground: "var(--osio-fg-default)" },
  { label: "Sage", background: "color-mix(in srgb, #0f766e 10%, var(--osio-bg-surface))", foreground: "var(--osio-fg-default)" },
  { label: "Sky", background: "color-mix(in srgb, #2563eb 8%, var(--osio-bg-surface))", foreground: "var(--osio-fg-default)" },
  { label: "Rose", background: "color-mix(in srgb, #be123c 8%, var(--osio-bg-surface))", foreground: "var(--osio-fg-default)" },
];

export const CanvasFillSwatches: React.FC<{ onPick: (background?: string, foreground?: string) => void }> = ({ onPick }) => (
  <div className="osio-canvas-fill-grid" role="group" aria-label="Cell fill">
    {CANVAS_FILL_SWATCHES.map((swatch) => (
      <button
        key={swatch.label}
        type="button"
        title={swatch.label}
        aria-label={`${swatch.label} fill`}
        className="osio-canvas-fill-swatch"
        data-empty={swatch.background ? undefined : "true"}
        style={{ background: swatch.background ?? "transparent" }}
        onClick={() => onPick(swatch.background, swatch.foreground)}
      />
    ))}
  </div>
);

const ALIGN_BUTTONS: { edge: CanvasAlignEdge; Icon: typeof AlignStartVertical; label: string }[] = [
  { edge: "left", Icon: AlignStartVertical, label: "Align left" },
  { edge: "hcenter", Icon: AlignCenterVertical, label: "Align horizontal centres" },
  { edge: "right", Icon: AlignEndVertical, label: "Align right" },
  { edge: "top", Icon: AlignStartHorizontal, label: "Align top" },
  { edge: "vcenter", Icon: AlignCenterHorizontal, label: "Align vertical centres" },
  { edge: "bottom", Icon: AlignEndHorizontal, label: "Align bottom" },
];

/** Multi-select alignment + distribution (≥2 cells; distribute needs ≥3). */
export const CanvasAlignControls: React.FC<{
  cells: CanvasCell[];
  ids: ReadonlySet<string>;
  onFrames: (frames: Record<string, CanvasFrame>) => void;
}> = ({ cells, ids, onFrames }) => {
  const apply = (frames: Record<string, CanvasFrame>) => {
    if (Object.keys(frames).length > 0) onFrames(frames);
  };
  return (
    <div className="osio-canvas-tb-group" role="group" aria-label="Align and distribute">
      {ALIGN_BUTTONS.map(({ edge, Icon, label }) => (
        <button key={edge} type="button" className="osio-canvas-tb-btn" title={label} aria-label={label} onClick={() => apply(alignFrames(cells, ids, edge))}>
          <Icon size={15} strokeWidth={1.75} aria-hidden />
        </button>
      ))}
      {ids.size >= 3 ? (
        <>
          <button type="button" className="osio-canvas-tb-btn" title="Distribute horizontally" aria-label="Distribute horizontally" onClick={() => apply(distributeFrames(cells, ids, "x"))}>
            <AlignHorizontalDistributeCenter size={15} strokeWidth={1.75} aria-hidden />
          </button>
          <button type="button" className="osio-canvas-tb-btn" title="Distribute vertically" aria-label="Distribute vertically" onClick={() => apply(distributeFrames(cells, ids, "y"))}>
            <AlignVerticalDistributeCenter size={15} strokeWidth={1.75} aria-hidden />
          </button>
        </>
      ) : null}
    </div>
  );
};
