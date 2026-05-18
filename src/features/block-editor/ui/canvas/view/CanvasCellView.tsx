/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasCellView.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { CSSProperties } from "react";

import { roundFrameForDom } from "../model/geometry";
import type { CanvasCell } from "../model/types";

export interface CanvasCellViewProps {
  readonly cell: CanvasCell;
  readonly selected: boolean;
  readonly onSelect?: (cellId: string) => void;
}

export function CanvasCellView({ cell, selected, onSelect }: CanvasCellViewProps) {
  const frame = roundFrameForDom(cell.frame);
  const style: CSSProperties = {
    transform: `translate(${frame.x}px, ${frame.y}px)`,
    width: `${frame.width}px`,
    height: `${frame.height}px`,
    zIndex: cell.z,
    color: cell.visuals.foreground,
    background: cell.visuals.background ?? cell.visuals.tint,
  };

  return (
    <button
      type="button"
      className="osio-canvas-v2-cell"
      data-selected={selected ? "true" : "false"}
      style={style}
      onClick={() => onSelect?.(cell.id)}
    >
      <span className="osio-canvas-v2-cell-label">{cell.visuals.label || "Untitled"}</span>
      <span className="osio-canvas-v2-cell-meta">{cell.frame.width} x {cell.frame.height}</span>
    </button>
  );
}
