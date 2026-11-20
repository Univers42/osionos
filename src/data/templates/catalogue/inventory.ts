/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inventory.ts                                       :+:      :+:    :+:   */
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
import { database, record } from "./builders/databases";
import { selectProperty } from "./builders/options";
import { regionPage, scopeIds } from "./builders/regions";
import { view } from "./builders/views";
import type { TemplateBody } from "./types";

const key = (suffix: string): string => `inventory-${suffix}`;
const DB = key("db-items");

const overview = tileRow(key("row-overview"), [
  statTile(key("w-count"), key("v-table"), "Items tracked", "count"),
  statTile(key("w-stock"), key("v-table"), "Units in stock", "sum", key("p-stock")),
  statTile(key("w-lowest"), key("v-table"), "Lowest stock", "min", key("p-stock")),
  statTile(key("w-cost"), key("v-table"), "Average unit cost", "avg", key("p-cost")),
]);

const views = [
  view(key("v-table"), DB, "Stock table", "table"),
  view(key("v-gallery"), DB, "Shelf gallery", "gallery", { cardSize: "medium", cardPreview: "none" }),
  { ...view(key("v-board"), DB, "By category", "board"), grouping: { propertyId: key("p-category") } },
  view(key("v-dashboard"), DB, "Stock overview", "dashboard", dashboardSettings([overview])),
];

const rows = [
  record(key("r-notebooks"), DB, {
    [key("p-title")]: "A5 dotted notebooks", [key("p-category")]: key("opt-stationery"), [key("p-location")]: key("opt-shelf-a"),
    [key("p-stock")]: 42, [key("p-reorder")]: 15, [key("p-cost")]: 6.5,
    [key("p-counted")]: "2026-11-16T09:00:00.000Z", [key("p-supplier")]: "https://example.com/suppliers/paperlane",
  }),
  record(key("r-pens"), DB, {
    [key("p-title")]: "Fine-tip black pens (box of 12)", [key("p-category")]: key("opt-stationery"), [key("p-location")]: key("opt-shelf-a"),
    [key("p-stock")]: 8, [key("p-reorder")]: 10, [key("p-cost")]: 9,
    [key("p-counted")]: "2026-11-16T09:00:00.000Z", [key("p-supplier")]: "https://example.com/suppliers/paperlane",
  }),
  record(key("r-keyboards"), DB, {
    [key("p-title")]: "Wireless keyboards", [key("p-category")]: key("opt-electronics"), [key("p-location")]: key("opt-shelf-b"),
    [key("p-stock")]: 14, [key("p-reorder")]: 5, [key("p-cost")]: 39,
    [key("p-counted")]: "2026-11-17T09:00:00.000Z", [key("p-supplier")]: "https://example.com/suppliers/voltway",
  }),
  record(key("r-cables"), DB, {
    [key("p-title")]: "USB-C cables, one metre", [key("p-category")]: key("opt-electronics"), [key("p-location")]: key("opt-back-room"),
    [key("p-stock")]: 3, [key("p-reorder")]: 12, [key("p-cost")]: 7.25,
    [key("p-counted")]: "2026-11-17T09:00:00.000Z", [key("p-supplier")]: "https://example.com/suppliers/voltway",
  }),
  record(key("r-boxes"), DB, {
    [key("p-title")]: "Small shipping boxes", [key("p-category")]: key("opt-packaging"), [key("p-location")]: key("opt-back-room"),
    [key("p-stock")]: 120, [key("p-reorder")]: 40, [key("p-cost")]: 0.85,
    [key("p-counted")]: "2026-11-18T09:00:00.000Z", [key("p-supplier")]: "https://example.com/suppliers/boxfold",
  }),
  record(key("r-wipes"), DB, {
    [key("p-title")]: "Screen cleaning wipes", [key("p-category")]: key("opt-cleaning"), [key("p-location")]: key("opt-shelf-b"),
    [key("p-stock")]: 26, [key("p-reorder")]: 10, [key("p-cost")]: 4.2,
    [key("p-counted")]: "2026-11-18T09:00:00.000Z", [key("p-supplier")]: "https://example.com/suppliers/clearview",
  }),
];

const template: TemplateBody = {
  content: scopeIds(regionPage(rightSidebarShell, {
    header: [
      heading(key("h-title"), "Inventory", 1),
      p("Know what is on each shelf, what is running low, and what a reorder will cost before you place it."),
    ],
    main: [dbInline(DB, key("v-dashboard")), dbInline(DB, key("v-table")), dbInline(DB, key("v-gallery"))],
    right: [
      heading(key("h-reorder"), "Reorder watch", 2),
      p("Compare In stock with Reorder at after every count, and group by category to batch supplier orders."),
      dbInline(DB, key("v-board")),
    ],
  }), "inventory"),
  databases: database({
    id: DB, name: "Items", icon: "📦",
    properties: [
      { id: key("p-title"), name: "Item", type: "title" },
      selectProperty(key("p-category"), "Category", [
        [key("opt-stationery"), "Stationery", "blue"], [key("opt-electronics"), "Electronics", "purple"],
        [key("opt-packaging"), "Packaging", "brown"], [key("opt-cleaning"), "Cleaning", "green"],
      ]),
      selectProperty(key("p-location"), "Location", [
        [key("opt-shelf-a"), "Shelf A", "blue"], [key("opt-shelf-b"), "Shelf B", "yellow"],
        [key("opt-back-room"), "Back room", "gray"],
      ]),
      { id: key("p-stock"), name: "In stock", type: "number" },
      { id: key("p-reorder"), name: "Reorder at", type: "number" },
      { id: key("p-cost"), name: "Unit cost", type: "number" },
      { id: key("p-counted"), name: "Last counted", type: "date" },
      { id: key("p-supplier"), name: "Supplier", type: "url" },
    ],
    views, rows,
  }),
};

export default template;