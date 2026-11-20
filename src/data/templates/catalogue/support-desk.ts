/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   support-desk.ts                                    :+:      :+:    :+:   */
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

const key = (suffix: string): string => `support-desk-${suffix}`;
const DB = key("db-tickets");

const overview = tileRow(key("row-overview"), [
  statTile(key("w-count"), key("v-list"), "Tickets", "count"),
  statTile(key("w-average"), key("v-list"), "Average reply time", "avg", key("p-reply")),
  statTile(key("w-slowest"), key("v-list"), "Slowest reply", "max", key("p-reply")),
  statTile(key("w-status"), key("v-list"), "Statuses in use", "distinct", key("p-status")),
]);

const views = [
  { ...view(key("v-board"), DB, "Queue by status", "board"), grouping: { propertyId: key("p-status") } },
  view(key("v-list"), DB, "Ticket list", "list"),
  view(key("v-chart"), DB, "Tickets by priority", "chart", {
    chartType: "bar", xAxisProperty: key("p-priority"), yAxisAggregation: "count",
  }),
  view(key("v-dashboard"), DB, "Desk overview", "dashboard", dashboardSettings([overview])),
];

const rows = [
  record(key("r-login"), DB, {
    [key("p-title")]: "Sam cannot sign in after the password reset", [key("p-status")]: key("opt-open"),
    [key("p-priority")]: key("opt-urgent"), [key("p-channel")]: key("opt-email"),
    [key("p-opened")]: "2026-11-18T08:40:00.000Z", [key("p-reply")]: 12, [key("p-escalated")]: true,
  }),
  record(key("r-export"), DB, {
    [key("p-title")]: "Alex asks for a CSV export of last month", [key("p-status")]: key("opt-waiting"),
    [key("p-priority")]: key("opt-normal"), [key("p-channel")]: key("opt-chat"),
    [key("p-opened")]: "2026-11-18T10:05:00.000Z", [key("p-reply")]: 25, [key("p-escalated")]: false,
  }),
  record(key("r-billing"), DB, {
    [key("p-title")]: "Priya was charged twice for the team plan", [key("p-status")]: key("opt-open"),
    [key("p-priority")]: key("opt-high"), [key("p-channel")]: key("opt-email"),
    [key("p-opened")]: "2026-11-19T09:15:00.000Z", [key("p-reply")]: 40, [key("p-escalated")]: true,
  }),
  record(key("r-mobile"), DB, {
    [key("p-title")]: "Noor reports a blank screen on mobile", [key("p-status")]: key("opt-new"),
    [key("p-priority")]: key("opt-high"), [key("p-channel")]: key("opt-phone"),
    [key("p-opened")]: "2026-11-19T14:30:00.000Z", [key("p-reply")]: 55, [key("p-escalated")]: false,
  }),
  record(key("r-invite"), DB, {
    [key("p-title")]: "Jonas needs help inviting a contractor", [key("p-status")]: key("opt-solved"),
    [key("p-priority")]: key("opt-low"), [key("p-channel")]: key("opt-chat"),
    [key("p-opened")]: "2026-11-17T11:20:00.000Z", [key("p-reply")]: 8, [key("p-escalated")]: false,
  }),
  record(key("r-webhook"), DB, {
    [key("p-title")]: "Mira asks why webhook retries stopped", [key("p-status")]: key("opt-waiting"),
    [key("p-priority")]: key("opt-normal"), [key("p-channel")]: key("opt-email"),
    [key("p-opened")]: "2026-11-19T16:45:00.000Z", [key("p-reply")]: 95, [key("p-escalated")]: false,
  }),
];

const template: TemplateBody = {
  content: scopeIds(regionPage(leftSidebarShell, {
    header: [
      heading(key("h-title"), "Support desk", 1),
      p("Triage every ticket, keep reply times honest, and escalate the urgent ones before they wait."),
    ],
    left: [
      heading(key("h-triage"), "Triage routine", 2),
      p("Start each shift with New tickets, answer the oldest first, and flag anything Urgent for a teammate."),
      dbInline(DB, key("v-list")),
    ],
    main: [dbInline(DB, key("v-dashboard")), dbInline(DB, key("v-board")), dbInline(DB, key("v-chart"))],
  }), "support-desk"),
  databases: database({
    id: DB, name: "Tickets", icon: "🎧",
    properties: [
      { id: key("p-title"), name: "Ticket", type: "title" },
      selectProperty(key("p-status"), "Status", [
        [key("opt-new"), "New", "gray"], [key("opt-open"), "Open", "blue"],
        [key("opt-waiting"), "Waiting", "yellow"], [key("opt-solved"), "Solved", "green"],
      ]),
      selectProperty(key("p-priority"), "Priority", [
        [key("opt-low"), "Low", "gray"], [key("opt-normal"), "Normal", "blue"],
        [key("opt-high"), "High", "orange"], [key("opt-urgent"), "Urgent", "red"],
      ]),
      selectProperty(key("p-channel"), "Channel", [
        [key("opt-email"), "Email", "blue"], [key("opt-chat"), "Chat", "purple"], [key("opt-phone"), "Phone", "green"],
      ]),
      { id: key("p-opened"), name: "Opened", type: "date" },
      { id: key("p-reply"), name: "Minutes to reply", type: "number" },
      { id: key("p-escalated"), name: "Escalated", type: "checkbox" },
    ],
    views, rows,
  }),
};

export default template;