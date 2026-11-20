/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   habit-tracker.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { p } from "@/data/seedBlockHelpers";
import { dbInline, heading } from "@/data/templates/templateBlocks";
import { leftSidebarShell } from "@/data/templates/sections/shellSections";
import { dashboardSettings, statTile, tileRow } from "./builders/cards";
import { database, record } from "./builders/databases";
import { selectProperty } from "./builders/options";
import { regionPage, scopeIds } from "./builders/regions";
import { view } from "./builders/views";
import type { TemplateBody } from "./types";

const key = (suffix: string): string => `habit-tracker-${suffix}`;
const DB = key("db-habits");

const overview = tileRow(key("row-overview"), [
  statTile(key("w-count"), key("v-table"), "Habits", "count"),
  statTile(key("w-streak-total"), key("v-table"), "Total streak", "sum", key("p-streak")),
  statTile(key("w-streak-average"), key("v-table"), "Average streak", "avg", key("p-streak")),
  statTile(key("w-areas"), key("v-table"), "Areas in use", "distinct", key("p-area")),
]);

const views = [
  view(key("v-table"), DB, "All habits", "table"),
  { ...view(key("v-board"), DB, "Habits by area", "board"), grouping: { propertyId: key("p-area") } },
  view(key("v-chart"), DB, "Habit count by area", "chart", {
    chartType: "bar", xAxisProperty: key("p-area"), yAxisAggregation: "count",
  }),
  view(key("v-dashboard"), DB, "Habit overview", "dashboard", dashboardSettings([overview])),
];

const rows = [
  record(key("r-walk"), DB, {
    [key("p-title")]: "Take a morning walk", [key("p-area")]: key("opt-health"),
    [key("p-streak")]: 18, [key("p-target")]: 5, [key("p-active")]: true,
    [key("p-started")]: "2026-01-05T06:30:00.000Z",
  }),
  record(key("r-read"), DB, {
    [key("p-title")]: "Read before bed", [key("p-area")]: key("opt-mind"),
    [key("p-streak")]: 12, [key("p-target")]: 7, [key("p-active")]: true,
    [key("p-started")]: "2026-02-01T20:30:00.000Z",
  }),
  record(key("r-plants"), DB, {
    [key("p-title")]: "Water the plants", [key("p-area")]: key("opt-home"),
    [key("p-streak")]: 6, [key("p-target")]: 3, [key("p-active")]: true,
    [key("p-started")]: "2026-03-02T07:00:00.000Z",
  }),
  record(key("r-meals"), DB, {
    [key("p-title")]: "Plan the weekly meals", [key("p-area")]: key("opt-health"),
    [key("p-streak")]: 4, [key("p-target")]: 1, [key("p-active")]: true,
    [key("p-started")]: "2026-04-06T17:00:00.000Z",
  }),
  record(key("r-meditate"), DB, {
    [key("p-title")]: "Meditate for ten minutes", [key("p-area")]: key("opt-mind"),
    [key("p-streak")]: 9, [key("p-target")]: 5, [key("p-active")]: false,
    [key("p-started")]: "2026-05-11T06:45:00.000Z",
  }),
  record(key("r-desk"), DB, {
    [key("p-title")]: "Clear the desk", [key("p-area")]: key("opt-work"),
    [key("p-streak")]: 3, [key("p-target")]: 2, [key("p-active")]: true,
    [key("p-started")]: "2026-06-01T16:30:00.000Z",
  }),
];

const template: TemplateBody = {
  content: scopeIds(regionPage(leftSidebarShell, {
    header: [
      heading(key("h-title"), "Habit tracker", 1),
      p("Build steady routines with a clear weekly target and a streak that makes progress visible."),
    ],
    left: [
      heading(key("h-routine"), "Routine check-in", 2),
      p("Review active habits each Sunday and adjust any target that no longer fits your week."),
      dbInline(DB, key("v-table")),
    ],
    main: [dbInline(DB, key("v-dashboard")), dbInline(DB, key("v-board")), dbInline(DB, key("v-chart"))],
  }), "habit-tracker"),
  databases: database({
    id: DB, name: "Habits", icon: "✅",
    properties: [
      { id: key("p-title"), name: "Habit", type: "title" },
      selectProperty(key("p-area"), "Area", [
        [key("opt-health"), "Health", "green"], [key("opt-mind"), "Mind", "purple"],
        [key("opt-home"), "Home", "orange"], [key("opt-work"), "Work", "blue"],
      ]),
      { id: key("p-streak"), name: "Streak", type: "number" },
      { id: key("p-target"), name: "Target per week", type: "number" },
      { id: key("p-active"), name: "Active", type: "checkbox" },
      { id: key("p-started"), name: "Started", type: "date" },
    ],
    views, rows,
  }),
};

export default template;
