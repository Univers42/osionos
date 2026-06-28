/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layout.types.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type React from "react";

import type { Block } from "@/entities/block";

export type LayoutMode = "inline" | "full_page";
export type LayoutGuideVisibility = "auto" | "always" | "never";
export type LayoutCellSizing = "fixed" | "auto-height" | "auto-width" | "auto";
export type LayoutCellHorizontalConstraint = "left" | "stretch" | "scale";
export type LayoutCellVerticalConstraint = "top" | "stretch" | "hug";
export type LayoutCellPadding = "compact" | "comfortable" | "spacious";
export type LayoutCellFontSize = "small" | "base" | "large";

export interface LayoutConfig {
  columns: number;
  rows: number;
  gap: number;
  rowHeight: number;
  wrap: boolean;
  autoArrange: boolean;
  snapToGrid: boolean;
  guideVisibility: LayoutGuideVisibility;
  preview: boolean;
  theme: "default" | "compact" | "spacious";
}

export interface LayoutCell {
  id: string;
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
  offset?: LayoutCellOffset;
  label?: string;
  tint?: string;
  blocks: Block[];
  type?: "text" | "color" | "spacer";
  content?: string;
  blockType?: Block["type"];
  textColor?: string;
  backgroundColor?: string;
  sizing?: LayoutCellSizing;
  horizontalConstraint?: LayoutCellHorizontalConstraint;
  verticalConstraint?: LayoutCellVerticalConstraint;
  wrap?: boolean;
  padding?: LayoutCellPadding;
  fontSize?: LayoutCellFontSize;
}

export interface LayoutCellOffset {
  x: number;
  y: number;
}

export type LayoutResizeEdge = "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface LayoutResizePreview {
  id: string;
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
  visual: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface LayoutMovePreview {
  id: string;
  offset: LayoutCellOffset;
}

export interface LayoutAlignmentGuides {
  x?: number;
  y?: number;
}

export type LayoutInteractionMode = "drag" | "move" | "resize";

export interface LayoutDatabasePreview {
  databaseId?: string;
  viewId?: string;
}

export interface LayoutHistorySnapshot {
  layoutConfig: LayoutConfig;
  layoutCells: LayoutCell[];
  layoutMode: LayoutMode;
  selectedCellId: string | null;
}

export type LayoutMeasuredCellHeights = ReadonlyMap<string, number>;

export type LayoutPanelKind = "settings" | "inspector";

export type LayoutGridStyle = React.CSSProperties & Record<"--osionos-layout-dot-size" | "--osionos-layout-row-size", string>;
