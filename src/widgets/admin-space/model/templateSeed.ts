/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   templateSeed.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block, LayoutCell } from "@/entities/block";
import { bound } from "@/data/templates/templateBlocks";
import type { TemplateSurface } from "@/widgets/page-renderer/model/useTemplateForSurface";

let counter = 0;
const blockId = (): string => `tmpl-${Date.now().toString(36)}-${(counter++).toString(36)}`;

function heading(text: string, level: 1 | 2 | 3): Block {
  return { id: blockId(), type: `heading_${level}` as Block["type"], content: text, headingLevel: level };
}

function cell(section: string, colStart: number, colSpan: number, rowStart: number, rowSpan: number, blocks: Block[]): LayoutCell {
  return { id: blockId(), section, colStart, colSpan, rowStart, rowSpan, blocks, sizing: "auto-height" };
}

function layout(cells: LayoutCell[]): Block {
  return {
    id: blockId(),
    type: "layout",
    content: "",
    layoutMode: "full_page",
    layoutConfig: { columns: 12, rowHeight: 96, gap: 16, wrap: true, autoArrange: false, snapToGrid: true, guideVisibility: "auto", preview: false },
    layoutCells: cells,
  };
}

/**
 * A minimal but real starting template for a surface — a soft `/canvas` layout
 * with sections bound to the record. The admin refines it with the normal block
 * + canvas tools; nothing here is hardcoded into the app.
 */
export function seedTemplateContent(surface: TemplateSurface): Block[] {
  if (surface === "marketplace-app") {
    return [
      layout([
        cell("header", 1, 12, 1, 2, [bound(blockId(), "title", 1), bound(blockId(), "company")]),
        cell("about", 1, 8, 3, 3, [heading("About this app", 3), bound(blockId(), "description")]),
        cell("meta", 9, 4, 3, 3, [heading("Details", 3), bound(blockId(), "version"), bound(blockId(), "company")]),
      ]),
    ];
  }
  return [
    layout([
      cell("header", 1, 12, 1, 2, [bound(blockId(), "displayName", 1), bound(blockId(), "headline")]),
      cell("about", 1, 8, 3, 3, [heading("About", 3), bound(blockId(), "bio")]),
      cell("meta", 9, 4, 3, 3, [heading("Details", 3), bound(blockId(), "role"), bound(blockId(), "location")]),
    ]),
  ];
}
