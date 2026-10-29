/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseViewCatalog.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block, LayoutCell } from "@/entities/block";
import {
  KNOWN_DATABASE_VIEWS,
  getKnownDatabaseView,
} from "./databaseViewCatalog.meta";
import {
  RECENTS_DB_ID,
  RECENTS_GALLERY_VIEW,
  TEMPLATES_DB_ID,
  TEMPLATES_GALLERY_VIEW,
} from "./workspaceDatabaseConstants";

// Pure view metadata (ids, labels, registry) lives in the .meta module so
// warm-path consumers can import it without any seed-state dependency.
// Re-exported here to keep every existing import site working.
//
// This module is itself seed-JSON-FREE: it holds the pure layout primitives
// and the redesigned Home builder (createHomeLayout). The /dashboard showcase
// builders (createViewShowcaseCells/Layout/LayoutContent) live in
// ./databaseViewShowcase — imported only by the lazy editor / slash-command
// paths.
export * from "./databaseViewCatalog.meta";
// The Events + Learn demo seed lives in its own module to avoid a circular
// import with knownDatabaseState; re-exported so existing call sites resolve.
export { applyHomeDemoSeed } from "./homeDemoSeed";

export type LayoutPlacement = Pick<LayoutCell, "colStart" | "colSpan" | "rowStart" | "rowSpan">;

export interface ViewShowcaseOptions {
  idScope?: string;
}

