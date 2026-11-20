/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   project-tracker.ts                                 :+:      :+:    :+:   */
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
import { dashboardSettings, statTile, tileRow, viewTile } from "./builders/cards";
import { database, record } from "./builders/databases";
import { selectProperty } from "./builders/options";
import { regionPage, scopeIds } from "./builders/regions";
import { view } from "./builders/views";
import type { TemplateBody } from "./types";

const key = (suffix: string): string => `project-tracker-${suffix}`;
const DB = key("db-tasks");


const overview = tileRow(key("row-overview"), [
  statTile(key("w-count"), key("v-table"), "Tasks", "count"),
  statTile(key("w-estimate"), key("v-table"), "Total estimate", "sum", key("p-estimate")),
  statTile(key("w-status"), key("v-table"), "Statuses in use", "distinct", key("p-status")),
  viewTile(key("w-board"), key("v-board"), "Status board"),
]);

const views = [
  { ...view(key("v-board"), DB, "By status", "board"), grouping: { propertyId: key("p-status") } },
  view(key("v-table"), DB, "All tasks", "table"),
  view(key("v-timeline"), DB, "Due-date timeline", "timeline", { showTimelineBy: key("p-due"), showTable: true, zoomLevel: "month" }),
  view(key("v-dashboard"), DB, "Project overview", "dashboard", dashboardSettings([overview])),
];

const rows = [
  record(key("r-brief"), DB, {
    [key("p-title")]: "Write the launch brief", [key("p-status")]: key("opt-done"), [key("p-priority")]: key("opt-high"),
    [key("p-due")]: "2026-11-20T09:00:00.000Z", [key("p-estimate")]: 3,
  }),
  record(key("r-prototype"), DB, {
    [key("p-title")]: "Prototype the project overview", [key("p-status")]: key("opt-doing"), [key("p-priority")]: key("opt-high"),
    [key("p-due")]: "2026-11-23T09:00:00.000Z", [key("p-estimate")]: 8,
  }),
  record(key("r-empty"), DB, {
    [key("p-title")]: "Design the empty project state", [key("p-status")]: key("opt-doing"), [key("p-priority")]: key("opt-medium"),
    [key("p-due")]: "2026-11-24T09:00:00.000Z", [key("p-estimate")]: 5,
  }),
  record(key("r-review"), DB, {
    [key("p-title")]: "Review keyboard navigation", [key("p-status")]: key("opt-todo"), [key("p-priority")]: key("opt-high"),
    [key("p-due")]: "2026-11-25T09:00:00.000Z", [key("p-estimate")]: 2,
  }),
  record(key("r-docs"), DB, {
    [key("p-title")]: "Publish the handoff notes", [key("p-status")]: key("opt-todo"), [key("p-priority")]: key("opt-low"),
    [key("p-due")]: "2026-11-27T09:00:00.000Z", [key("p-estimate")]: 3,
  }),
  record(key("r-release"), DB, {
    [key("p-title")]: "Prepare the release checklist", [key("p-status")]: key("opt-todo"), [key("p-priority")]: key("opt-medium"),
    [key("p-due")]: "2026-11-30T09:00:00.000Z", [key("p-estimate")]: 5,
  }),
];

const template: TemplateBody = {
  content: scopeIds(regionPage(leftSidebarShell, {
    header: [
      heading(key("h-title"), "Project tracker", 1),
      p("Plan the work, compare estimates, and keep every due date visible from kickoff to done."),
    ],
    left: [
      heading(key("h-workflow"), "A simple workflow", 2),
      p("Move tasks from To do to Done, then use the table to adjust priorities and estimates."),
      dbInline(DB, key("v-table")),
    ],
    main: [dbInline(DB, key("v-dashboard")), dbInline(DB, key("v-board"))],
  }), "project-tracker"),
  databases: database({
    id: DB, name: "Tasks", icon: "✅",
    properties: [
      { id: key("p-title"), name: "Task", type: "title" },
      selectProperty(key("p-status"), "Status", [
        [key("opt-todo"), "To do", "gray"], [key("opt-doing"), "Doing", "blue"], [key("opt-done"), "Done", "green"],
      ]),
      selectProperty(key("p-priority"), "Priority", [
        [key("opt-low"), "Low", "gray"], [key("opt-medium"), "Medium", "yellow"], [key("opt-high"), "High", "red"],
      ]),
      { id: key("p-due"), name: "Due date", type: "date" },
      { id: key("p-estimate"), name: "Estimate (hours)", type: "number" },
    ],
    views, rows,
  }),
};

export default template;
