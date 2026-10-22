/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   turnIntoDashboard.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * "Turn this page into a dashboard": one full-page layout band dropped in
 * front of the page's blocks, carrying the shared canvas "Dashboard" template.
 *
 * The cells come from createViewShowcaseCells — the very definition the canvas
 * templates menu uses — so the two paths cannot drift. P4-1's `sys:` sources
 * (the user's own data) replace those template cells later.
 *
 * The cells embed LIVE database views, never copied rows: a reader of the page
 * sees what the view's own data rules allow, so the dashboard never widens a
 * read rule.
 *
 * The template module pulls the seed-database state, which is browser-only (a
 * 600KB seed blob plus the object-database store): it is imported ON DEMAND and
 * its cells are handed to the pure builder below. That keeps this module
 * loadable outside a browser (the canvas unit tests import it) and keeps the
 * seed blob out of the warm page-header chunk.
 */

import type { Block, LayoutCell, LayoutConfig } from "@/entities/block";
import type { PageEntry } from "@/entities/page";
import { stableDashboardId } from "@/widgets/database-view/model/databaseViewCatalog";

/** The view the dashboard opens on (the product table of the seed databases). */
const DASHBOARD_FOCUS_VIEW = "v-prod-table";

/** The dashboard band's grid: 12 columns, 96px rows, 16px gutters, no
 *  auto-arrange (the cells keep the places the template gave them). `preview`
 *  stays off — a dashboard is edited, not presented. */
const DASHBOARD_LAYOUT_CONFIG: Partial<LayoutConfig> = {
  columns: 12,
  rows: 18,
  rowHeight: 96,
  gap: 16,
  wrap: true,
  autoArrange: false,
  snapToGrid: true,
  guideVisibility: "auto",
  preview: false,
  theme: "spacious",
};

function isHeaderBand(block: Block): boolean {
  return block.type === "layout" && block.layoutRole === "header";
}

/**
 * The dashboard band for `page`: one layout block the page's own blocks flow
 * below. Pure — the same page and cells always give the same block, so the
 * action can run twice without changing the page.
 */
export function turnIntoDashboard(page: PageEntry, cells: LayoutCell[]): Block {
  return {
    id: stableDashboardId("dashboard", page._id),
    type: "layout",
    content: "",
    layoutMode: "full_page",
    layoutRole: "header",
    layoutConfig: { ...DASHBOARD_LAYOUT_CONFIG },
    layoutCells: [...cells],
  };
}

/**
 * The page's content with the dashboard in front. An existing header band is
 * REPLACED — the action never stacks two dashboards — and every other block
 * keeps flowing below the new band.
 */
export function turnIntoDashboardContent(page: PageEntry, cells: LayoutCell[]): Block[] {
  const rest = (page.content ?? []).filter((block) => !isHeaderBand(block));
  return [turnIntoDashboard(page, cells), ...rest];
}

/**
 * The dashboard template's cells for `pageId`. The template's cell ids are
 * page-scoped, so one page's dashboard keeps its cells across reloads while
 * another page's dashboard never collides with it.
 */
export async function loadDashboardCells(pageId: string): Promise<LayoutCell[]> {
  const { createViewShowcaseCells } = await import("@/widgets/database-view/model/databaseViewShowcase");
  return createViewShowcaseCells(DASHBOARD_FOCUS_VIEW, { idScope: stableDashboardId("dashboard", pageId) });
}

/**
 * The surfaces that can become a dashboard: an ordinary page, an agent, Home or
 * a page with no surface at all. A folder, a wiki, a code file and an app page
 * keep their own surface semantics. A locked page is read-only.
 */
export function canTurnIntoDashboard(page: Pick<PageEntry, "surface"> | undefined, locked: boolean): boolean {
  if (locked) return false;
  const surface = page?.surface;
  return surface === undefined || surface === "page" || surface === "agent" || surface === "home";
}
