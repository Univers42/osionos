/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   okrs.ts                                            :+:      :+:    :+:   */
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

const key = (suffix: string): string => `okrs-${suffix}`;
const DB = key("db-results");

const overview = tileRow(key("row-overview"), [
  statTile(key("w-count"), key("v-table"), "Key results", "count"),
  statTile(key("w-average"), key("v-table"), "Average progress", "avg", key("p-progress")),
  statTile(key("w-minimum"), key("v-table"), "Lowest progress", "min", key("p-progress")),
  statTile(key("w-objectives"), key("v-table"), "Objectives in play", "distinct", key("p-objective")),
]);

const views = [
  { ...view(key("v-board"), DB, "By objective", "board"), grouping: { propertyId: key("p-objective") } },
  view(key("v-table"), DB, "All key results", "table"),
  view(key("v-chart"), DB, "Confidence mix", "chart", {
    chartType: "bar", xAxisProperty: key("p-confidence"), yAxisAggregation: "count",
  }),
  view(key("v-dashboard"), DB, "Quarter overview", "dashboard", dashboardSettings([overview])),
];

const rows = [
  record(key("r-activation"), DB, {
    [key("p-title")]: "Lift trial activation to 40%", [key("p-objective")]: key("opt-grow"), [key("p-quarter")]: key("opt-q4"),
    [key("p-progress")]: 62, [key("p-confidence")]: key("opt-high"), [key("p-owner")]: "Sam",
    [key("p-due")]: "2026-12-15T09:00:00.000Z",
  }),
  record(key("r-teams"), DB, {
    [key("p-title")]: "Reach 120 weekly active teams", [key("p-objective")]: key("opt-grow"), [key("p-quarter")]: key("opt-q4"),
    [key("p-progress")]: 48, [key("p-confidence")]: key("opt-medium"), [key("p-owner")]: "Alex",
    [key("p-due")]: "2026-12-20T09:00:00.000Z",
  }),
  record(key("r-renewal"), DB, {
    [key("p-title")]: "Keep renewal rate above 90%", [key("p-objective")]: key("opt-retain"), [key("p-quarter")]: key("opt-q4"),
    [key("p-progress")]: 81, [key("p-confidence")]: key("opt-high"), [key("p-owner")]: "Priya",
    [key("p-due")]: "2026-12-10T09:00:00.000Z",
  }),
  record(key("r-churn"), DB, {
    [key("p-title")]: "Cut churn interviews to five themes", [key("p-objective")]: key("opt-retain"), [key("p-quarter")]: key("opt-q4"),
    [key("p-progress")]: 35, [key("p-confidence")]: key("opt-low"), [key("p-owner")]: "Noor",
    [key("p-due")]: "2026-11-30T09:00:00.000Z",
  }),
  record(key("r-setup"), DB, {
    [key("p-title")]: "Shorten first setup to ten minutes", [key("p-objective")]: key("opt-speed"), [key("p-quarter")]: key("opt-q4"),
    [key("p-progress")]: 74, [key("p-confidence")]: key("opt-medium"), [key("p-owner")]: "Jonas",
    [key("p-due")]: "2026-12-05T09:00:00.000Z",
  }),
  record(key("r-invites"), DB, {
    [key("p-title")]: "Make teammate invites one click", [key("p-objective")]: key("opt-speed"), [key("p-quarter")]: key("opt-q3"),
    [key("p-progress")]: 100, [key("p-confidence")]: key("opt-high"), [key("p-owner")]: "Mira",
    [key("p-due")]: "2026-09-28T09:00:00.000Z",
  }),
];

const template: TemplateBody = {
  content: scopeIds(regionPage(twoSidebarsShell, {
    header: [
      heading(key("h-title"), "OKRs", 1),
      p("Set a few clear objectives, score each key result honestly, and watch confidence shift week by week."),
    ],
    left: [
      heading(key("h-scoring"), "Scoring guide", 2),
      p("Update progress every Friday and mark confidence Low as soon as a result feels at risk."),
      dbInline(DB, key("v-table")),
    ],
    main: [dbInline(DB, key("v-dashboard")), dbInline(DB, key("v-board"))],
    right: [
      heading(key("h-confidence"), "Confidence check", 2),
      p("Use this mix to open the weekly review with the results that need help, not the ones already on track."),
      dbInline(DB, key("v-chart")),
    ],
  }), "okrs"),
  databases: database({
    id: DB, name: "Key results", icon: "🎯",
    properties: [
      { id: key("p-title"), name: "Key result", type: "title" },
      selectProperty(key("p-objective"), "Objective", [
        [key("opt-grow"), "Grow weekly active teams", "blue"],
        [key("opt-retain"), "Improve retention", "green"],
        [key("opt-speed"), "Speed up onboarding", "purple"],
      ]),
      selectProperty(key("p-quarter"), "Quarter", [
        [key("opt-q3"), "Q3 2026", "gray"], [key("opt-q4"), "Q4 2026", "blue"],
      ]),
      { id: key("p-progress"), name: "Progress (%)", type: "number" },
      selectProperty(key("p-confidence"), "Confidence", [
        [key("opt-high"), "High", "green"], [key("opt-medium"), "Medium", "yellow"], [key("opt-low"), "Low", "red"],
      ]),
      { id: key("p-owner"), name: "Owner", type: "text" },
      { id: key("p-due"), name: "Due date", type: "date" },
    ],
    views, rows,
  }),
};

export default template;