import type { Block, LayoutCell, LayoutMode } from "@/entities/block";
import { loadKnownDatabaseState } from "./knownDatabaseState";

export type KnownDatabaseId =
  | "db-tasks"
  | "db-crm"
  | "db-content"
  | "db-inventory"
  | "db-products"
  | "db-projects";

export type KnownDatabaseViewType =
  | "table"
  | "board"
  | "gallery"
  | "list"
  | "timeline"
  | "calendar"
  | "chart"
  | "dashboard"
  | "map"
  | "feed";

export interface KnownDatabaseView {
  id: string;
  databaseId: KnownDatabaseId;
  databaseName: string;
  name: string;
  type: KnownDatabaseViewType;
  description: string;
  aliases: string[];
}

type LayoutPlacement = Pick<LayoutCell, "colStart" | "colSpan" | "rowStart" | "rowSpan">;

export const VIEW_TYPE_LABELS: Record<KnownDatabaseViewType, string> = {
  table: "Table",
  board: "Board",
  gallery: "Gallery",
  list: "List",
  timeline: "Timeline",
  calendar: "Calendar",
  chart: "Chart",
  dashboard: "Dashboard",
  map: "Map",
  feed: "Feed",
};

export const VIEW_TYPE_ICONS: Record<KnownDatabaseViewType, string> = {
  table: "▤",
  board: "▦",
  gallery: "▧",
  list: "☰",
  timeline: "↔",
  calendar: "◫",
  chart: "◔",
  dashboard: "◈",
  map: "⌖",
  feed: "≋",
};

export const KNOWN_DATABASE_VIEWS: KnownDatabaseView[] = [
  view("v-tasks-table", "db-tasks", "Tasks", "All Tasks", "table", "Task table with status, owner, dates, and project relation."),
  view("v-tasks-board", "db-tasks", "Tasks", "Board", "board", "Kanban-style task flow grouped by status."),
  view("v-tasks-timeline", "db-tasks", "Tasks", "Timeline", "timeline", "Task schedule across due dates and project phases."),
  view("v-tasks-list", "db-tasks", "Tasks", "List", "list", "Compact operational list for triage."),
  view("v-crm-table", "db-crm", "CRM", "All Contacts", "table", "Contact table with account stage and relationship fields."),
  view("v-crm-board", "db-crm", "CRM", "Pipeline", "board", "Pipeline board by lead stage."),
  view("v-crm-gallery", "db-crm", "CRM", "Gallery", "gallery", "Contact gallery for account scanning."),
  view("v-content-calendar", "db-content", "Content", "Calendar", "calendar", "Editorial calendar with scheduled publication dates."),
  view("v-content-table", "db-content", "Content", "Table", "table", "Content production table."),
  view("v-content-board", "db-content", "Content", "Board", "board", "Editorial board grouped by workflow stage."),
  view("v-inv-table", "db-inventory", "Inventory", "Assets", "table", "Inventory table for asset ownership and status."),
  view("v-inv-gallery", "db-inventory", "Inventory", "Gallery", "gallery", "Visual inventory gallery."),
  view("v-inv-chart", "db-inventory", "Inventory", "Chart", "chart", "Inventory chart view for stock and asset health."),
  view("v-inv-dashboard", "db-inventory", "Inventory", "Dashboard", "dashboard", "Inventory dashboard with aggregate widgets."),
  view("v-prod-table", "db-products", "Products", "All Products", "table", "Product catalog table."),
  view("v-prod-board", "db-products", "Products", "Stock Board", "board", "Product stock board grouped by operational status."),
  view("v-prod-gallery", "db-products", "Products", "Gallery", "gallery", "Product cards with visual catalog rhythm."),
  view("v-prod-list", "db-products", "Products", "List by Category", "list", "Product list organized by category."),
  view("v-prod-calendar", "db-products", "Products", "Release Calendar", "calendar", "Launch and release calendar."),
  view("v-prod-timeline", "db-products", "Products", "Timeline", "timeline", "Product roadmap timeline."),
  view("v-prod-chart", "db-products", "Products", "Price by Category", "chart", "Price chart by product category."),
  view("v-prod-feed", "db-products", "Products", "Feed", "feed", "Product activity and narrative feed."),
  view("v-prod-map", "db-products", "Products", "Warehouse Map", "map", "Warehouse and location map view."),
  view("v-prod-dashboard", "db-products", "Products", "Overview Dashboard", "dashboard", "Product overview dashboard."),
  view("v-prod-analytics", "db-products", "Products", "Analytics Dashboard", "dashboard", "Product analytics dashboard."),
  view("v-prod-formula-dash", "db-products", "Products", "Formula Analytics", "dashboard", "Formula analytics dashboard."),
  view("v-proj-table", "db-projects", "Projects", "All Projects", "table", "Project table with owners, dates, status, and budget."),
  view("v-proj-board", "db-projects", "Projects", "Board", "board", "Project status board."),
  view("v-proj-timeline", "db-projects", "Projects", "Timeline", "timeline", "Project timeline with schedule visibility."),
  view("v-proj-dashboard", "db-projects", "Projects", "Relation Analytics", "dashboard", "Relation analytics across projects, tasks, CRM, content, and inventory."),
  view("v-proj-chart", "db-projects", "Projects", "Budget Chart", "chart", "Project budget chart."),
];

