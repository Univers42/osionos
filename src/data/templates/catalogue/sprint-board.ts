/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sprint-board.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { p } from "@/data/seedBlockHelpers";
import { dbInline, heading } from "@/data/templates/templateBlocks";
import { twoSidebarsShell } from "@/data/templates/sections/shellSections";
import { dashboardSettings, statTile, tileRow, viewTile } from "./builders/cards";
import { database, record } from "./builders/databases";
import { selectProperty } from "./builders/options";
import { regionPage, scopeIds } from "./builders/regions";
import { view } from "./builders/views";
import type { TemplateBody } from "./types";

const key = (suffix: string): string => `sprint-board-${suffix}`;
const DB = key("db-issues");


const overview = tileRow(key("row-overview"), [
  statTile(key("w-count"), key("v-list"), "Issues", "count"),
  statTile(key("w-points"), key("v-list"), "Points committed", "sum", key("p-points")),
  viewTile(key("w-chart"), key("v-chart"), "Work by type"),
  viewTile(key("w-board"), key("v-board"), "Sprint flow"),
]);

const views = [
  { ...view(key("v-board"), DB, "Sprint board", "board"), grouping: { propertyId: key("p-status") } },
  view(key("v-list"), DB, "Issue list", "list"),
  view(key("v-chart"), DB, "Issues by type", "chart", {
    chartType: "bar", xAxisProperty: key("p-type"), yAxisAggregation: "count",
  }),
  view(key("v-dashboard"), DB, "Sprint summary", "dashboard", dashboardSettings([overview])),
];

const rows = [
  record(key("r-focus"), DB, {
    [key("p-title")]: "Fix keyboard focus in the issue menu", [key("p-status")]: key("opt-progress"),
    [key("p-type")]: key("opt-bug"), [key("p-points")]: 3, [key("p-sprint")]: key("opt-current"),
  }),
  record(key("r-filters"), DB, {
    [key("p-title")]: "Add saved filters to the team view", [key("p-status")]: key("opt-review"),
    [key("p-type")]: key("opt-feature"), [key("p-points")]: 5, [key("p-sprint")]: key("opt-current"),
  }),
  record(key("r-sidebar"), DB, {
    [key("p-title")]: "Collapse the sidebar on narrow screens", [key("p-status")]: key("opt-done"),
    [key("p-type")]: key("opt-feature"), [key("p-points")]: 5, [key("p-sprint")]: key("opt-current"),
  }),
  record(key("r-offline"), DB, {
    [key("p-title")]: "Retry comments after an offline gap", [key("p-status")]: key("opt-backlog"),
    [key("p-type")]: key("opt-bug"), [key("p-points")]: 8, [key("p-sprint")]: key("opt-next"),
  }),
  record(key("r-fixtures"), DB, {
    [key("p-title")]: "Refresh the board test fixtures", [key("p-status")]: key("opt-backlog"),
    [key("p-type")]: key("opt-chore"), [key("p-points")]: 2, [key("p-sprint")]: key("opt-next"),
  }),
  record(key("r-shortcuts"), DB, {
    [key("p-title")]: "Document the sprint planning shortcuts", [key("p-status")]: key("opt-done"),
    [key("p-type")]: key("opt-chore"), [key("p-points")]: 1, [key("p-sprint")]: key("opt-current"),
  }),
];

const template: TemplateBody = {
  content: scopeIds(regionPage(twoSidebarsShell, {
    header: [
      heading(key("h-title"), "Sprint board", 1),
      p("Give the team one place to balance the sprint, spot blockers, and see the mix of planned work."),
    ],
    left: [
      heading(key("h-planning"), "Planning notes", 2),
      p("Keep estimates lightweight and discuss any issue that stays in review for more than a day."),
      dbInline(DB, key("v-list")),
    ],
    main: [dbInline(DB, key("v-dashboard")), dbInline(DB, key("v-board"))],
    right: [
      heading(key("h-mix"), "Work mix", 2),
      p("Use this count to keep bugs, features, and maintenance visible during the next planning session."),
      dbInline(DB, key("v-chart")),
    ],
  }), "sprint-board"),
  databases: database({
    id: DB, name: "Issues", icon: "🧭",
    properties: [
      { id: key("p-title"), name: "Issue", type: "title" },
      selectProperty(key("p-status"), "Status", [
        [key("opt-backlog"), "Backlog", "gray"], [key("opt-progress"), "In progress", "blue"],
        [key("opt-review"), "Review", "yellow"], [key("opt-done"), "Done", "green"],
      ]),
      selectProperty(key("p-type"), "Type", [
        [key("opt-bug"), "Bug", "red"], [key("opt-feature"), "Feature", "purple"], [key("opt-chore"), "Chore", "brown"],
      ]),
      { id: key("p-points"), name: "Story points", type: "number" },
      selectProperty(key("p-sprint"), "Sprint", [
        [key("opt-current"), "Sprint 24", "blue"], [key("opt-next"), "Sprint 25", "purple"],
      ]),
    ],
    views, rows,
  }),
};

export default template;
