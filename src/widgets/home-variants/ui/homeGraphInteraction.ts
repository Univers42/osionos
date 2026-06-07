/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homeGraphInteraction.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type React from "react";

import { type NodePointerState, type ViewTransform, CLICK_DRAG_THRESHOLD } from "./homeGraphModel";

export function updateNodePointerMovement(event: React.PointerEvent<SVGSVGElement>, pointer: NodePointerState | null): void {
  if (!pointer) return;
  const distance = Math.hypot(event.clientX - pointer.startClientX, event.clientY - pointer.startClientY);
  pointer.moved = pointer.moved || distance > CLICK_DRAG_THRESHOLD;
}

export function handleGraphKey(
  key: string,
  zoomFromCenter: (multiplier: number) => void,
  resetViewport: () => void,
  setViewTransform: React.Dispatch<React.SetStateAction<ViewTransform>>,
): boolean {
  if (key === "+" || key === "=") {
    zoomFromCenter(1.12);
    return true;
  }
  if (key === "-" || key === "_") {
    zoomFromCenter(0.88);
    return true;
  }
  if (key === "0") {
    resetViewport();
    return true;
  }
  const delta = keyPanDelta(key);
  if (!delta) return false;
  setViewTransform((current) => ({ ...current, x: current.x + delta.x, y: current.y + delta.y }));
  return true;
}

function keyPanDelta(key: string): { x: number; y: number } | null {
  if (key === "ArrowLeft") return { x: 42, y: 0 };
  if (key === "ArrowRight") return { x: -42, y: 0 };
  if (key === "ArrowUp") return { x: 0, y: 42 };
  if (key === "ArrowDown") return { x: 0, y: -42 };
  return null;
}
