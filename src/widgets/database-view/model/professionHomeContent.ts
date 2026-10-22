/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   professionHomeContent.ts                           ::+      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Home dashboard of a profession. The Home page is client-local (it is never written
 * to the server), so this builder is its only representation: a vertical stack — a
 * greeting and a few titled sections — the same shape as createHomeLayoutContent, NOT a
 * full_page canvas.
 *
 * Every (databaseId, viewId) pair below exists in KNOWN_DATABASE_VIEWS; the registry is
 * the constraint, the test enforces it. A pair that is not in the registry renders an
 * empty embed, so a new section is only added with a registered view.
 */

import type { Block } from "@/entities/block";
import type { ProfessionId } from "@/data/professions/professions";
import { stableDashboardBlockId, stableDashboardCellId } from "./databaseViewCatalog";
import type { KnownDatabaseId } from "./databaseViewCatalog.meta";

interface ProfessionSection {
  /** Stable role: it is part of the block id, so a re-seed replaces the same block. */
  role: string;
  title: string;
  databaseId: KnownDatabaseId;
  viewId: string;
}

interface ProfessionHome {
  greeting: string;
  sections: ProfessionSection[];
}

const PROFESSION_HOMES: Record<ProfessionId, ProfessionHome> = {
  student: {
    greeting: "Happy studying",
    sections: [
      { role: "courses", title: "Courses", databaseId: "db-grades", viewId: "v-grades-table" },
      { role: "assignments", title: "Assignments", databaseId: "db-tasks", viewId: "v-tasks-board" },
      { role: "notes", title: "Study notes", databaseId: "db-wikifiles", viewId: "v-wiki-files-table" },
    ],
  },
  developer: {
    greeting: "Happy coding",
    sections: [
      { role: "projects", title: "Projects", databaseId: "db-projects", viewId: "v-proj-table" },
      { role: "tasks", title: "Tasks", databaseId: "db-tasks", viewId: "v-tasks-board" },
      { role: "docs", title: "Docs", databaseId: "db-wikifiles", viewId: "v-wiki-files-table" },
    ],
  },
  designer: {
    greeting: "Happy designing",
    sections: [
      { role: "portfolio", title: "Portfolio", databaseId: "db-inventory", viewId: "v-inv-gallery" },
      { role: "projects", title: "Projects", databaseId: "db-projects", viewId: "v-proj-board" },
      { role: "tasks", title: "Tasks", databaseId: "db-tasks", viewId: "v-tasks-list" },
    ],
  },
  "data-analyst": {
    greeting: "Happy analyzing",
    sections: [
      { role: "dashboards", title: "Dashboards", databaseId: "db-products", viewId: "v-prod-dashboard" },
      { role: "analytics", title: "Analytics", databaseId: "db-products", viewId: "v-prod-analytics" },
      { role: "datasets", title: "Datasets", databaseId: "db-inventory", viewId: "v-inv-table" },
    ],
  },
  researcher: {
    greeting: "Happy researching",
    sections: [
      { role: "sources", title: "Sources", databaseId: "db-wikifiles", viewId: "v-wiki-files-table" },
      { role: "milestones", title: "Milestones", databaseId: "db-milestones", viewId: "v-wiki-ms-table" },
      { role: "tasks", title: "Tasks", databaseId: "db-tasks", viewId: "v-tasks-list" },
    ],
  },
  creator: {
    greeting: "Happy creating",
    sections: [
      { role: "calendar", title: "Calendar", databaseId: "db-content", viewId: "v-content-calendar" },
      { role: "pipeline", title: "Pipeline", databaseId: "db-content", viewId: "v-content-board" },
      { role: "content", title: "Content", databaseId: "db-content", viewId: "v-content-table" },
    ],
  },
  founder: {
    greeting: "Happy building",
    sections: [
      { role: "roadmap", title: "Roadmap", databaseId: "db-projects", viewId: "v-proj-timeline" },
      { role: "milestones", title: "Milestones", databaseId: "db-milestones", viewId: "v-wiki-ms-board" },
      { role: "budget", title: "Budget", databaseId: "db-projects", viewId: "v-proj-chart" },
    ],
  },
  teacher: {
    greeting: "Happy teaching",
    sections: [
      { role: "classes", title: "Classes", databaseId: "db-grades", viewId: "v-grades-table" },
      { role: "assignments", title: "Assignments", databaseId: "db-tasks", viewId: "v-tasks-board" },
      { role: "materials", title: "Materials", databaseId: "db-wikifiles", viewId: "v-wiki-files-table" },
    ],
  },
};

/**
 * The Home content of a profession. The ids are scoped and stable, so a re-seed replaces
 * the same blocks instead of piling new ones up.
 */
export function createProfessionHomeContent(
  professionId: ProfessionId,
  options: { idScope: string },
): Block[] {
  const home = PROFESSION_HOMES[professionId];
  // The profession comes from the server (the stored pick), so the type is a promise, not
  // a guarantee: an unknown profession builds nothing instead of throwing.
  if (!home) return [];
  const blocks: Block[] = [
    { id: stableDashboardBlockId(options.idScope, "greeting"), type: "heading_1", content: home.greeting },
  ];
  home.sections.forEach((section, index) => {
    const cellId = stableDashboardCellId(options.idScope, "home", index + 2, section.role);
    blocks.push({ id: stableDashboardBlockId(cellId, "title"), type: "heading_2", content: section.title });
    blocks.push({
      id: stableDashboardBlockId(cellId, "db"),
      type: "database_inline",
      content: "",
      databaseId: section.databaseId,
      viewId: section.viewId,
      // Below the first section the embed is off-screen: mount it when it nears the
      // viewport, the same discipline as the Home's own sections.
      ...(index > 0 ? { deferMount: true } : {}),
    });
  });
  return blocks;
}
