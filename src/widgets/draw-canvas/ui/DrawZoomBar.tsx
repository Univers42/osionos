/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DrawZoomBar.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Zoom controls (bottom-left, Excalidraw placement): −/+, the live percentage
 * (click = back to 100%), zoom-to-fit — plus a "Back to content" pill that only
 * appears when the whole drawing has been panned off-screen, the one moment it
 * is needed.
 */

import { Focus, Maximize, ZoomIn, ZoomOut } from "lucide-react";
import type { DrawEngine } from "@osionos/draw-engine";

const BAR_STYLE: React.CSSProperties = {
  position: "absolute",
  bottom: 16,
  left: 16,
  display: "flex",
  alignItems: "center",
  gap: 2,
  padding: 4,
  borderRadius: 10,
  background: "var(--osio-bg-panel)",
  border: "1px solid var(--osio-border-soft)",
  boxShadow: "var(--osio-shadow-md, 0 4px 16px rgba(0,0,0,0.12))",
};

const BTN_STYLE: React.CSSProperties = {
  height: 28,
  minWidth: 28,
  display: "grid",
  placeItems: "center",
  padding: "0 4px",
  borderRadius: 6,
  border: "none",
  cursor: "pointer",
  background: "transparent",
  color: "var(--osio-fg-default)",
  fontSize: 12,
  fontWeight: 600,
};

export function DrawZoomBar({
  engine,
  zoom,
  contentVisible,
}: {
  engine: DrawEngine | null;
  zoom: number;
  contentVisible: boolean;
}) {
  return (
    <div style={BAR_STYLE} role="group" aria-label="Zoom controls">
      <button type="button"
          onMouseDown={(event) => event.preventDefault()} style={BTN_STYLE} aria-label="Zoom out (⌘−)" title="Zoom out — ⌘−" onClick={() => engine?.zoomOut()}>
        <ZoomOut size={15} aria-hidden />
      </button>
      <button
        type="button"
          onMouseDown={(event) => event.preventDefault()}
        style={{ ...BTN_STYLE, minWidth: 48, color: "var(--osio-fg-strong)" }}
        aria-label={`Zoom ${zoom} percent — reset to 100 percent (⌘0)`}
        title="Reset zoom — ⌘0"
        onClick={() => engine?.zoomReset()}
      >
        {zoom}%
      </button>
      <button type="button"
          onMouseDown={(event) => event.preventDefault()} style={BTN_STYLE} aria-label="Zoom in (⌘+)" title="Zoom in — ⌘+" onClick={() => engine?.zoomIn()}>
        <ZoomIn size={15} aria-hidden />
      </button>
      <button type="button"
          onMouseDown={(event) => event.preventDefault()} style={BTN_STYLE} aria-label="Zoom to fit (⇧1)" title="Zoom to fit — ⇧1" onClick={() => engine?.fit()}>
        <Maximize size={15} aria-hidden />
      </button>
      {!contentVisible ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          style={{ ...BTN_STYLE, gap: 6, display: "flex", padding: "0 10px", color: "var(--osio-accent)" }}
          aria-label="Scroll back to content"
          onClick={() => engine?.fit()}
        >
          <Focus size={15} aria-hidden />
          Back to content
        </button>
      ) : null}
    </div>
  );
}
