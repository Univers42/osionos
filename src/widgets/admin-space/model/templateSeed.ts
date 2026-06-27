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
import type { TemplateSurface } from "@/widgets/page-renderer/model/useTemplateForSurface";

let counter = 0;
const blockId = (): string => `tmpl-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** A field bound to the record in context ($record) — renders the user/app value. */
function bound(fieldBind: string, headingLevel?: 1 | 2 | 3): Block {
  return { id: blockId(), type: headingLevel ? (`heading_${headingLevel}` as Block["type"]) : "paragraph", content: "", recordRef: "$record", fieldBind, headingLevel };
}

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
        cell("header", 1, 12, 1, 2, [bound("title", 1), bound("company")]),
        cell("about", 1, 8, 3, 3, [heading("About this app", 3), bound("description")]),
        cell("meta", 9, 4, 3, 3, [heading("Details", 3), bound("version"), bound("company")]),
      ]),
    ];
  }
  return [
    layout([
      cell("header", 1, 12, 1, 2, [bound("displayName", 1), bound("headline")]),
      cell("about", 1, 8, 3, 3, [heading("About", 3), bound("bio")]),
      cell("meta", 9, 4, 3, 3, [heading("Details", 3), bound("role"), bound("location")]),
    ]),
  ];
}
