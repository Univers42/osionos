/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   crm-pipeline.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { p } from "@/data/seedBlockHelpers";
import { dbInline, heading } from "@/data/templates/templateBlocks";
import { rightSidebarShell } from "@/data/templates/sections/shellSections";
import { dashboardSettings, statTile, tileRow } from "./builders/cards";
import { database, mergeSlices, record } from "./builders/databases";
import { selectProperty } from "./builders/options";
import { regionPage, scopeIds } from "./builders/regions";
import { view } from "./builders/views";
import type { TemplateBody } from "./types";

const key = (suffix: string): string => `crm-pipeline-${suffix}`;
const DEALS = key("db-deals");
const COMPANIES = key("db-companies");


const overview = tileRow(key("row-overview"), [
  statTile(key("w-value"), key("v-table"), "Pipeline value", "sum", key("p-value")),
  statTile(key("w-average"), key("v-table"), "Average deal", "avg", key("p-value")),
  statTile(key("w-count"), key("v-table"), "Deals", "count"),
  statTile(key("w-stages"), key("v-table"), "Stages in use", "distinct", key("p-stage")),
]);

const dealViews = [
  { ...view(key("v-board"), DEALS, "Pipeline", "board"), grouping: { propertyId: key("p-stage") } },
  view(key("v-table"), DEALS, "All deals", "table"),
  view(key("v-calendar"), DEALS, "Close dates", "calendar", { showCalendarBy: key("p-close"), showCalendarAs: "month" }),
  view(key("v-dashboard"), DEALS, "Sales overview", "dashboard", dashboardSettings([overview])),
];

const dealRows = [
  record(key("r-northstar"), DEALS, {
    [key("p-title")]: "Northstar workspace rollout", [key("p-stage")]: key("opt-proposal"), [key("p-value")]: 24000,
    [key("p-close")]: "2026-11-23T09:00:00.000Z", [key("p-contact")]: "https://example.com/contacts/sam",
  }),
  record(key("r-willow"), DEALS, {
    [key("p-title")]: "Willow Labs team renewal", [key("p-stage")]: key("opt-won"), [key("p-value")]: 12000,
    [key("p-close")]: "2026-11-24T09:00:00.000Z", [key("p-contact")]: "https://example.com/contacts/alex",
  }),
  record(key("r-juniper"), DEALS, {
    [key("p-title")]: "Juniper onboarding package", [key("p-stage")]: key("opt-qualified"), [key("p-value")]: 8500,
    [key("p-close")]: "2026-11-26T09:00:00.000Z", [key("p-contact")]: "https://example.com/contacts/priya",
  }),
  record(key("r-cedar"), DEALS, {
    [key("p-title")]: "Cedar Works pilot", [key("p-stage")]: key("opt-lead"), [key("p-value")]: 6000,
    [key("p-close")]: "2026-11-30T09:00:00.000Z", [key("p-contact")]: "https://example.com/contacts/jordan",
  }),
  record(key("r-maple"), DEALS, {
    [key("p-title")]: "Maple Studio expansion", [key("p-stage")]: key("opt-proposal"), [key("p-value")]: 18000,
    [key("p-close")]: "2026-12-02T09:00:00.000Z", [key("p-contact")]: "https://example.com/contacts/morgan",
  }),
  record(key("r-fern"), DEALS, {
    [key("p-title")]: "Fern Collective archive", [key("p-stage")]: key("opt-lost"), [key("p-value")]: 4500,
    [key("p-close")]: "2026-12-04T09:00:00.000Z", [key("p-contact")]: "https://example.com/contacts/taylor",
  }),
];

const deals = database({
  id: DEALS, name: "Deals", icon: "🤝",
  properties: [
    { id: key("p-title"), name: "Deal", type: "title" },
    selectProperty(key("p-stage"), "Stage", [
      [key("opt-lead"), "Lead", "gray"], [key("opt-qualified"), "Qualified", "blue"],
      [key("opt-proposal"), "Proposal", "yellow"], [key("opt-won"), "Won", "green"], [key("opt-lost"), "Lost", "red"],
    ]),
    { id: key("p-value"), name: "Value", type: "number" },
    { id: key("p-close"), name: "Close date", type: "date" },
    { id: key("p-contact"), name: "Contact link", type: "url" },
  ],
  views: dealViews, rows: dealRows,
});

const companies = database({
  id: COMPANIES, name: "Companies", icon: "🏢",
  properties: [
    { id: key("p-company-title"), name: "Company", type: "title" },
    selectProperty(key("p-industry"), "Industry", [
      [key("opt-technology"), "Technology", "blue"], [key("opt-retail"), "Retail", "orange"],
      [key("opt-health"), "Health", "green"], [key("opt-education"), "Education", "purple"],
    ]),
  ],
  views: [view(key("v-companies-table"), COMPANIES, "Company directory", "table")],
  rows: [
    record(key("r-company-northstar"), COMPANIES, { [key("p-company-title")]: "Northstar Studio", [key("p-industry")]: key("opt-technology") }),
    record(key("r-company-willow"), COMPANIES, { [key("p-company-title")]: "Willow Labs", [key("p-industry")]: key("opt-health") }),
    record(key("r-company-juniper"), COMPANIES, { [key("p-company-title")]: "Juniper Learning", [key("p-industry")]: key("opt-education") }),
    record(key("r-company-cedar"), COMPANIES, { [key("p-company-title")]: "Cedar Works", [key("p-industry")]: key("opt-retail") }),
  ],
});

const template: TemplateBody = {
  content: scopeIds(regionPage(rightSidebarShell, {
    header: [
      heading(key("h-title"), "CRM pipeline", 1),
      p("Track each opportunity from first conversation to a clear outcome while keeping close dates and value in view."),
    ],
    main: [dbInline(DEALS, key("v-dashboard")), dbInline(DEALS, key("v-board")), dbInline(DEALS, key("v-calendar"))],
    right: [
      heading(key("h-accounts"), "Account directory", 2),
      p("Keep a lightweight company list beside the pipeline so the team shares the same account names."),
      dbInline(COMPANIES, key("v-companies-table")),
    ],
  }), "crm-pipeline"),
  databases: mergeSlices(deals, companies),
};

export default template;
