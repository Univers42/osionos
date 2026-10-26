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
 * The OLD "view showcase" dashboard builder (the /dashboard template + the slash
 * "Layout dashboard" command) and its getDashboardMetrics() helper. Split out of
 * databaseViewCatalog because getDashboardMetrics() statically pulls
 * knownDatabaseState (and its ~458KB seed JSON) at parse time: keeping it here
 * means the pure layout primitives + the redesigned Home builder in
 * databaseViewCatalog stay seed-JSON-free, so the warm entry and the home-seed
 * chunk never carry the 458KB blob. Only the editor / slash-command paths (both
 * lazy) import this module.
 */

import type { Block, LayoutCell, LayoutMode } from "@/entities/block";
import { InlineDocument } from "@osionos/markdown-engine/inline";
import { loadKnownDatabaseState } from "./knownDatabaseState";
import {
  KNOWN_DATABASE_VIEWS,
  VIEW_TYPE_ICONS,
  getKnownDatabaseView,
  type KnownDatabaseId,
} from "./databaseViewCatalog.meta";
import {
  createDashboardCell,
  createDatabaseViewBlock,
  dashboardBlock,
  heading2,
  heading3,
  paragraph,
  stableDashboardId,
  stableDashboardCellId,
  stableDashboardBlockId,
  type LayoutPlacement,
  type ViewShowcaseOptions,
} from "./databaseViewCatalog";

interface DashboardMetrics {
  taskCount: number;
  projectCount: number;
  crmCount: number;
  contentCount: number;
  inventoryCount: number;
  productCount: number;
  completedTasks: number;
  blockedTasks: number;
  highPriorityTasks: number;
  urgentTasks: number;
  storyPoints: number;
  activeProjects: number;
  projectBudget: number;
  pipelineValue: number;
  inventoryValue: number;
  averageProductRating: number;
  productRevenuePotential: number;
  featuredProducts: number;
  approvedContent: number;
}

type KnownDatabaseState = ReturnType<typeof loadKnownDatabaseState>;
type KnownDatabasePage = KnownDatabaseState["pages"][string];

