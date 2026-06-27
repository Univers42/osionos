/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasResizeHandles.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

export type CanvasResizeEdge =
  | "left" | "right" | "top" | "bottom"
  | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export const CANVAS_RESIZE_EDGES: CanvasResizeEdge[] = [
  "left", "right", "top", "bottom",
  "top-left", "top-right", "bottom-left", "bottom-right",
];

export function resizeCursorForEdge(edge: CanvasResizeEdge): string {
  switch (edge) {
    case "left":
    case "right":
      return "ew-resize";
    case "top":
    case "bottom":
      return "ns-resize";
    case "top-right":
    case "bottom-left":
      return "nesw-resize";
    default:
      return "nwse-resize";
  }
}

export const CanvasResizeHandles: React.FC<{
  onStartResize: (event: React.PointerEvent<HTMLElement>, edge: CanvasResizeEdge) => void;
}> = ({ onStartResize }) => (
  <>
    <svg className="osionos-layout-resize-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden focusable="false">
      <rect className="osionos-layout-resize-outline" x="1" y="1" width="98" height="98" rx="2" vectorEffect="non-scaling-stroke" />
      <path className="osionos-layout-resize-corners" d="M1 16V1h16M83 1h16v16M99 83v16H83M17 99H1V83" vectorEffect="non-scaling-stroke" />
    </svg>
    {CANVAS_RESIZE_EDGES.map((edge) => (
      <button
        key={edge}
        type="button"
        className={`osionos-layout-resize-hit osionos-layout-resize-hit--${edge}`}
        data-layout-resize-handle
        aria-label={`Resize cell ${edge}`}
        title={`Resize ${edge}`}
        onPointerDown={(event) => onStartResize(event, edge)}
      />
    ))}
  </>
);