export function stableDashboardId(...parts: Array<number | string | null | undefined>): string {
  return parts
    .filter((part) => part !== null && part !== undefined && String(part).trim().length > 0)
    .map((part) => String(part).trim().toLowerCase().replaceAll(/[^a-z0-9_-]+/g, "-"))
    .join("-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

export function stableDashboardCellId(idScope: string, viewId: string, placementIndex: number, role?: string): string {
  return stableDashboardId(idScope, "cell", placementIndex, viewId, role);
}

export function stableDashboardBlockId(cellId: string, role: string): string {
  return stableDashboardId(cellId, "block", role);
}

export function createDatabaseViewBlock(viewId: string, id?: string): Block {
  const viewDefinition = getKnownDatabaseView(viewId) ?? KNOWN_DATABASE_VIEWS[0];
  return {
    id: id ?? crypto.randomUUID(),
    type: "database_inline",
    content: "",
    databaseId: viewDefinition.databaseId,
    viewId: viewDefinition.id,
  };
}

export function dashboardBlock(type: Block["type"], content: string, extra: Partial<Block> = {}): Block {
  return {
    ...extra,
    id: extra.id ?? crypto.randomUUID(),
    type,
    content,
  };
}

export function heading2(content: string, id?: string): Block {
  return dashboardBlock("heading_2", content, id ? { id } : {});
}

export function heading3(content: string, id?: string): Block {
  return dashboardBlock("heading_3", content, id ? { id } : {});
}

export function paragraph(content: string, id?: string): Block {
  return dashboardBlock("paragraph", content, id ? { id } : {});
}

function summarizeCellContent(blocks: Block[]): string {
  return blocks
    .map((block) => block.content)
    .filter((content) => content.trim().length > 0)
    .join("\n");
}

export function createDashboardCell(
  placement: LayoutPlacement,
  options: Pick<LayoutCell, "label" | "blocks" | "backgroundColor" | "textColor"> & Partial<LayoutCell>,
): LayoutCell {
  const blocks = options.blocks ?? [];
  return {
    id: options.id ?? crypto.randomUUID(),
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

// ─── Default Home canvas ─────────────────────────────────────────────────────
// The redesigned Home (surface:"home" layout-block page). A single full-width
// column of NDS-backed sections — greeting, Recently visited (carousel), Learn
// (carousel), Upcoming events (list), Home views (launcher), Featured templates
// (carousel) — mirroring screenshots/home.png. Seeded by MainContent; bump
// HOME_DASHBOARD_VERSION there so existing users re-seed. Below-the-fold
// sections carry `deferMount` so ReadOnlyBlock only mounts them near-viewport.

/** Time-of-day greeting, computed when the page is (re)seeded — see note in
 *  createHomeDashboardPage: it is NOT continuously live through the day. */
function homeGreeting(name?: string, now: Date = new Date()): string {
  const hour = now.getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const greeting = `Good ${part}`;
  return name && name.trim() ? `${greeting}, ${name.trim()}` : greeting;
}

function heading1(content: string, id: string): Block {
  return dashboardBlock("heading_1", content, { id });
}

function databaseInlineBlock(databaseId: string, viewId: string, id: string, deferMount = false): Block {
  return { id, type: "database_inline", content: "", databaseId, viewId, ...(deferMount ? { deferMount: true } : {}) };
}

interface HomeSection {
  role: string;
  rowStart: number;
  title?: string;
  body: (cellId: string) => Block;
}

/** One column of the Home actions row: a `/button` whose program runs one app action. */
function homeButton(cellId: string, role: string, label: string, variant: "primary" | "secondary",
  action: string, args: Record<string, string>): Block {
  return { id: stableDashboardBlockId(cellId, `column-${role}`), type: "column", content: "", widthRatio: 1 / 3, children: [{
    id: stableDashboardBlockId(cellId, `button-${role}`), type: "button", content: "", buttonLabel: label, buttonVariant: variant,
    buttonProgram: { version: 1, steps: [{ op: "action", action: { type: "app_action", name: action, args } }] },
  }] };
}

const HOME_SECTIONS: HomeSection[] = [
  { role: "actions", rowStart: 2,
    body: (cellId) => ({ id: stableDashboardBlockId(cellId, "buttons"), type: "column_list", content: "", children: [
      homeButton(cellId, "new-page", "New page", "primary", "page.create", {}),
      homeButton(cellId, "preferences", "Preferences", "secondary", "settings.open", { section: "preferences" }),
      homeButton(cellId, "edit-profile", "Edit profile", "secondary", "settings.open", { section: "profile" }),
    ] }) },
  { role: "tasks", rowStart: 3, title: "Your tasks",
    body: (cellId) => databaseInlineBlock("sys:my-tasks", "my-tasks-home-dashboard", stableDashboardBlockId(cellId, "db")) },
  { role: "pages", rowStart: 4, title: "Your pages",
    body: (cellId) => databaseInlineBlock("sys:my-pages", "my-pages-home-dashboard", stableDashboardBlockId(cellId, "db")) },
  { role: "people", rowStart: 5, title: "Your people",
    body: (cellId) => databaseInlineBlock("sys:my-connections", "my-connections-home-dashboard", stableDashboardBlockId(cellId, "db")) },
  { role: "workspaces", rowStart: 6, title: "Your workspaces",
    body: (cellId) => databaseInlineBlock("sys:my-workspaces", "my-workspaces-home-dashboard", stableDashboardBlockId(cellId, "db")) },
  { role: "recents", rowStart: 7, title: "Recently visited",
    body: (cellId) => databaseInlineBlock(RECENTS_DB_ID, RECENTS_GALLERY_VIEW, stableDashboardBlockId(cellId, "db")) },
  { role: "templates", rowStart: 8, title: "Featured templates",
    body: (cellId) => databaseInlineBlock(TEMPLATES_DB_ID, TEMPLATES_GALLERY_VIEW, stableDashboardBlockId(cellId, "db"), true) },
];

const HOME_FULL_WIDTH: LayoutPlacement = { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1 };

function homeCell(section: HomeSection, idScope: string): LayoutCell {
  const cellId = stableDashboardCellId(idScope, "home", section.rowStart, section.role);
  const blocks: Block[] = [];
  if (section.title) blocks.push(heading2(section.title, stableDashboardBlockId(cellId, "title")));
  blocks.push(section.body(cellId));
  return createDashboardCell(
    { ...HOME_FULL_WIDTH, rowStart: section.rowStart },
    { id: cellId, blocks, horizontalConstraint: "stretch", verticalConstraint: "hug", padding: "comfortable" },
  );
}

export function createHomeLayout(greetingName?: string, options: ViewShowcaseOptions = {}): Block {
  const idScope = options.idScope ?? stableDashboardId("home", crypto.randomUUID());
  const greetingCellId = stableDashboardCellId(idScope, "home", 1, "greeting");
  const greetingCell = createDashboardCell(
    { ...HOME_FULL_WIDTH },
    {
      id: greetingCellId,
      blocks: [heading1(homeGreeting(greetingName), stableDashboardBlockId(greetingCellId, "greeting"))],
      horizontalConstraint: "stretch",
      verticalConstraint: "hug",
      padding: "comfortable",
    },
  );
  return {
    id: stableDashboardId(idScope, "home", "layout"),
    type: "layout",
    content: "",
    layoutMode: "full_page",
    layoutConfig: {
      columns: 12,
      rows: HOME_SECTIONS.length + 1,
      gap: 16,
      rowHeight: 56,
      wrap: true,
      autoArrange: false,
      snapToGrid: true,
      guideVisibility: "auto",
      preview: false,
      theme: "default",
    },
    layoutCells: [greetingCell, ...HOME_SECTIONS.map((section) => homeCell(section, idScope))],
  };
}

export function createHomeLayoutContent(greetingName?: string, options: ViewShowcaseOptions = {}): Block[] {
  // A plain vertical document stack (greeting → titled NDS sections), NOT a
  // full_page canvas: the canvas pinned every section at a fixed 72px-pitch y
  // while each grew to 300–560px, so they all overlapped. Normal block flow
  // stacks them with natural rhythm and cannot overlap — matching the reference.
  const idScope = options.idScope ?? stableDashboardId("home", "content");
  const blocks: Block[] = [
    heading1(homeGreeting(greetingName), stableDashboardBlockId(idScope, "greeting")),
  ];
  for (const section of HOME_SECTIONS) {
    const scope = stableDashboardCellId(idScope, "home", section.rowStart, section.role);
    if (section.title) blocks.push(heading2(section.title, stableDashboardBlockId(scope, "title")));
    blocks.push(section.body(scope));
  }
  return blocks;
}
