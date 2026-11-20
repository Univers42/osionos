/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   personal-finance.ts                                :+:      :+:    :+:   */
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

const key = (suffix: string): string => `personal-finance-${suffix}`;
const DB = key("db-transactions");

const overview = tileRow(key("row-overview"), [
  statTile(key("w-total"), key("v-table"), "Net amount", "sum", key("p-amount")),
  statTile(key("w-average"), key("v-table"), "Average transaction", "avg", key("p-amount")),
  statTile(key("w-lowest"), key("v-table"), "Largest expense", "min", key("p-amount")),
  statTile(key("w-highest"), key("v-table"), "Largest income", "max", key("p-amount")),
]);

const views = [
  view(key("v-table"), DB, "All transactions", "table"),
  view(key("v-chart"), DB, "Transactions by category", "chart", {
    chartType: "bar", xAxisProperty: key("p-category"), yAxisAggregation: "count",
  }),
  view(key("v-calendar"), DB, "Transaction calendar", "calendar", { showCalendarBy: key("p-date"), showCalendarAs: "month" }),
  view(key("v-dashboard"), DB, "Money overview", "dashboard", dashboardSettings([overview])),
];

const rows = [
  record(key("r-salary"), DB, {
    [key("p-title")]: "November salary", [key("p-amount")]: 3200,
    [key("p-category")]: key("opt-income"), [key("p-date")]: "2026-11-02T09:00:00.000Z",
    [key("p-account")]: key("opt-checking"), [key("p-recurring")]: true,
  }),
  record(key("r-rent"), DB, {
    [key("p-title")]: "November rent", [key("p-amount")]: -1250,
    [key("p-category")]: key("opt-rent"), [key("p-date")]: "2026-11-03T08:00:00.000Z",
    [key("p-account")]: key("opt-checking"), [key("p-recurring")]: true,
  }),
  record(key("r-metro"), DB, {
    [key("p-title")]: "Metro pass", [key("p-amount")]: -42,
    [key("p-category")]: key("opt-transport"), [key("p-date")]: "2026-11-05T07:30:00.000Z",
    [key("p-account")]: key("opt-card"), [key("p-recurring")]: true,
  }),
  record(key("r-savings"), DB, {
    [key("p-title")]: "Transfer to emergency fund", [key("p-amount")]: -300,
    [key("p-category")]: key("opt-savings"), [key("p-date")]: "2026-11-06T10:00:00.000Z",
    [key("p-account")]: key("opt-checking"), [key("p-recurring")]: true,
  }),
  record(key("r-groceries"), DB, {
    [key("p-title")]: "Weekly groceries", [key("p-amount")]: -86.4,
    [key("p-category")]: key("opt-food"), [key("p-date")]: "2026-11-09T18:00:00.000Z",
    [key("p-account")]: key("opt-card"), [key("p-recurring")]: false,
  }),
  record(key("r-cinema"), DB, {
    [key("p-title")]: "Cinema with Sam", [key("p-amount")]: -24,
    [key("p-category")]: key("opt-fun"), [key("p-date")]: "2026-11-14T19:30:00.000Z",
    [key("p-account")]: key("opt-cash"), [key("p-recurring")]: false,
  }),
  record(key("r-freelance"), DB, {
    [key("p-title")]: "Freelance design payment", [key("p-amount")]: 450,
    [key("p-category")]: key("opt-income"), [key("p-date")]: "2026-11-17T12:00:00.000Z",
    [key("p-account")]: key("opt-checking"), [key("p-recurring")]: false,
  }),
];

const template: TemplateBody = {
  content: scopeIds(regionPage(headerFooterShell, {
    header: [
      heading(key("h-title"), "Personal finance", 1),
      p("Record income and spending in one ledger, then review the amounts, categories, and timing at a glance."),
    ],
    main: [dbInline(DB, key("v-dashboard")), dbInline(DB, key("v-table")), dbInline(DB, key("v-chart")), dbInline(DB, key("v-calendar"))],
    footer: [
      heading(key("h-review"), "A useful weekly review", 2),
      p("Check recurring costs, categorize new transactions, and compare the net amount with your savings goal."),
    ],
  }), "personal-finance"),
  databases: database({
    id: DB, name: "Transactions", icon: "💰",
    properties: [
      { id: key("p-title"), name: "Transaction", type: "title" },
      { id: key("p-amount"), name: "Amount", type: "number" },
      selectProperty(key("p-category"), "Category", [
        [key("opt-rent"), "Rent", "orange"], [key("opt-food"), "Food", "green"],
        [key("opt-transport"), "Transport", "blue"], [key("opt-fun"), "Fun", "purple"],
        [key("opt-savings"), "Savings", "yellow"], [key("opt-income"), "Income", "pink"],
      ]),
      { id: key("p-date"), name: "Date", type: "date" },
      selectProperty(key("p-account"), "Account", [
        [key("opt-checking"), "Checking", "blue"], [key("opt-card"), "Card", "purple"],
        [key("opt-cash"), "Cash", "green"],
      ]),
      { id: key("p-recurring"), name: "Recurring", type: "checkbox" },
    ],
    views, rows,
  }),
};

export default template;