export const HOME_DASHBOARD_PAGE_TITLE = "Workspace command center";
export const HOME_DASHBOARD_PAGE_ICON = "◈";

export function getHomeDashboardPageId(workspaceId: string): string {
  return `home-dashboard:${workspaceId}`;
}

export const SHOWCASE_VIEW_IDS = [
  "v-tasks-list",
  "v-prod-dashboard",
  "v-prod-analytics",
  "v-proj-dashboard",
  "v-tasks-board",
  "v-proj-timeline",
  "v-proj-chart",
  "v-content-calendar",
  "v-crm-board",
  "v-prod-map",
  "v-prod-feed",
  "v-inv-dashboard",
  "v-crm-gallery",
  "v-prod-table",
] as const;

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
  productStockUnits: number;
  featuredProducts: number;
  approvedContent: number;
}

type KnownDatabaseState = ReturnType<typeof loadKnownDatabaseState>;
type KnownDatabasePage = KnownDatabaseState["pages"][string];

const VIEW_INSIGHTS: Record<string, string> = {
  "v-proj-dashboard": "Relation analytics ties projects to tasks, accounts, content, and equipment so the page starts with connected truth.",
  "v-tasks-board": "The board shows 8 tasks moving across 5 statuses, with 1 blocked item that should not be buried in a table.",
  "v-proj-timeline": "The timeline makes schedule pressure visible across 8 projects before anyone opens a project record.",
  "v-proj-chart": "Budget is not just finance context here: it frames active work against 530K USD of committed project scope.",
  "v-crm-board": "The CRM board has one account in each major stage, making pipeline movement easy to scan.",
  "v-content-calendar": "The calendar turns 5 content items into a publishing rhythm that can sit beside product and project work.",
  "v-prod-analytics": "Product analytics summarizes a 300-item catalog, balanced across categories with a 3.64 average rating.",
  "v-prod-map": "The warehouse map gives spatial context to product operations instead of hiding location inside rows.",
  "v-prod-feed": "The feed gives the catalog a narrative pulse for launches, changes, and operational notes.",
  "v-inv-dashboard": "Inventory connects 5 owned assets and 5.6K USD of equipment value back to the project system.",
  "v-crm-gallery": "Gallery view is better for account recognition and stakeholder scanning than a dense CRM table.",
  "v-prod-table": "The product table keeps the full 300-row catalog available when the dashboard needs exact inspection.",
  "v-tasks-list": "The task list is the compact daily triage view: 47 story points, 3 high-priority tasks, and 1 urgent task.",
};

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

function view(
  id: string,
  databaseId: KnownDatabaseId,
  databaseName: string,
  name: string,
  type: KnownDatabaseViewType,
  description: string,
): KnownDatabaseView {
  return {
    id,
    databaseId,
    databaseName,
    name,
    type,
    description,
    aliases: [
      `view ${databaseName} ${name}`,
      `${databaseName} ${name} view`,
      `${VIEW_TYPE_LABELS[type]} view`,
      `${databaseName} ${VIEW_TYPE_LABELS[type]}`,
      id,
    ],
  };
}

