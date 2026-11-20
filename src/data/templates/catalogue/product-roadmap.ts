/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   product-roadmap.ts                                 :+:      :+:    :+:   */
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
import { dashboardSettings, statTile, tileRow } from "./builders/cards";
import { database, record } from "./builders/databases";
import { selectProperty } from "./builders/options";
import { regionPage, scopeIds } from "./builders/regions";
import { view } from "./builders/views";
import type { TemplateBody } from "./types";

const key = (suffix: string): string => `product-roadmap-${suffix}`;
const DB = key("db-features");

const overview = tileRow(key("row-overview"), [
  statTile(key("w-count"), key("v-table"), "Features", "count"),
  statTile(key("w-effort"), key("v-table"), "Total effort", "sum", key("p-effort")),
  statTile(key("w-impact"), key("v-table"), "Average impact", "avg", key("p-impact")),
  statTile(key("w-quarters"), key("v-table"), "Quarters in use", "distinct", key("p-quarter")),
]);

const views = [
  view(key("v-timeline"), DB, "Launch timeline", "timeline", { showTimelineBy: key("p-launch"), showTable: true, zoomLevel: "month" }),
  { ...view(key("v-board"), DB, "Features by status", "board"), grouping: { propertyId: key("p-status") } },
  view(key("v-table"), DB, "All features", "table"),
  view(key("v-dashboard"), DB, "Roadmap overview", "dashboard", dashboardSettings([overview])),
];

const rows = [
  record(key("r-offline"), DB, {
    [key("p-title")]: "Offline mode for mobile notes", [key("p-status")]: key("opt-building"),
    [key("p-quarter")]: key("opt-q1"), [key("p-effort")]: 6, [key("p-impact")]: 5,
    [key("p-start")]: "2026-01-12T09:00:00.000Z", [key("p-launch")]: "2026-03-06T09:00:00.000Z",
  }),
  record(key("r-workspaces"), DB, {
    [key("p-title")]: "Shared workspaces for teams", [key("p-status")]: key("opt-shipped"),
    [key("p-quarter")]: key("opt-q1"), [key("p-effort")]: 8, [key("p-impact")]: 5,
    [key("p-start")]: "2026-01-05T09:00:00.000Z", [key("p-launch")]: "2026-02-27T09:00:00.000Z",
  }),
  record(key("r-gallery"), DB, {
    [key("p-title")]: "Template gallery refresh", [key("p-status")]: key("opt-building"),
    [key("p-quarter")]: key("opt-q2"), [key("p-effort")]: 4, [key("p-impact")]: 4,
    [key("p-start")]: "2026-04-06T09:00:00.000Z", [key("p-launch")]: "2026-05-29T09:00:00.000Z",
  }),
  record(key("r-reactions"), DB, {
    [key("p-title")]: "Comment reactions", [key("p-status")]: key("opt-planned"),
    [key("p-quarter")]: key("opt-q2"), [key("p-effort")]: 3, [key("p-impact")]: 3,
    [key("p-start")]: "2026-04-13T09:00:00.000Z", [key("p-launch")]: "2026-06-05T09:00:00.000Z",
  }),
  record(key("r-sharing"), DB, {
    [key("p-title")]: "Public sharing links", [key("p-status")]: key("opt-planned"),
    [key("p-quarter")]: key("opt-q3"), [key("p-effort")]: 5, [key("p-impact")]: 4,
    [key("p-start")]: "2026-07-06T09:00:00.000Z", [key("p-launch")]: "2026-09-04T09:00:00.000Z",
  }),
  record(key("r-automations"), DB, {
    [key("p-title")]: "Automation rules builder", [key("p-status")]: key("opt-idea"),
    [key("p-quarter")]: key("opt-q4"), [key("p-effort")]: 10, [key("p-impact")]: 5,
    [key("p-start")]: "2026-10-05T09:00:00.000Z", [key("p-launch")]: "2026-12-11T09:00:00.000Z",
  }),
];

const template: TemplateBody = {
  content: scopeIds(regionPage(twoSidebarsShell, {
    header: [
      heading(key("h-title"), "Product roadmap", 1),
      p("Line up features by quarter, weigh effort against impact, and keep every launch date honest."),
    ],
    left: [
      heading(key("h-planning"), "Planning notes", 2),
      p("Sort by effort before committing a quarter, and leave room for the work already in flight."),
      dbInline(DB, key("v-table")),
    ],
    main: [dbInline(DB, key("v-dashboard")), dbInline(DB, key("v-timeline"))],
    right: [
      heading(key("h-status"), "Status at a glance", 2),
      p("Move cards as decisions change so the board reflects what the team is really building."),
      dbInline(DB, key("v-board")),
    ],
  }), "product-roadmap"),
  databases: database({
    id: DB, name: "Features", icon: "🚀",
    properties: [
      { id: key("p-title"), name: "Feature", type: "title" },
      selectProperty(key("p-status"), "Status", [
        [key("opt-idea"), "Idea", "gray"], [key("opt-planned"), "Planned", "blue"],
        [key("opt-building"), "Building", "yellow"], [key("opt-shipped"), "Shipped", "green"],
      ]),
      selectProperty(key("p-quarter"), "Quarter", [
        [key("opt-q1"), "Q1 2026", "blue"], [key("opt-q2"), "Q2 2026", "purple"],
        [key("opt-q3"), "Q3 2026", "orange"], [key("opt-q4"), "Q4 2026", "pink"],
      ]),
      { id: key("p-effort"), name: "Effort (weeks)", type: "number" },
      { id: key("p-impact"), name: "Impact (1-5)", type: "number" },
      { id: key("p-start"), name: "Start date", type: "date" },
      { id: key("p-launch"), name: "Launch date", type: "date" },
    ],
    views, rows,
  }),
};

export default template;
