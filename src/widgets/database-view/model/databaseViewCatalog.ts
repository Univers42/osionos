import type { Block, LayoutCell, LayoutMode } from "@/entities/block";

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

const DASHBOARD_METRICS = {
  taskCount: 8,
  projectCount: 8,
  crmCount: 6,
  contentCount: 5,
  inventoryCount: 5,
  productCount: 300,
  completedTasks: 1,
  blockedTasks: 1,
  highPriorityTasks: 3,
  urgentTasks: 1,
  storyPoints: 47,
  activeProjects: 3,
  projectBudget: 530000,
  pipelineValue: 560000,
  inventoryValue: 5588,
  averageProductRating: 3.64,
  productRevenuePotential: 15678.96,
};

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
  const isDenseView = viewDefinition.type === "table" || viewDefinition.type === "timeline" || viewDefinition.type === "list";

  return createDashboardCell(placement, {
    label: `${viewDefinition.databaseName} · ${viewDefinition.name}`,
    backgroundColor: palette.backgroundColor,
    textColor: palette.textColor,
    sizing: options.sizing ?? (isDenseView ? "fixed" : "auto-height"),
    verticalConstraint: options.verticalConstraint ?? (isDenseView ? "top" : "hug"),
    padding: options.padding ?? (viewDefinition.type === "dashboard" ? "compact" : "comfortable"),
    fontSize: options.fontSize ?? "base",
    blocks: [
      heading3(`${VIEW_TYPE_ICONS[viewDefinition.type]} ${viewDefinition.databaseName} · ${viewDefinition.name}`),
      paragraph(VIEW_INSIGHTS[viewDefinition.id] ?? viewDefinition.description),
      createDatabaseViewBlock(viewDefinition.id),
    ],
  });
}

function createHeroCell(placement: LayoutPlacement): LayoutCell {
  return createDashboardCell(placement, {
    label: "Command center",
    backgroundColor: "color-mix(in srgb, #111827 6%, var(--osio-bg-surface))",
    textColor: "var(--osio-fg-default)",
    padding: "spacious",
    blocks: [
      heading2("Workspace command center"),
      paragraph(`A cross-functional home dashboard built from the real seeded workspace: ${DASHBOARD_METRICS.taskCount} tasks, ${DASHBOARD_METRICS.projectCount} projects, ${DASHBOARD_METRICS.crmCount} CRM accounts, ${DASHBOARD_METRICS.contentCount} content items, ${DASHBOARD_METRICS.inventoryCount} inventory assets, and ${DASHBOARD_METRICS.productCount} products.`),
      callout(`${money(DASHBOARD_METRICS.projectBudget)} project budget, ${money(DASHBOARD_METRICS.pipelineValue)} pipeline value, and ${DASHBOARD_METRICS.storyPoints} story points are visible without locking the page to a single database.`, "◈"),
    ],
  });
}

function createWorkCell(placement: LayoutPlacement): LayoutCell {
  return createDashboardCell(placement, {
    label: "Daily triage",
    backgroundColor: "color-mix(in srgb, #0f766e 12%, var(--osio-bg-surface))",
    textColor: "var(--osio-fg-default)",
    padding: "spacious",
    blocks: [
      heading3("Today focus"),
      paragraph(`${DASHBOARD_METRICS.highPriorityTasks} high-priority tasks, ${DASHBOARD_METRICS.urgentTasks} urgent task, ${DASHBOARD_METRICS.blockedTasks} blocker, and ${DASHBOARD_METRICS.completedTasks} completed item.`),
    ],
  });
}

function createGrowthCell(placement: LayoutPlacement): LayoutCell {
  return createDashboardCell(placement, {
    label: "Growth radar",
    backgroundColor: "color-mix(in srgb, #b45309 12%, var(--osio-bg-surface))",
    textColor: "var(--osio-fg-default)",
    padding: "spacious",
    blocks: [
      heading3("Growth radar"),
      paragraph(`${money(DASHBOARD_METRICS.pipelineValue)} pipeline value across ${DASHBOARD_METRICS.crmCount} accounts.`),
      paragraph(`${DASHBOARD_METRICS.productCount} products, ${DASHBOARD_METRICS.averageProductRating} average rating, ${money(DASHBOARD_METRICS.productRevenuePotential)} catalog value.`),
    ],
  });
}

function createLayoutLabCell(placement: LayoutPlacement): LayoutCell {
  return createDashboardCell(placement, {
    label: "Layout pressure",
    backgroundColor: "color-mix(in srgb, #7c3aed 9%, var(--osio-bg-surface))",
    textColor: "var(--osio-fg-default)",
    blocks: [
      heading3("Layout pressure"),
      paragraph("This home page intentionally mixes dense tables, boards, maps, feeds, timelines, charts, and dashboards so the canvas shows its strengths and its constraints in one editable surface."),
      todo("Dense data needs fixed cells with scroll.", false),
      todo("Narrative views work better with hug height.", true),
    ],
  });
}

export function createViewShowcaseCells(): LayoutCell[] {
  return [
    createHeroCell(SHOWCASE_PLACEMENTS[0]),
    createWorkCell(SHOWCASE_PLACEMENTS[1]),
    createGrowthCell(SHOWCASE_PLACEMENTS[2]),
    createLayoutLabCell(SHOWCASE_PLACEMENTS[3]),
    createViewCell("v-proj-dashboard", SHOWCASE_PLACEMENTS[4], 0),
    createViewCell("v-tasks-board", SHOWCASE_PLACEMENTS[5], 1),
    createViewCell("v-proj-timeline", SHOWCASE_PLACEMENTS[6], 2),
    createViewCell("v-proj-chart", SHOWCASE_PLACEMENTS[7], 3),
    createViewCell("v-tasks-list", SHOWCASE_PLACEMENTS[8], 4),
    createViewCell("v-content-calendar", SHOWCASE_PLACEMENTS[9], 5),
    createViewCell("v-prod-analytics", SHOWCASE_PLACEMENTS[10], 6),
    createViewCell("v-prod-map", SHOWCASE_PLACEMENTS[11], 0),
    createViewCell("v-prod-feed", SHOWCASE_PLACEMENTS[12], 1),
    createViewCell("v-inv-dashboard", SHOWCASE_PLACEMENTS[13], 2),
    createViewCell("v-crm-gallery", SHOWCASE_PLACEMENTS[14], 3),
    createViewCell("v-prod-table", SHOWCASE_PLACEMENTS[15], 4),
  ];
}

export function createViewShowcaseLayout(mode: LayoutMode): Block {
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
    layoutCells: createViewShowcaseCells(),
  };
}

export function createViewShowcaseLayoutContent(mode: LayoutMode): Block[] {
  return [createViewShowcaseLayout(mode)];
}