export function getKnownDatabaseView(viewId: string): KnownDatabaseView | undefined {
  return KNOWN_DATABASE_VIEWS.find((viewDefinition) => viewDefinition.id === viewId);
}

export function createDatabaseViewBlock(viewId: string): Block {
  const viewDefinition = getKnownDatabaseView(viewId) ?? KNOWN_DATABASE_VIEWS[0];
  return {
    id: crypto.randomUUID(),
    type: "database_inline",
    content: "",
    databaseId: viewDefinition.databaseId,
    viewId: viewDefinition.id,
  };
}

function dashboardBlock(type: Block["type"], content: string, extra: Partial<Block> = {}): Block {
  return {
    id: crypto.randomUUID(),
    type,
    content,
    ...extra,
  };
}

function heading2(content: string): Block {
  return dashboardBlock("heading_2", content);
}

function heading3(content: string): Block {
  return dashboardBlock("heading_3", content);
}

function paragraph(content: string): Block {
  return dashboardBlock("paragraph", content);
}

function callout(content: string, icon: string): Block {
  return dashboardBlock("callout", content, { color: icon });
}

function todo(content: string, checked = false): Block {
  return dashboardBlock("to_do", content, { checked });
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 100000 ? 1 : 0,
    notation: value >= 100000 ? "compact" : "standard",
  }).format(value) + " USD";
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
    productStockUnits: sumProperty(products, "pp-stock-qty"),
    featuredProducts: countProperty(products, "pp-featured", Boolean),
    approvedContent: countProperty(content, "prop-approved", Boolean),
  };
}

function summarizeCellContent(blocks: Block[]): string {
  return blocks
    .map((block) => block.content)
    .filter((content) => content.trim().length > 0)
    .join("\n");
}

function createDashboardCell(
  placement: LayoutPlacement,
  options: Pick<LayoutCell, "label" | "blocks" | "backgroundColor" | "textColor"> & Partial<LayoutCell>,
): LayoutCell {
  const blocks = options.blocks ?? [];
  return {
    id: crypto.randomUUID(),
    ...placement,
    label: options.label,
    type: "text",
    content: summarizeCellContent(blocks),
    blocks,
    sizing: options.sizing ?? "auto-height",
    horizontalConstraint: options.horizontalConstraint ?? (placement.colSpan >= 6 ? "stretch" : "scale"),
    verticalConstraint: options.verticalConstraint ?? "hug",
    wrap: options.wrap !== false,
    padding: options.padding ?? "comfortable",
    fontSize: options.fontSize ?? "base",
    backgroundColor: options.backgroundColor,
    textColor: options.textColor,
  };
}

function createViewCell(
  viewId: string,
  placement: LayoutPlacement,
  paletteIndex: number,
  options: Partial<LayoutCell> = {},
): LayoutCell {
  const viewDefinition = getKnownDatabaseView(viewId) ?? KNOWN_DATABASE_VIEWS[0];
  const palette = CELL_PALETTE[paletteIndex % CELL_PALETTE.length];

  return createDashboardCell(placement, {
    label: `${viewDefinition.databaseName} · ${viewDefinition.name}`,
    backgroundColor: palette.backgroundColor,
    textColor: palette.textColor,
    sizing: options.sizing ?? "fixed",
    verticalConstraint: options.verticalConstraint ?? "top",
    padding: options.padding ?? (viewDefinition.type === "dashboard" ? "compact" : "comfortable"),
    fontSize: options.fontSize ?? "base",
    blocks: [
      heading3(`${VIEW_TYPE_ICONS[viewDefinition.type]} ${viewDefinition.databaseName} · ${viewDefinition.name}`),
      paragraph(VIEW_INSIGHTS[viewDefinition.id] ?? viewDefinition.description),
      createDatabaseViewBlock(viewDefinition.id),
    ],
  });
}

