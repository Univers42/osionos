/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseViewShowcase.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The "view showcase" dashboard builder (the /dashboard template, the slash
 * "Layout dashboard" command and Turn into dashboard). Every number on it is
 * read by a live view: the cells used to freeze seed-time counts into prose
 * ("24 tasks, 1.2M USD pipeline"), which went stale on the first edit. Text
 * cells now carry only words that stay true; the figures come from the views.
 */

import type { Block, LayoutCell, LayoutMode } from "@/entities/block";
import {
  KNOWN_DATABASE_VIEWS,
  VIEW_TYPE_ICONS,
  getKnownDatabaseView,
} from "./databaseViewCatalog.meta";
import {
  createDashboardCell,
  createDatabaseViewBlock,
  heading2,
  heading3,
  paragraph,
  stableDashboardId,
  stableDashboardCellId,
  stableDashboardBlockId,
  type LayoutPlacement,
  type ViewShowcaseOptions,
} from "./databaseViewCatalog";

/** The cross-database KPI view the command center opens with. */
const COMMAND_CENTER_VIEW = "v-proj-dashboard";

const CELL_PALETTE = [
  { backgroundColor: "color-mix(in srgb, #2563eb 7%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { backgroundColor: "color-mix(in srgb, #0f766e 10%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { backgroundColor: "color-mix(in srgb, #b45309 10%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { backgroundColor: "color-mix(in srgb, #be123c 8%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { backgroundColor: "color-mix(in srgb, #4d7c0f 9%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { backgroundColor: "color-mix(in srgb, #7c3aed 7%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { backgroundColor: "color-mix(in srgb, #0891b2 8%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
];

const HERO_PLACEMENT: LayoutPlacement = { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 3 };

const VIEW_PLACEMENTS: LayoutPlacement[] = [
  { colStart: 1, colSpan: 6, rowStart: 4, rowSpan: 4 },
  { colStart: 7, colSpan: 6, rowStart: 4, rowSpan: 4 },
  { colStart: 1, colSpan: 8, rowStart: 8, rowSpan: 3 },
  { colStart: 9, colSpan: 4, rowStart: 8, rowSpan: 3 },
  { colStart: 1, colSpan: 4, rowStart: 11, rowSpan: 3 },
  { colStart: 5, colSpan: 4, rowStart: 11, rowSpan: 3 },
  { colStart: 9, colSpan: 4, rowStart: 11, rowSpan: 3 },
  { colStart: 1, colSpan: 4, rowStart: 14, rowSpan: 3 },
  { colStart: 5, colSpan: 4, rowStart: 14, rowSpan: 3 },
  { colStart: 9, colSpan: 4, rowStart: 14, rowSpan: 3 },
  { colStart: 1, colSpan: 4, rowStart: 17, rowSpan: 3 },
  { colStart: 5, colSpan: 8, rowStart: 17, rowSpan: 3 },
];

const SHOWCASE_ROWS = 19;

function createViewCell(viewId: string, placement: LayoutPlacement, placementIndex: number, idScope: string): LayoutCell {
  const viewDefinition = getKnownDatabaseView(viewId) ?? KNOWN_DATABASE_VIEWS[0];
  const palette = CELL_PALETTE[placementIndex % CELL_PALETTE.length];
  const cellId = stableDashboardCellId(idScope, viewDefinition.id, placementIndex);

  return createDashboardCell(placement, {
    id: cellId,
    label: `${viewDefinition.databaseName} · ${viewDefinition.name}`,
    backgroundColor: palette.backgroundColor,
    textColor: palette.textColor,
    sizing: "fixed",
    verticalConstraint: "top",
    padding: viewDefinition.type === "dashboard" ? "compact" : "comfortable",
    fontSize: "base",
    blocks: [
      heading3(`${VIEW_TYPE_ICONS[viewDefinition.type]} ${viewDefinition.databaseName} · ${viewDefinition.name}`, stableDashboardBlockId(cellId, "heading")),
      paragraph(viewDefinition.description, stableDashboardBlockId(cellId, "insight")),
      createDatabaseViewBlock(viewDefinition.id, stableDashboardBlockId(cellId, "database")),
    ],
  });
}

function createHeroCell(idScope: string): LayoutCell {
  const cellId = stableDashboardCellId(idScope, COMMAND_CENTER_VIEW, 0, "hero");
  return createDashboardCell(HERO_PLACEMENT, {
    id: cellId,
    label: "Command center",
    backgroundColor: "color-mix(in srgb, #111827 6%, var(--osio-bg-surface))",
    textColor: "var(--osio-fg-default)",
    sizing: "fixed",
    verticalConstraint: "top",
    padding: "compact",
    blocks: [
      heading2("Workspace command center", stableDashboardBlockId(cellId, "heading")),
      paragraph("Projects, tasks, accounts, content and inventory, counted from their databases. Edit a row anywhere and these figures follow.", stableDashboardBlockId(cellId, "summary")),
      createDatabaseViewBlock(COMMAND_CENTER_VIEW, stableDashboardBlockId(cellId, "database")),
    ],
  });
}

export function createViewShowcaseCells(focusViewId = "v-prod-table", options: ViewShowcaseOptions = {}): LayoutCell[] {
  const focusView = getKnownDatabaseView(focusViewId)?.id ?? "v-prod-table";
  const idScope = options.idScope ?? stableDashboardId("showcase", focusView);
  const viewIds = [
    focusView,
    "v-prod-dashboard",
    "v-prod-analytics",
    "v-tasks-board",
    "v-proj-timeline",
    "v-proj-chart",
    "v-tasks-list",
    "v-content-calendar",
    "v-prod-map",
    "v-prod-feed",
    "v-inv-dashboard",
    "v-crm-gallery",
  ].filter((viewId, index, viewList) => viewId !== COMMAND_CENTER_VIEW && viewList.indexOf(viewId) === index);

  return [
    createHeroCell(idScope),
    ...VIEW_PLACEMENTS.map((placement, index) => createViewCell(viewIds[index] ?? viewIds[0], placement, index + 1, idScope)),
  ];
}

export function createViewShowcaseLayout(mode: LayoutMode, focusViewId?: string, options: ViewShowcaseOptions = {}): Block {
  const idScope = options.idScope ?? stableDashboardId("showcase", crypto.randomUUID());
  return {
    id: stableDashboardId(idScope, "layout", mode, focusViewId ?? "default"),
    type: "layout",
    content: "",
    layoutMode: mode,
    layoutConfig: {
      columns: 12,
      rows: SHOWCASE_ROWS,
      gap: 16,
      rowHeight: 132,
      wrap: true,
      autoArrange: false,
      snapToGrid: true,
      guideVisibility: "auto",
      preview: false,
      theme: "spacious",
    },
    layoutCells: createViewShowcaseCells(focusViewId, { idScope }),
  };
}

export function createViewShowcaseLayoutContent(mode: LayoutMode, focusViewId?: string, options: ViewShowcaseOptions = {}): Block[] {
  return [createViewShowcaseLayout(mode, focusViewId, options)];
}
