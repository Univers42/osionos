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

/** The header BAND: an inline layout canvas with `layoutRole: "header"` that
 *  sits as the page's first block. The page itself stays a normal page — every
 *  other block keeps flowing below the band. `preview` controls the focus
 *  toggle: true = clean reading view, false = header-editing (grid + tools). */
export function createHeaderBandBlock(options: { preview?: boolean } = {}): Block {
  return {
    id: crypto.randomUUID(),
    type: "layout",
    content: "",
    layoutMode: "inline",
    layoutRole: "header",
    layoutConfig: {
      columns: 12,
      rows: 6,
      gap: 16,
      rowHeight: 96,
      wrap: true,
      autoArrange: false,
      snapToGrid: true,
      guideVisibility: "auto",
      preview: options.preview ?? true,
      theme: "spacious",
    },
    layoutCells: createProfileHeaderCells(),
  };
}

/** The "/header" page body: the hero band on top, then a normal empty page below. */
export function createProfileHeaderContent(): Block[] {
  return [
    createHeaderBandBlock({ preview: true }),
    { id: crypto.randomUUID(), type: "paragraph", content: "" },
  ];
}
