/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profileHeaderPreset.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * "/header" preset: a company/profile dashboard header — glass cards floating
 * over an ambient video cover (42-intranet style), built ENTIRELY from existing
 * primitives: a full-page layout canvas, "glass" cell fills, ordinary blocks,
 * and live database views (chart + timeline). Everything stays editable with
 * the normal canvas tools; swap any placeholder for your own People view, KPI
 * or chart. ponytail: placeholders are static text — a data-bound person picker
 * is the upgrade path once a field-binding block exists.
 */

import type { Block } from "@/entities/block";
import type { LayoutCell } from "@/features/block-editor/ui/canvas/layout.types";
import { createDatabaseViewBlock } from "@/widgets/database-view/model/databaseViewCatalog";

/** Curated ambient video (public-domain NASA, already in the cover gallery). */
export const PROFILE_HEADER_COVER =
  "https://images-assets.nasa.gov/video/GSFC_20170419_EarthFleet_m12586_2017/GSFC_20170419_EarthFleet_m12586_2017~medium.mp4";

function block(type: Block["type"], content: string): Block {
  return { id: crypto.randomUUID(), type, content };
}

function glassCell(cell: Omit<LayoutCell, "id" | "tint" | "backgroundColor">): LayoutCell {
  return {
    id: crypto.randomUUID(),
    backgroundColor: "glass",
    padding: "spacious",
    sizing: "fixed",
    horizontalConstraint: "stretch",
    verticalConstraint: "top",
    wrap: true,
    ...cell,
  };
}

export function createProfileHeaderCells(): LayoutCell[] {
  return [
    glassCell({
      colStart: 1, colSpan: 4, rowStart: 1, rowSpan: 3,
      label: "Identity",
      blocks: [
        block("image", ""),
        block("heading_2", "Your Name"),
        block("paragraph", "@handle — role or team"),
        block("paragraph", "Level 4 · 62% to next milestone"),
      ],
    }),
    glassCell({
      colStart: 5, colSpan: 5, rowStart: 1, rowSpan: 3,
      label: "Pulse",
      blocks: [
        block("heading_3", "Team pulse"),
        createDatabaseViewBlock("v-proj-chart"),
      ],
    }),
    glassCell({
      colStart: 10, colSpan: 3, rowStart: 1, rowSpan: 3,
      label: "Contact",
      blocks: [
        block("heading_3", "Contact"),
        block("paragraph", "Email — you@company.com"),
        block("paragraph", "Phone — +00 000 000 000"),
        block("paragraph", "City — Madrid"),
        block("paragraph", "Since — 08/07/2029"),
      ],
    }),
    glassCell({
      colStart: 1, colSpan: 12, rowStart: 4, rowSpan: 3,
      label: "Milestones",
      blocks: [
        block("heading_3", "Milestones"),
        createDatabaseViewBlock("v-proj-timeline"),
      ],
    }),
  ];
}

/** True for blocks that carry no user content (blank paragraphs). */
function isBlankBlock(candidate: Block): boolean {
  return candidate.type === "paragraph" && !(candidate.content ?? "").trim() && !(candidate.children?.length);
}

/** One full-page header canvas. Any existing page blocks are preserved in a
 *  full-width auto-height "Content" cell below the hero cards, so the
 *  in-place "Customize header" transform never loses work. */
export function createHeaderCanvasBlock(existing: Block[] = []): Block {
  const cells = createProfileHeaderCells();
  const kept = existing.filter((candidate) => !isBlankBlock(candidate));
  if (kept.length > 0) {
    cells.push({
      id: crypto.randomUUID(),
      colStart: 1, colSpan: 12, rowStart: 7, rowSpan: 3,
      label: "Content",
      sizing: "auto-height",
      horizontalConstraint: "stretch",
      verticalConstraint: "top",
      wrap: true,
      padding: "spacious",
      blocks: kept,
    });
  }
  return {
    id: crypto.randomUUID(),
    type: "layout",
    content: "",
    layoutMode: "full_page",
    layoutConfig: {
      columns: 12,
      rows: 10,
      gap: 16,
      rowHeight: 96,
      wrap: true,
      autoArrange: false,
      snapToGrid: true,
      guideVisibility: "auto",
      preview: false,
      theme: "spacious",
    },
    layoutCells: cells,
  };
}

/** The whole page body: one full-page canvas whose top band floats over the cover. */
export function createProfileHeaderContent(): Block[] {
  return [createHeaderCanvasBlock()];
}
