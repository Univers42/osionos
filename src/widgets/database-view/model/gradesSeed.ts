/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   gradesSeed.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ─── Grades demo seed: a single self-computing grade-calculator database ─────
// One small NDS database the Grade Calculator template embeds. Each row is a
// course component with a Weight (percent) and a Score (0–100); the Weighted
// column is a FORMULA property (weight * score / 100) so the math stays live.
// Merged into the known-database snapshot by knownDatabaseState's seedSnapshot
// via applyGradesSeed(state) — additive, mirrors applyHomeDemoSeed/applyWikiSeed.
//
// Lives in its OWN module (not databaseViewCatalog.ts) to avoid a circular
// import with knownDatabaseState. It imports only contract-types + the pure
// .meta ids.

import type { DatabaseSchema, NotionState, Page, ViewConfig } from "@notion-db/contract-types";
import { GRADES_DB_ID, GRADES_TABLE_VIEW_ID } from "./databaseViewCatalog.meta";

const GRADES_STAMP = "2026-06-26T09:00:00.000Z";

const gradesSchema: DatabaseSchema = {
  id: GRADES_DB_ID,
  name: "Grades",
  icon: "🧮",
  description: "Course components, their weight, and your score — the weighted total computes itself.",
  titlePropertyId: "gr-name",
  properties: {
    "gr-name": { id: "gr-name", name: "Component", type: "title" },
    "gr-weight": { id: "gr-weight", name: "Weight", type: "number" },
    "gr-score": { id: "gr-score", name: "Score", type: "number" },
    "gr-weighted": {
      id: "gr-weighted", name: "Weighted", type: "formula",
      formulaConfig: { expression: 'prop("Weight") * prop("Score") / 100' },
    },
  },
};

/** [id, component, weight %, score 0-100] — weights sum to 100. */
const GRADES_ROWS: [string, string, number, number][] = [
  ["gr1", "Homework", 15, 88],
  ["gr2", "Quizzes", 10, 84],
  ["gr3", "Midterm", 25, 91],
  ["gr4", "Project", 20, 79],
  ["gr5", "Participation", 5, 95],
  ["gr6", "Final exam", 25, 85],
];

const gradeStamp = (): Pick<Page, "createdAt" | "updatedAt" | "createdBy" | "lastEditedBy"> => ({
  createdAt: GRADES_STAMP,
  updatedAt: GRADES_STAMP,
  createdBy: "Dylan",
  lastEditedBy: "Dylan",
});

function gradesPages(): Record<string, Page> {
  const pages: Record<string, Page> = {};
  for (const [id, name, weight, score] of GRADES_ROWS) {
    pages[id] = {
      id, databaseId: GRADES_DB_ID, icon: "📊", ...gradeStamp(),
      properties: { "gr-name": name, "gr-weight": weight, "gr-score": score },
      content: [],
    };
  }
  return pages;
}

const gradesViews: Record<string, ViewConfig> = {
  [GRADES_TABLE_VIEW_ID]: {
    id: GRADES_TABLE_VIEW_ID, databaseId: GRADES_DB_ID, name: "Table", type: "table",
    filters: [], filterConjunction: "and", sorts: [],
    visibleProperties: ["gr-name", "gr-weight", "gr-score", "gr-weighted"],
    settings: { showPageIcon: false },
  },
};

/** Merge the Grades demo database into a known-database snapshot. Additive
 *  (these ids are unique). Mirrors applyHomeDemoSeed; called from seedSnapshot. */
export function applyGradesSeed(state: NotionState): NotionState {
  return {
    databases: { ...state.databases, [gradesSchema.id]: gradesSchema },
    pages: { ...state.pages, ...gradesPages() },
    views: { ...state.views, ...gradesViews },
  };
}
