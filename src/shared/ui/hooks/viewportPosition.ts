/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   viewportPosition.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:21 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:21 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export interface ViewportMenuPosition {
  top: number;
  left: number;
  maxHeight: number;
}

export interface ViewportClampOptions {
  width: number;
  maxHeight?: number;
  margin?: number;
}

export interface TriggerAlignedMenuPositionOptions {
  align?: "start" | "end";
  gap?: number;
  margin?: number;
}

interface TriggerRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface MenuRect {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

export function clampViewportMenuPosition(
  x: number,
  y: number,
  options: ViewportClampOptions,
): ViewportMenuPosition {
  const margin = options.margin ?? 12;
  const viewportWidth = globalThis.innerWidth;
  const viewportHeight = globalThis.innerHeight;
  const maxHeight = Math.min(options.maxHeight ?? 520, viewportHeight - margin * 2);

  return {
    top: clamp(y, margin, viewportHeight - maxHeight - margin),
    left: clamp(x, margin, viewportWidth - options.width - margin),
    maxHeight,
  };
}

export function clampTriggerAlignedMenuPosition(
  triggerRect: TriggerRect,
  menuRect: MenuRect,
  options: TriggerAlignedMenuPositionOptions = {},
) {
  const align = options.align ?? "end";
  const gap = options.gap ?? 6;
  const margin = options.margin ?? 12;
  const viewportWidth = globalThis.innerWidth;
  const viewportHeight = globalThis.innerHeight;
  const preferredLeft = align === "end"
    ? triggerRect.right - menuRect.width
    : triggerRect.left;
  const spaceBelow = viewportHeight - triggerRect.bottom - gap - margin;
  const spaceAbove = triggerRect.top - gap - margin;
  const openAbove = spaceBelow < menuRect.height && spaceAbove > spaceBelow;

  return {
    top: openAbove
      ? Math.max(margin, triggerRect.top - menuRect.height - gap)
      : Math.min(triggerRect.bottom + gap, viewportHeight - menuRect.height - margin),
    left: clamp(preferredLeft, margin, viewportWidth - menuRect.width - margin),
  };
}

export function clampAnchoredPanelPosition(
  anchor: { top: number; left: number },
  parentWidth: number,
  panelWidth: number,
  maxHeight: number,
  margin = 12,
) {
  const viewportWidth = globalThis.innerWidth;
  const viewportHeight = globalThis.innerHeight;
  let left = anchor.left + parentWidth + 8;
  if (left + panelWidth + margin > viewportWidth) {
    left = anchor.left - panelWidth - 8;
  }

  return {
    top: clamp(anchor.top, margin, viewportHeight - maxHeight - margin),
    left: clamp(left, margin, viewportWidth - panelWidth - margin),
    maxHeight,
  };
}