function createHeroCell(placement: LayoutPlacement, metrics: DashboardMetrics, focusViewId: string): LayoutCell {
  const focusView = getKnownDatabaseView(focusViewId) ?? getKnownDatabaseView("v-prod-table") ?? KNOWN_DATABASE_VIEWS[0];
  return createDashboardCell(placement, {
    label: "Command center",
    backgroundColor: "color-mix(in srgb, #111827 6%, var(--osio-bg-surface))",
    textColor: "var(--osio-fg-default)",
    padding: "spacious",
    blocks: [
      heading2("Workspace command center"),
      paragraph(`A cross-functional canvas built from live known database state: ${metrics.taskCount} tasks, ${metrics.projectCount} projects, ${metrics.crmCount} CRM accounts, ${metrics.contentCount} content items, ${metrics.inventoryCount} inventory assets, and ${metrics.productCount} product records.`),
      callout(`${money(metrics.projectBudget)} project budget, ${money(metrics.pipelineValue)} pipeline value, ${metrics.storyPoints} story points, and ${metrics.productStockUnits.toLocaleString()} product units are visible without leaving Home. Featured /view: ${focusView.databaseName} · ${focusView.name}.`, "◈"),
    ],
  });
}

function createWorkCell(placement: LayoutPlacement, metrics: DashboardMetrics): LayoutCell {
  return createDashboardCell(placement, {
    label: "Daily triage",
    backgroundColor: "color-mix(in srgb, #0f766e 12%, var(--osio-bg-surface))",
    textColor: "var(--osio-fg-default)",
    padding: "spacious",
    blocks: [
      heading3("Today focus"),
      paragraph(`${metrics.highPriorityTasks} high-priority tasks, ${metrics.urgentTasks} urgent task, ${metrics.blockedTasks} blocker, and ${metrics.completedTasks} completed item across ${metrics.storyPoints} story points.`),
    ],
  });
}

function createGrowthCell(placement: LayoutPlacement, metrics: DashboardMetrics): LayoutCell {
  return createDashboardCell(placement, {
    label: "Growth radar",
    backgroundColor: "color-mix(in srgb, #b45309 12%, var(--osio-bg-surface))",
    textColor: "var(--osio-fg-default)",
    padding: "spacious",
    blocks: [
      heading3("Growth radar"),
      paragraph(`${money(metrics.pipelineValue)} pipeline value across ${metrics.crmCount} accounts and ${metrics.activeProjects} active projects.`),
      paragraph(`${metrics.productCount} products, ${metrics.averageProductRating} average rating, ${metrics.featuredProducts} featured products, and ${money(metrics.productRevenuePotential)} catalog value.`),
    ],
  });
}

function createLayoutLabCell(placement: LayoutPlacement, metrics: DashboardMetrics): LayoutCell {
  return createDashboardCell(placement, {
    label: "Data coverage",
    backgroundColor: "color-mix(in srgb, #7c3aed 9%, var(--osio-bg-surface))",
    textColor: "var(--osio-fg-default)",
    blocks: [
      heading3("Data coverage"),
      paragraph(`The canvas mixes ${KNOWN_DATABASE_VIEWS.length} /view definitions across six databases, including dashboards, tables, boards, maps, feeds, timelines, charts, and calendars.`),
      todo(`${metrics.approvedContent}/${metrics.contentCount} content pieces approved.`, metrics.approvedContent === metrics.contentCount),
      todo(`${money(metrics.inventoryValue)} inventory value connected to project work.`, true),
    ],
  });
}

export function createViewShowcaseCells(focusViewId = "v-prod-table"): LayoutCell[] {
  const metrics = getDashboardMetrics();
  const focusView = getKnownDatabaseView(focusViewId)?.id ?? "v-prod-table";
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
    createHeroCell(SHOWCASE_PLACEMENTS[0], metrics, focusView),
    createWorkCell(SHOWCASE_PLACEMENTS[1], metrics),
    createGrowthCell(SHOWCASE_PLACEMENTS[2], metrics),
    createLayoutLabCell(SHOWCASE_PLACEMENTS[3], metrics),
    ...SHOWCASE_PLACEMENTS.slice(4).map((placement, index) => createViewCell(viewIds[index] ?? viewIds[0], placement, index)),
  ];
}

export function createViewShowcaseLayout(mode: LayoutMode, focusViewId?: string): Block {
  return {
    id: crypto.randomUUID(),
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
    layoutCells: createViewShowcaseCells(focusViewId),
  };
}

export function createViewShowcaseLayoutContent(mode: LayoutMode, focusViewId?: string): Block[] {
  return [createViewShowcaseLayout(mode, focusViewId)];
}
