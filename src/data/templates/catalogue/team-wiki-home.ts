/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   team-wiki-home.ts                                  :+:      :+:    :+:   */
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

const key = (suffix: string): string => `team-wiki-home-${suffix}`;
const DB = key("db-docs");

const overview = tileRow(key("row-overview"), [
  statTile(key("w-count"), key("v-list"), "Documents", "count"),
  statTile(key("w-sections"), key("v-list"), "Sections in use", "distinct", key("p-section")),
  viewTile(key("w-list"), key("v-list"), "Doc list"),
]);

const views = [
  view(key("v-list"), DB, "All docs", "list"),
  { ...view(key("v-board"), DB, "Docs by section", "board"), grouping: { propertyId: key("p-section") } },
  view(key("v-table"), DB, "Doc table", "table"),
  view(key("v-dashboard"), DB, "Wiki overview", "dashboard", dashboardSettings([overview])),
];

const rows = [
  record(key("r-welcome"), DB, {
    [key("p-title")]: "Welcome to the team handbook", [key("p-section")]: key("opt-onboarding"),
    [key("p-owner")]: "Sam", [key("p-updated")]: "2026-11-16T09:00:00.000Z", [key("p-verified")]: true,
    [key("p-link")]: "https://example.com/docs/team-handbook",
  }),
  record(key("r-planning"), DB, {
    [key("p-title")]: "How we run weekly planning", [key("p-section")]: key("opt-processes"),
    [key("p-owner")]: "Priya", [key("p-updated")]: "2026-11-14T09:00:00.000Z",
    [key("p-link")]: "https://example.com/docs/weekly-planning",
  }),
  record(key("r-environment"), DB, {
    [key("p-title")]: "Set up your local environment", [key("p-section")]: key("opt-engineering"),
    [key("p-owner")]: "Jonas", [key("p-updated")]: "2026-11-12T09:00:00.000Z", [key("p-verified")]: true,
    [key("p-link")]: "https://example.com/docs/local-environment",
  }),
  record(key("r-review"), DB, {
    [key("p-title")]: "Design review checklist", [key("p-section")]: key("opt-design"),
    [key("p-owner")]: "Noor", [key("p-updated")]: "2026-11-18T09:00:00.000Z",
    [key("p-link")]: "https://example.com/docs/design-review",
  }),
  record(key("r-leave"), DB, {
    [key("p-title")]: "Expense and leave policy", [key("p-section")]: key("opt-hr"),
    [key("p-owner")]: "Alex", [key("p-updated")]: "2026-11-10T09:00:00.000Z", [key("p-verified")]: true,
    [key("p-link")]: "https://example.com/docs/leave-policy",
  }),
  record(key("r-incident"), DB, {
    [key("p-title")]: "Incident response playbook", [key("p-section")]: key("opt-engineering"),
    [key("p-owner")]: "Sam", [key("p-updated")]: "2026-11-19T09:00:00.000Z",
    [key("p-link")]: "https://example.com/docs/incident-playbook",
  }),
];

const template: TemplateBody = {
  content: scopeIds(regionPage(leftSidebarShell, {
    header: [
      heading(key("h-title"), "Team wiki home", 1),
      p("Give new teammates one place to find the handbook, see owners, and trust verified pages."),
    ],
    left: [
      heading(key("h-current"), "Keep docs current", 2),
      p("Check the updated date before citing a page and flag anything stale for its owner."),
      dbInline(DB, key("v-list")),
    ],
    main: [dbInline(DB, key("v-dashboard")), dbInline(DB, key("v-board"))],
  }), "team-wiki-home"),
  databases: database({
    id: DB, name: "Docs", icon: "📚",
    properties: [
      { id: key("p-title"), name: "Document", type: "title" },
      selectProperty(key("p-section"), "Section", [
        [key("opt-onboarding"), "Onboarding", "blue"], [key("opt-processes"), "Processes", "purple"],
        [key("opt-engineering"), "Engineering", "green"], [key("opt-design"), "Design", "pink"],
        [key("opt-hr"), "HR", "orange"],
      ]),
      { id: key("p-owner"), name: "Owner", type: "text" },
      { id: key("p-updated"), name: "Updated", type: "date" },
      { id: key("p-verified"), name: "Verified", type: "checkbox" },
      { id: key("p-link"), name: "Link", type: "url" },
    ],
    views, rows,
  }),
};

export default template;
