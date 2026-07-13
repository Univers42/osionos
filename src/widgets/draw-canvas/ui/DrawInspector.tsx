/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DrawInspector.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The style inspector for the Draw surface. Edits the selected elements' style,
 * or (with nothing selected) the pending style the next shape will use. Extra
 * sections appear with the selection: font size for text, arrange (z-order) for
 * any element, align/distribute for a multi-selection.
 */

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  BringToFront,
  ChevronsDown,
  ChevronsUp,
  SendToBack,
} from "lucide-react";
import type { DrawElementStyle, DrawEngine, FillStyle, StrokeStyle } from "@osionos/draw-engine";
import { IconRow, Row, Segmented, Swatches } from "./DrawInspectorControls";

interface InspectorProps {
  style: DrawElementStyle;
  selectedCount: number;
  onApply: (patch: Partial<DrawElementStyle>) => void;
  engine: DrawEngine | null;
}

const STROKE_SWATCHES = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"];
const FILL_SWATCHES = ["#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99"];
const WIDTHS: Array<{ label: string; value: number }> = [
  { label: "S", value: 1 },
  { label: "M", value: 2 },
  { label: "L", value: 4 },
];
const STROKE_STYLES: Array<{ label: string; value: StrokeStyle }> = [
  { label: "──", value: "solid" },
  { label: "– –", value: "dashed" },
  { label: "···", value: "dotted" },
];
const SLOPPINESS: Array<{ label: string; value: number }> = [
  { label: "Fine", value: 0 },
  { label: "Rough", value: 1 },
  { label: "Extra", value: 2 },
];
const FILL_STYLES: Array<{ label: string; value: FillStyle }> = [
  { label: "Hachure", value: "hachure" },
  { label: "Cross", value: "cross-hatch" },
  { label: "Solid", value: "solid" },
];
const FONT_SIZES: Array<{ label: string; value: number }> = [
  { label: "S", value: 16 },
  { label: "M", value: 20 },
  { label: "L", value: 28 },
  { label: "XL", value: 36 },
];

const PANEL_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 16,
  right: 16,
  width: 216,
  padding: 14,
  borderRadius: 12,
  background: "var(--osio-bg-panel)",
  border: "1px solid var(--osio-border-soft)",
  boxShadow: "var(--osio-shadow-md, 0 4px 16px rgba(0,0,0,0.12))",
  maxHeight: "calc(100% - 32px)",
  overflowY: "auto",
};

export function DrawInspector({ style, selectedCount, onApply, engine }: InspectorProps) {
  const hasText = selectedCount > 0 && !!engine?.getSelectedElements().some((element) => element.type === "text");
  return (
    <aside aria-label="Style inspector" style={PANEL_STYLE}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 14, color: "var(--osio-fg-strong)" }}>
        {selectedCount > 0 ? `${selectedCount} selected` : "Style"}
      </div>
      <Row label="Stroke">
        <Swatches value={style.strokeColor} presets={STROKE_SWATCHES} onPick={(color) => onApply({ strokeColor: color })} />
      </Row>
      <Row label="Background">
        <Swatches value={style.backgroundColor} presets={FILL_SWATCHES} allowTransparent onPick={(color) => onApply({ backgroundColor: color })} />
      </Row>
      <Row label="Width">
        <Segmented ariaLabel="Stroke width" options={WIDTHS} value={style.strokeWidth} onPick={(value) => onApply({ strokeWidth: value })} />
      </Row>
      <Row label="Stroke style">
        <Segmented ariaLabel="Stroke style" options={STROKE_STYLES} value={style.strokeStyle} onPick={(value) => onApply({ strokeStyle: value })} />
      </Row>
      <Row label="Sloppiness">
        <Segmented ariaLabel="Sloppiness" options={SLOPPINESS} value={style.roughness} onPick={(value) => onApply({ roughness: value })} />
      </Row>
      <Row label="Fill style">
        <Segmented ariaLabel="Fill style" options={FILL_STYLES} value={style.fillStyle} onPick={(value) => onApply({ fillStyle: value })} />
      </Row>
      {hasText ? (
        <Row label="Font size">
          <Segmented ariaLabel="Font size" options={FONT_SIZES} value={engine?.getFontSize() ?? 20} onPick={(value) => engine?.setFontSize(value)} />
        </Row>
      ) : null}
      <Row label={`Opacity — ${style.opacity}%`}>
        <input
          type="range"
          min={10}
          max={100}
          step={10}
          value={style.opacity}
          aria-label="Opacity"
          onChange={(event) => onApply({ opacity: Number(event.target.value) })}
          style={{ width: "100%", accentColor: "var(--osio-accent)" }}
        />
      </Row>
      <Row label={`Corners — ${style.roundness ?? 0}px`}>
        <input
          type="range"
          min={0}
          max={40}
          step={2}
          value={style.roundness ?? 0}
          aria-label="Corner rounding"
          onChange={(event) => onApply({ roundness: Number(event.target.value) || null })}
          style={{ width: "100%", accentColor: "var(--osio-accent)" }}
        />
      </Row>
      {selectedCount > 0 && engine ? (
        <Row label="Arrange">
          <IconRow
            buttons={[
              { label: "Send to back (⌘⌥[)", Icon: SendToBack, onPick: () => engine.reorderSelection("back") },
              { label: "Send backward (⌘[)", Icon: ChevronsDown, onPick: () => engine.reorderSelection("backward") },
              { label: "Bring forward (⌘])", Icon: ChevronsUp, onPick: () => engine.reorderSelection("forward") },
              { label: "Bring to front (⌘⌥])", Icon: BringToFront, onPick: () => engine.reorderSelection("front") },
            ]}
          />
        </Row>
      ) : null}
      {selectedCount >= 2 && engine ? (
        <Row label="Align">
          <IconRow
            buttons={[
              { label: "Align left", Icon: AlignStartVertical, onPick: () => engine.alignSelection("left") },
              { label: "Align horizontal centres", Icon: AlignCenterVertical, onPick: () => engine.alignSelection("centerX") },
              { label: "Align right", Icon: AlignEndVertical, onPick: () => engine.alignSelection("right") },
              { label: "Align top", Icon: AlignStartHorizontal, onPick: () => engine.alignSelection("top") },
              { label: "Align vertical centres", Icon: AlignCenterHorizontal, onPick: () => engine.alignSelection("centerY") },
              { label: "Align bottom", Icon: AlignEndHorizontal, onPick: () => engine.alignSelection("bottom") },
            ]}
          />
        </Row>
      ) : null}
      {selectedCount >= 3 && engine ? (
        <Row label="Distribute">
          <IconRow
            buttons={[
              { label: "Distribute horizontally", Icon: AlignHorizontalDistributeCenter, onPick: () => engine.distributeSelection("x") },
              { label: "Distribute vertically", Icon: AlignVerticalDistributeCenter, onPick: () => engine.distributeSelection("y") },
            ]}
          />
        </Row>
      ) : null}
    </aside>
  );
}