const CELL_PALETTE = [
  { backgroundColor: "color-mix(in srgb, #2563eb 7%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { backgroundColor: "color-mix(in srgb, #0f766e 10%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { backgroundColor: "color-mix(in srgb, #b45309 10%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { backgroundColor: "color-mix(in srgb, #be123c 8%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { backgroundColor: "color-mix(in srgb, #4d7c0f 9%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { backgroundColor: "color-mix(in srgb, #7c3aed 7%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
  { backgroundColor: "color-mix(in srgb, #0891b2 8%, var(--osio-bg-surface))", textColor: "var(--osio-fg-default)" },
];

const SHOWCASE_PLACEMENTS: LayoutPlacement[] = [
  { colStart: 1, colSpan: 4, rowStart: 1, rowSpan: 2 },
  { colStart: 5, colSpan: 3, rowStart: 1, rowSpan: 2 },
  { colStart: 8, colSpan: 2, rowStart: 1, rowSpan: 2 },
  { colStart: 10, colSpan: 3, rowStart: 1, rowSpan: 2 },
  { colStart: 1, colSpan: 6, rowStart: 3, rowSpan: 4 },
  { colStart: 7, colSpan: 6, rowStart: 3, rowSpan: 4 },
  { colStart: 1, colSpan: 8, rowStart: 7, rowSpan: 3 },
  { colStart: 9, colSpan: 4, rowStart: 7, rowSpan: 3 },
  { colStart: 1, colSpan: 4, rowStart: 10, rowSpan: 3 },
  { colStart: 5, colSpan: 4, rowStart: 10, rowSpan: 3 },
  { colStart: 9, colSpan: 4, rowStart: 10, rowSpan: 3 },
  { colStart: 1, colSpan: 4, rowStart: 13, rowSpan: 3 },
  { colStart: 5, colSpan: 4, rowStart: 13, rowSpan: 3 },
  { colStart: 9, colSpan: 4, rowStart: 13, rowSpan: 3 },
  { colStart: 1, colSpan: 4, rowStart: 16, rowSpan: 3 },
  { colStart: 5, colSpan: 8, rowStart: 16, rowSpan: 3 },
];

function createInlineDocumentPlaygroundExample(): string {
  const base = InlineDocument.fromSource("InlineDocument keeps formatted typing on the AST.");
  const formatted = base.applyFormatting({ start: 0, end: 14 }, {
    type: "toggle_format",
    format: "bold",
  });
  const edited = formatted.applyEdit({ start: 14, end: 14 }, {
    type: "insert_text",
    text: " handle",
  });
  return edited.doc.toSource();
}

function callout(content: string, icon: string, id?: string): Block {
  return dashboardBlock("callout", content, { color: icon, ...(id ? { id } : {}) });
}

function todo(content: string, checked = false, id?: string): Block {
  return dashboardBlock("to_do", content, { checked, ...(id ? { id } : {}) });
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 100000 ? 1 : 0,
    notation: value >= 100000 ? "compact" : "standard",
  }).format(value) + " USD";
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

// Built from the computed metrics: these sentences were typed by hand and drifted
// from the data ("3.64 average rating" against a computed 3.53).
function viewInsight(viewId: string, metrics: DashboardMetrics): string | undefined {
  switch (viewId) {
    case "v-proj-dashboard": return createInlineDocumentPlaygroundExample();
    case "v-tasks-board": return `The board shows ${plural(metrics.taskCount, "task")} moving across their statuses, with ${plural(metrics.blockedTasks, "blocked item")} that should not be buried in a table.`;
    case "v-proj-timeline": return `The timeline makes schedule pressure visible across ${plural(metrics.projectCount, "project")} before anyone opens a project record.`;
    case "v-proj-chart": return `Budget frames active work against ${money(metrics.projectBudget)} of committed project scope.`;
    case "v-crm-board": return `The CRM board tracks ${plural(metrics.crmCount, "account")} and ${money(metrics.pipelineValue)} of pipeline across its stages.`;
    case "v-content-calendar": return `The calendar turns ${plural(metrics.contentCount, "content item")} into a publishing rhythm that can sit beside product and project work.`;
    case "v-prod-analytics": return `Product analytics summarizes a ${metrics.productCount}-item catalog with a ${metrics.averageProductRating} average rating.`;
    case "v-inv-dashboard": return `Inventory connects ${plural(metrics.inventoryCount, "owned asset")} and ${money(metrics.inventoryValue)} of equipment value back to the project system.`;
    case "v-prod-table": return `The product table keeps the full ${metrics.productCount}-row catalog available when the dashboard needs exact inspection.`;
    case "v-tasks-list": return `The task list is the compact daily triage view: ${plural(metrics.storyPoints, "story point")}, ${plural(metrics.highPriorityTasks, "high-priority task")}, and ${plural(metrics.urgentTasks, "urgent task")}.`;
    default: return undefined;
  }
}

function pagesForDatabase(state: KnownDatabaseState, databaseId: KnownDatabaseId): KnownDatabasePage[] {
  return Object.values(state.pages).filter((page) => page.databaseId === databaseId);
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sumProperty(pages: KnownDatabasePage[], propertyId: string): number {
  return pages.reduce((total, page) => total + numeric(page.properties[propertyId]), 0);
}

function countProperty(pages: KnownDatabasePage[], propertyId: string, predicate: (value: unknown) => boolean): number {
  return pages.filter((page) => predicate(page.properties[propertyId])).length;
}

function productRatingValue(value: unknown): number {
  if (typeof value !== "string") return 0;
  const ratingMatch = /\d+(?:\.\d+)?/.exec(value);
  return ratingMatch ? Number(ratingMatch[0]) : 0;
}

function getDashboardMetrics(): DashboardMetrics {
  const state = loadKnownDatabaseState();
  const tasks = pagesForDatabase(state, "db-tasks");
  const projects = pagesForDatabase(state, "db-projects");
  const crm = pagesForDatabase(state, "db-crm");
  const content = pagesForDatabase(state, "db-content");
  const inventory = pagesForDatabase(state, "db-inventory");
  const products = pagesForDatabase(state, "db-products");
  const productRatings = products.map((page) => productRatingValue(page.properties["pp-rating"])).filter((rating) => rating > 0);

  return {
    taskCount: tasks.length,
    projectCount: projects.length,
    crmCount: crm.length,
    contentCount: content.length,
    inventoryCount: inventory.length,
    productCount: products.length,
    completedTasks: countProperty(tasks, "prop-done", Boolean),
    blockedTasks: countProperty(tasks, "prop-status", (status) => status === "opt-blocked"),
    highPriorityTasks: countProperty(tasks, "prop-priority", (priority) => priority === "pri-high"),
    urgentTasks: countProperty(tasks, "prop-priority", (priority) => priority === "pri-urgent"),
    storyPoints: sumProperty(tasks, "prop-points"),
    activeProjects: countProperty(projects, "proj-status", (status) => status === "ps-active"),
    projectBudget: sumProperty(projects, "proj-budget"),
    pipelineValue: sumProperty(crm, "prop-value"),
    inventoryValue: sumProperty(inventory, "prop-price"),
    averageProductRating: productRatings.length
      ? Number((productRatings.reduce((total, rating) => total + rating, 0) / productRatings.length).toFixed(2))
      : 0,
    productRevenuePotential: sumProperty(products, "pp-price"),
    featuredProducts: countProperty(products, "pp-featured", Boolean),
    approvedContent: countProperty(content, "prop-approved", Boolean),
  };
}

function createViewCell(
  viewId: string,
  metrics: DashboardMetrics,
  placement: LayoutPlacement,
  placementIndex: number,
  idScope: string,
  options: Partial<LayoutCell> = {},
): LayoutCell {
  const viewDefinition = getKnownDatabaseView(viewId) ?? KNOWN_DATABASE_VIEWS[0];
  const palette = CELL_PALETTE[placementIndex % CELL_PALETTE.length];
  const cellId = stableDashboardCellId(idScope, viewDefinition.id, placementIndex);

  return createDashboardCell(placement, {
    id: cellId,
    label: `${viewDefinition.databaseName} · ${viewDefinition.name}`,
    backgroundColor: palette.backgroundColor,
    textColor: palette.textColor,
    sizing: options.sizing ?? "fixed",
    verticalConstraint: options.verticalConstraint ?? "top",
    padding: options.padding ?? (viewDefinition.type === "dashboard" ? "compact" : "comfortable"),
    fontSize: options.fontSize ?? "base",
    blocks: [
      heading3(`${VIEW_TYPE_ICONS[viewDefinition.type]} ${viewDefinition.databaseName} · ${viewDefinition.name}`, stableDashboardBlockId(cellId, "heading")),
      paragraph(viewInsight(viewDefinition.id, metrics) ?? viewDefinition.description, stableDashboardBlockId(cellId, "insight")),
      createDatabaseViewBlock(viewDefinition.id, stableDashboardBlockId(cellId, "database")),
    ],
  });
}

function createHeroCell(placement: LayoutPlacement, metrics: DashboardMetrics, focusViewId: string, idScope: string): LayoutCell {
  const focusView = getKnownDatabaseView(focusViewId) ?? getKnownDatabaseView("v-prod-table") ?? KNOWN_DATABASE_VIEWS[0];
  const cellId = stableDashboardCellId(idScope, focusView.id, 0, "hero");
  return createDashboardCell(placement, {
    id: cellId,
    label: "Command center",
    backgroundColor: "color-mix(in srgb, #111827 6%, var(--osio-bg-surface))",
    textColor: "var(--osio-fg-default)",
    padding: "spacious",
    blocks: [
      heading2("Workspace command center", stableDashboardBlockId(cellId, "heading")),
      paragraph(`A cross-functional canvas built from live known database state: ${metrics.taskCount} tasks, ${metrics.projectCount} projects, ${metrics.crmCount} CRM accounts, ${metrics.contentCount} content items, ${metrics.inventoryCount} inventory assets, and ${metrics.productCount} product records.`, stableDashboardBlockId(cellId, "summary")),
      callout(`${money(metrics.projectBudget)} project budget, ${money(metrics.pipelineValue)} pipeline value and ${plural(metrics.storyPoints, "story point")} are visible without leaving Home. Featured /view: ${focusView.databaseName} · ${focusView.name}.`, "◈", stableDashboardBlockId(cellId, "callout")),
    ],
  });
}

function createWorkCell(placement: LayoutPlacement, metrics: DashboardMetrics, focusViewId: string, idScope: string): LayoutCell {
  const cellId = stableDashboardCellId(idScope, focusViewId, 1, "work");
  return createDashboardCell(placement, {
    id: cellId,
    label: "Daily triage",
    backgroundColor: "color-mix(in srgb, #0f766e 12%, var(--osio-bg-surface))",
    textColor: "var(--osio-fg-default)",
    padding: "spacious",
    blocks: [
      heading3("Today focus", stableDashboardBlockId(cellId, "heading")),
      paragraph(`${plural(metrics.highPriorityTasks, "high-priority task")}, ${plural(metrics.urgentTasks, "urgent task")}, ${plural(metrics.blockedTasks, "blocker")}, and ${plural(metrics.completedTasks, "completed item")} across ${plural(metrics.storyPoints, "story point")}.`, stableDashboardBlockId(cellId, "summary")),
    ],
  });
}

function createGrowthCell(placement: LayoutPlacement, metrics: DashboardMetrics, focusViewId: string, idScope: string): LayoutCell {
  const cellId = stableDashboardCellId(idScope, focusViewId, 2, "growth");
  return createDashboardCell(placement, {
    id: cellId,
    label: "Growth radar",
    backgroundColor: "color-mix(in srgb, #b45309 12%, var(--osio-bg-surface))",
    textColor: "var(--osio-fg-default)",
    padding: "spacious",
    blocks: [
      heading3("Growth radar", stableDashboardBlockId(cellId, "heading")),
      paragraph(`${money(metrics.pipelineValue)} pipeline value across ${metrics.crmCount} accounts and ${metrics.activeProjects} active projects.`, stableDashboardBlockId(cellId, "pipeline")),
      paragraph(`${plural(metrics.productCount, "product")}, ${metrics.averageProductRating} average rating, ${plural(metrics.featuredProducts, "featured product")}, and ${money(metrics.productRevenuePotential)} catalog list value.`, stableDashboardBlockId(cellId, "products")),
    ],
  });
}

function createLayoutLabCell(placement: LayoutPlacement, metrics: DashboardMetrics, focusViewId: string, idScope: string): LayoutCell {
  const cellId = stableDashboardCellId(idScope, focusViewId, 3, "coverage");
  return createDashboardCell(placement, {
    id: cellId,
    label: "Data coverage",
    backgroundColor: "color-mix(in srgb, #7c3aed 9%, var(--osio-bg-surface))",
    textColor: "var(--osio-fg-default)",
    blocks: [
      heading3("Data coverage", stableDashboardBlockId(cellId, "heading")),
      paragraph(createInlineDocumentPlaygroundExample(), stableDashboardBlockId(cellId, "inline-document")),
      paragraph(`The canvas mixes ${KNOWN_DATABASE_VIEWS.length} /view definitions across six databases, including dashboards, tables, boards, maps, feeds, timelines, charts, and calendars.`, stableDashboardBlockId(cellId, "coverage")),
      todo(`${metrics.approvedContent}/${metrics.contentCount} content pieces approved.`, metrics.approvedContent === metrics.contentCount, stableDashboardBlockId(cellId, "approved")),
      todo(`${money(metrics.inventoryValue)} inventory value connected to project work.`, true, stableDashboardBlockId(cellId, "inventory")),
    ],
  });
}

export function createViewShowcaseCells(focusViewId = "v-prod-table", options: ViewShowcaseOptions = {}): LayoutCell[] {
  const metrics = getDashboardMetrics();
  const focusView = getKnownDatabaseView(focusViewId)?.id ?? "v-prod-table";
  const idScope = options.idScope ?? stableDashboardId("showcase", focusView);
  const viewIds = [
    focusView,
    "v-prod-dashboard",
    "v-prod-analytics",
    "v-proj-dashboard",
    "v-tasks-board",
    "v-proj-timeline",
    "v-proj-chart",
    "v-tasks-list",
    "v-content-calendar",
    "v-prod-map",
    "v-prod-feed",
    "v-inv-dashboard",
    "v-crm-gallery",
  ].filter((viewId, index, viewList) => viewList.indexOf(viewId) === index);

  return [
    createHeroCell(SHOWCASE_PLACEMENTS[0], metrics, focusView, idScope),
    createWorkCell(SHOWCASE_PLACEMENTS[1], metrics, focusView, idScope),
    createGrowthCell(SHOWCASE_PLACEMENTS[2], metrics, focusView, idScope),
    createLayoutLabCell(SHOWCASE_PLACEMENTS[3], metrics, focusView, idScope),
    ...SHOWCASE_PLACEMENTS.slice(4).map((placement, index) => createViewCell(viewIds[index] ?? viewIds[0], metrics, placement, index + 4, idScope)),
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
      rows: 18,
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
