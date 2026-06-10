/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseViewCatalog.meta.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pure metadata for the known database views: ids, labels, icons, and the
 * view registry. Deliberately free of any import of the database STATE
 * (knownDatabaseState eagerly parses the ~600KB seed JSON) so warm-path
 * consumers (MainContent, HomeTabView) can read view identity without
 * shipping the seed data. The showcase/dashboard builders that DO need the
 * state live in databaseViewCatalog.ts, which re-exports this module.
 */

export type KnownDatabaseId =
  | "db-tasks"
  | "db-crm"
  | "db-content"
  | "db-inventory"
  | "db-products"
  | "db-projects"
  | "db-milestones"
  | "db-wikifiles";

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
  // Delivery Wiki (wikiSeed.ts): Milestones ↔ Files with relation-filtered views.
  view("v-wiki-ms-table", "db-milestones", "Milestones", "All Milestones", "table", "Milestones with rollups (file count, total KB) and health formulas."),
  view("v-wiki-ms-board", "db-milestones", "Milestones", "By Status", "board", "Milestone board grouped by delivery status."),
  view("v-wiki-ms-timeline", "db-milestones", "Milestones", "Roadmap", "timeline", "Milestone roadmap from start to due date."),
  view("v-wiki-files-table", "db-wikifiles", "Files", "All Files", "table", "The workspace filesystem — every artifact with source, size, and age."),
  view("v-wiki-files-gallery", "db-wikifiles", "Files", "Collection", "gallery", "Gallery collection of every file card."),
  view("v-wiki-files-board", "db-wikifiles", "Files", "By Source", "board", "Files grouped by source (notes, docs, images, datasets)."),
  view("v-wiki-files-calendar", "db-wikifiles", "Files", "Activity Calendar", "calendar", "Files plotted on their last-modified date."),
  view("v-wiki-files-pinned", "db-wikifiles", "Files", "Pinned", "list", "Pinned files only (checkbox filter)."),
  view("v-wiki-notes-venus", "db-wikifiles", "Files", "Notes — Venus", "table", "Only the NOTES related to the Venus milestone (relation + select filter)."),
  view("v-wiki-notes-mars", "db-wikifiles", "Files", "Notes — Mars", "table", "Only the NOTES related to the Mars milestone (relation + select filter)."),
];

export function getKnownDatabaseView(viewId: string): KnownDatabaseView | undefined {
  return KNOWN_DATABASE_VIEWS.find((viewDefinition) => viewDefinition.id === viewId);
}

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
