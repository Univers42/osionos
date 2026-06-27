/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   templates.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { createViewShowcaseCells } from "@/widgets/database-view/model/databaseViewShowcase";
import type { Block, LayoutCell } from "@/entities/block";
import { migrate } from "./migration";
import type { CanvasCell, CanvasGridConfig } from "./types";

// Templates are authored as legacy grid cells (the proven definitions) and
// converted into canvas frames through the migration path — one source of
// geometry truth.

export type CanvasTemplateKind = "dashboard" | "tracker" | "notes" | "kanban";

export const CANVAS_TEMPLATES: { kind: CanvasTemplateKind; label: string; description: string; glyph: string }[] = [
  { kind: "dashboard", label: "Dashboard", description: "Cross-database view showcase", glyph: "▦" },
  { kind: "tracker", label: "Tracker", description: "Sidebar, now, status and risks", glyph: "▥" },
  { kind: "notes", label: "Two-column notes", description: "Notes beside references", glyph: "▤" },
  { kind: "kanban", label: "Kanban", description: "Backlog, doing, review, done", glyph: "▮" },
];

function legacyTemplateCell(partial: Omit<LayoutCell, "id" | "type" | "content" | "blocks"> & { blocks?: Block[] }): LayoutCell {
  return {
    id: crypto.randomUUID(),
    type: "text",
    content: "",
    blocks: partial.blocks ?? [],
    ...partial,
  };
}

function headingBlocks(text: string): Block[] {
  return [{ id: crypto.randomUUID(), type: "heading_3", content: text }];
}

function buildLegacyTemplate(kind: CanvasTemplateKind): LayoutCell[] {
  switch (kind) {
    case "dashboard":
      return createViewShowcaseCells();
    case "tracker":
      return [
        legacyTemplateCell({ colStart: 1, colSpan: 4, rowStart: 1, rowSpan: 5, label: "Sidebar", blocks: headingBlocks("Tracker") }),
        legacyTemplateCell({ colStart: 5, colSpan: 8, rowStart: 1, rowSpan: 2, label: "Now", blocks: headingBlocks("Now") }),
        legacyTemplateCell({ colStart: 5, colSpan: 4, rowStart: 3, rowSpan: 2, label: "Status", blocks: headingBlocks("Status") }),
        legacyTemplateCell({ colStart: 9, colSpan: 4, rowStart: 3, rowSpan: 2, label: "Risks", blocks: headingBlocks("Risks") }),
      ];
    case "notes":
      return [
        legacyTemplateCell({ colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 4, label: "Left", blocks: headingBlocks("Notes") }),
        legacyTemplateCell({ colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 4, label: "Right", blocks: headingBlocks("References") }),
      ];
    case "kanban":
      return ["Backlog", "Doing", "Review", "Done"].map((label, index) => legacyTemplateCell({
        colStart: index * 3 + 1,
        colSpan: 3,
        rowStart: 1,
        rowSpan: 4,
        label,
        blocks: headingBlocks(label),
      }));
    default:
      return [];
  }
}

export function createTemplateCells(kind: CanvasTemplateKind, gridConfig: CanvasGridConfig): CanvasCell[] {
  return buildLegacyTemplate(kind).map((cell, index) => migrate(cell, gridConfig, index));
}
