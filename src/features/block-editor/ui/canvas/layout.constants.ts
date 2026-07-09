/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layout.constants.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { LayoutCell, LayoutConfig, LayoutPanelKind, LayoutResizeEdge } from "./layout.types";

export const LAYOUT_CELL_COLOR_SWATCHES = [
  { label: "Surface", backgroundColor: "var(--osio-bg-surface)", textColor: "var(--osio-fg-default)" },
  { label: "Blue", backgroundColor: "color-mix(in srgb, #2563eb 8%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { label: "Green", backgroundColor: "color-mix(in srgb, #0f766e 10%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { label: "Gold", backgroundColor: "color-mix(in srgb, #b45309 10%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { label: "Rose", backgroundColor: "color-mix(in srgb, #be123c 8%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
];

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  columns: 12,
  rows: 6,
  gap: 16,
  rowHeight: 120,
  wrap: true,
  autoArrange: false,
  snapToGrid: true,
  guideVisibility: "auto",
  preview: false,
  theme: "default",
};
export const LAYOUT_CELL_DND_TYPE = "application/x-osionos-layout-cell-id";

export const LAYOUT_CONFIG_LIMITS = {
  columns: [1, 24],
  rows: [1, 96],
  gap: [0, 48],
  rowHeight: [96, 320],
} as const;

export const CELL_MIN_CONTENT_WIDTH = 280;
export const CELL_COMFORTABLE_WIDTH = 480;
export const CELL_MIN_ROW_HEIGHT = 96;
export const LAYOUT_CELL_ROW_SPAN_MAX = 512;
export const LAYOUT_PANEL_WIDTHS: Record<LayoutPanelKind, number> = {
  settings: 260,
  inspector: 304,
};
export const LAYOUT_EDGE_AUTOSCROLL_ZONE = 72;
export const LAYOUT_EDGE_AUTOSCROLL_MAX_SPEED = 28;
export const EMPTY_LAYOUT_CELLS: LayoutCell[] = [];
export const LAYOUT_RESIZE_EDGES: LayoutResizeEdge[] = [
  "left",
  "right",
  "top",
  "bottom",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];
