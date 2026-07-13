/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DrawActions.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Export + canvas actions (bottom-right). PNG/SVG/`.osidraw` download via the
 * engine's exporters, plus Reset. A plain button group — no portaled menu.
 */

import type { DrawEngine } from "@osionos/draw-engine";

function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const GROUP_STYLE: React.CSSProperties = {
  position: "absolute",
  bottom: 16,
  right: 16,
  display: "flex",
  gap: 4,
  padding: 6,
  borderRadius: 12,
  background: "var(--osio-bg-panel)",
  border: "1px solid var(--osio-border-soft)",
  boxShadow: "var(--osio-shadow-md, 0 4px 16px rgba(0,0,0,0.12))",
};

const BTN_STYLE: React.CSSProperties = {
  height: 30,
  padding: "0 10px",
  borderRadius: 7,
  border: "1px solid var(--osio-border-soft)",
  background: "var(--osio-bg-surface)",
  color: "var(--osio-fg-default)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};

export function DrawActions({ engine }: { engine: DrawEngine | null }) {
  const exportPng = async () => {
    const blob = await engine?.exportPng();
    if (blob) download("drawing.png", blob);
  };
  const exportSvg = () => {
    const svg = engine?.exportSvg();
    if (svg) download("drawing.svg", new Blob([svg], { type: "image/svg+xml" }));
  };
  const exportJson = () => {
    const json = engine?.exportJson();
    if (json) download("drawing.osidraw", new Blob([json], { type: "application/json" }));
  };
  const reset = () => {
    if (globalThis.confirm("Clear the whole canvas? This cannot be undone.")) engine?.clear();
  };

  return (
    <div style={GROUP_STYLE} role="group" aria-label="Export and canvas actions">
      <button type="button" style={BTN_STYLE} onClick={exportPng} title="Export PNG">
        PNG
      </button>
      <button type="button" style={BTN_STYLE} onClick={exportSvg} title="Export SVG">
        SVG
      </button>
      <button type="button" style={BTN_STYLE} onClick={exportJson} title="Export .osidraw JSON">
        JSON
      </button>
      <button type="button" style={{ ...BTN_STYLE, color: "var(--osio-danger, #e03131)" }} onClick={reset} title="Reset canvas">
        Reset
      </button>
    </div>
  );
}
