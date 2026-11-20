/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   job-search.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { p } from "@/data/seedBlockHelpers";
import { dbInline, heading } from "@/data/templates/templateBlocks";
import { headerFooterShell } from "@/data/templates/sections/shellSections";
import { dashboardSettings, statTile, tileRow } from "./builders/cards";
import { database, record } from "./builders/databases";
import { selectProperty } from "./builders/options";
import { regionPage, scopeIds } from "./builders/regions";
import { view } from "./builders/views";
import type { TemplateBody } from "./types";

const key = (suffix: string): string => `job-search-${suffix}`;
const DB = key("db-applications");

const overview = tileRow(key("row-overview"), [
  statTile(key("w-count"), key("v-table"), "Applications", "count"),
  statTile(key("w-average"), key("v-table"), "Average salary", "avg", key("p-salary")),
  statTile(key("w-top"), key("v-table"), "Top salary", "max", key("p-salary")),
  statTile(key("w-stages"), key("v-table"), "Stages in use", "distinct", key("p-stage")),
]);

const views = [
  { ...view(key("v-board"), DB, "Pipeline", "board"), grouping: { propertyId: key("p-stage") } },
  view(key("v-table"), DB, "All applications", "table"),
  view(key("v-timeline"), DB, "Applied timeline", "timeline", { showTimelineBy: key("p-applied"), showTable: true, zoomLevel: "month" }),
  view(key("v-dashboard"), DB, "Search overview", "dashboard", dashboardSettings([overview])),
];

const rows = [
  record(key("r-frontend"), DB, {
    [key("p-title")]: "Frontend engineer", [key("p-company")]: "Northstar Studio", [key("p-stage")]: key("opt-interview"),
    [key("p-applied")]: "2026-11-02T09:00:00.000Z", [key("p-salary")]: 95000,
    [key("p-link")]: "https://example.com/jobs/northstar-frontend", [key("p-remote")]: true,
  }),
  record(key("r-designer"), DB, {
    [key("p-title")]: "Product designer", [key("p-company")]: "Willow Labs", [key("p-stage")]: key("opt-offer"),
    [key("p-applied")]: "2026-10-26T09:00:00.000Z", [key("p-salary")]: 88000,
    [key("p-link")]: "https://example.com/jobs/willow-designer", [key("p-remote")]: true,
  }),
  record(key("r-analyst"), DB, {
    [key("p-title")]: "Data analyst", [key("p-company")]: "Juniper Learning", [key("p-stage")]: key("opt-applied"),
    [key("p-applied")]: "2026-11-09T09:00:00.000Z", [key("p-salary")]: 72000,
    [key("p-link")]: "https://example.com/jobs/juniper-analyst",
  }),
  record(key("r-researcher"), DB, {
    [key("p-title")]: "UX researcher", [key("p-company")]: "Cedar Works", [key("p-stage")]: key("opt-applied"),
    [key("p-applied")]: "2026-11-12T09:00:00.000Z", [key("p-salary")]: 78000,
    [key("p-link")]: "https://example.com/jobs/cedar-researcher",
  }),
  record(key("r-backend"), DB, {
    [key("p-title")]: "Backend engineer", [key("p-company")]: "Maple Studio", [key("p-stage")]: key("opt-saved"),
    [key("p-applied")]: "2026-11-16T09:00:00.000Z", [key("p-salary")]: 105000,
    [key("p-link")]: "https://example.com/jobs/maple-backend", [key("p-remote")]: true,
  }),
  record(key("r-marketing"), DB, {
    [key("p-title")]: "Marketing lead", [key("p-company")]: "Fern Collective", [key("p-stage")]: key("opt-rejected"),
    [key("p-applied")]: "2026-10-05T09:00:00.000Z", [key("p-salary")]: 90000,
    [key("p-link")]: "https://example.com/jobs/fern-marketing",
  }),
];

const template: TemplateBody = {
  content: scopeIds(regionPage(headerFooterShell, {
    header: [
      heading(key("h-title"), "Job search", 1),
      p("Follow each application from saved listing to offer so no follow-up slips and salary notes stay handy."),
    ],
    main: [dbInline(DB, key("v-dashboard")), dbInline(DB, key("v-board")), dbInline(DB, key("v-timeline"))],
    footer: [
      heading(key("h-follow"), "Keep the pipeline moving", 2),
      p("Follow up a week after applying and archive rejections quickly so the board stays honest."),
      dbInline(DB, key("v-table")),
    ],
  }), "job-search"),
  databases: database({
    id: DB, name: "Applications", icon: "📄",
    properties: [
      { id: key("p-title"), name: "Role", type: "title" },
      { id: key("p-company"), name: "Company", type: "text" },
      selectProperty(key("p-stage"), "Stage", [
        [key("opt-saved"), "Saved", "gray"], [key("opt-applied"), "Applied", "blue"],
        [key("opt-interview"), "Interview", "yellow"], [key("opt-offer"), "Offer", "green"],
        [key("opt-rejected"), "Rejected", "red"],
      ]),
      { id: key("p-applied"), name: "Applied date", type: "date" },
      { id: key("p-salary"), name: "Salary", type: "number" },
      { id: key("p-link"), name: "Posting link", type: "url" },
      { id: key("p-remote"), name: "Remote", type: "checkbox" },
    ],
    views, rows,
  }),
};

export default template;
