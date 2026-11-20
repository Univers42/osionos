/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   travel-planner.ts                                  :+:      :+:    :+:   */
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
import { database, mergeSlices, record } from "./builders/databases";
import { selectProperty } from "./builders/options";
import { regionPage, scopeIds } from "./builders/regions";
import { view } from "./builders/views";
import type { TemplateBody } from "./types";

const key = (suffix: string): string => `travel-planner-${suffix}`;
const ITINERARY = key("db-itinerary");
const PACKING = key("db-packing");

const overview = tileRow(key("row-overview"), [
  statTile(key("w-count"), key("v-table"), "Trip stops", "count"),
  statTile(key("w-budget"), key("v-table"), "Planned spend", "sum", key("p-cost")),
  statTile(key("w-biggest"), key("v-table"), "Biggest expense", "max", key("p-cost")),
  statTile(key("w-cities"), key("v-table"), "Cities visited", "distinct", key("p-city")),
]);

const itineraryViews = [
  view(key("v-calendar"), ITINERARY, "Trip calendar", "calendar", { showCalendarBy: key("p-day"), showCalendarAs: "month" }),
  view(key("v-timeline"), ITINERARY, "Day-by-day timeline", "timeline", { showTimelineBy: key("p-day"), showTable: true, zoomLevel: "month" }),
  view(key("v-table"), ITINERARY, "All stops", "table"),
  view(key("v-dashboard"), ITINERARY, "Trip overview", "dashboard", dashboardSettings([overview])),
];

const itineraryRows = [
  record(key("r-flight-out"), ITINERARY, {
    [key("p-title")]: "Flight to Lisbon", [key("p-day")]: "2026-05-04T07:30:00.000Z", [key("p-kind")]: key("opt-flight"),
    [key("p-city")]: key("opt-lisbon"), [key("p-cost")]: 180, [key("p-booked")]: true,
    [key("p-link")]: "https://example.com/trips/lisbon-flight",
  }),
  record(key("r-stay-alfama"), ITINERARY, {
    [key("p-title")]: "Guesthouse in Alfama", [key("p-day")]: "2026-05-04T15:00:00.000Z", [key("p-kind")]: key("opt-stay"),
    [key("p-city")]: key("opt-lisbon"), [key("p-cost")]: 240, [key("p-booked")]: true,
    [key("p-link")]: "https://example.com/trips/alfama-guesthouse",
  }),
  record(key("r-tram"), ITINERARY, {
    [key("p-title")]: "Tram 28 and miradouro walk", [key("p-day")]: "2026-05-05T10:00:00.000Z", [key("p-kind")]: key("opt-activity"),
    [key("p-city")]: key("opt-lisbon"), [key("p-cost")]: 12, [key("p-booked")]: false,
    [key("p-link")]: "https://example.com/trips/tram-28",
  }),
  record(key("r-tasca"), ITINERARY, {
    [key("p-title")]: "Dinner at a tasca in Bairro Alto", [key("p-day")]: "2026-05-05T20:00:00.000Z", [key("p-kind")]: key("opt-food"),
    [key("p-city")]: key("opt-lisbon"), [key("p-cost")]: 35, [key("p-booked")]: false,
    [key("p-link")]: "https://example.com/trips/bairro-alto-dinner",
  }),
  record(key("r-train-porto"), ITINERARY, {
    [key("p-title")]: "Train to Porto", [key("p-day")]: "2026-05-06T09:15:00.000Z", [key("p-kind")]: key("opt-transit"),
    [key("p-city")]: key("opt-porto"), [key("p-cost")]: 28, [key("p-booked")]: true,
    [key("p-link")]: "https://example.com/trips/lisbon-porto-train",
  }),
  record(key("r-cellar"), ITINERARY, {
    [key("p-title")]: "Cellar tour across the river", [key("p-day")]: "2026-05-06T16:00:00.000Z", [key("p-kind")]: key("opt-activity"),
    [key("p-city")]: key("opt-porto"), [key("p-cost")]: 22, [key("p-booked")]: false,
    [key("p-link")]: "https://example.com/trips/porto-cellar",
  }),
];

const itinerary = database({
  id: ITINERARY, name: "Itinerary", icon: "🗺️",
  properties: [
    { id: key("p-title"), name: "Stop", type: "title" },
    { id: key("p-day"), name: "Day", type: "date" },
    selectProperty(key("p-kind"), "Kind", [
      [key("opt-flight"), "Flight", "blue"], [key("opt-stay"), "Stay", "purple"],
      [key("opt-activity"), "Activity", "green"], [key("opt-food"), "Food", "orange"], [key("opt-transit"), "Transit", "gray"],
    ]),
    selectProperty(key("p-city"), "City", [
      [key("opt-lisbon"), "Lisbon", "blue"], [key("opt-porto"), "Porto", "green"],
    ]),
    { id: key("p-cost"), name: "Cost", type: "number" },
    { id: key("p-booked"), name: "Booked", type: "checkbox" },
    { id: key("p-link"), name: "Link", type: "url" },
  ],
  views: itineraryViews, rows: itineraryRows,
});

const packing = database({
  id: PACKING, name: "Packing", icon: "🧳",
  properties: [
    { id: key("p-pack-title"), name: "Item", type: "title" },
    selectProperty(key("p-bag"), "Bag", [
      [key("opt-carry-on"), "Carry-on", "blue"], [key("opt-checked"), "Checked", "purple"],
    ]),
    { id: key("p-packed"), name: "Packed", type: "checkbox" },
  ],
  views: [view(key("v-packing"), PACKING, "Packing list", "table")],
  rows: [
    record(key("r-passport"), PACKING, { [key("p-pack-title")]: "Passport and boarding passes", [key("p-bag")]: key("opt-carry-on"), [key("p-packed")]: true }),
    record(key("r-charger"), PACKING, { [key("p-pack-title")]: "Phone charger and adapter", [key("p-bag")]: key("opt-carry-on"), [key("p-packed")]: true }),
    record(key("r-jacket"), PACKING, { [key("p-pack-title")]: "Light rain jacket", [key("p-bag")]: key("opt-carry-on"), [key("p-packed")]: false }),
    record(key("r-shoes"), PACKING, { [key("p-pack-title")]: "Walking shoes", [key("p-bag")]: key("opt-checked"), [key("p-packed")]: false }),
    record(key("r-sunscreen"), PACKING, { [key("p-pack-title")]: "Sunscreen and sunglasses", [key("p-bag")]: key("opt-checked"), [key("p-packed")]: false }),
  ],
});

const template: TemplateBody = {
  content: scopeIds(regionPage(headerFooterShell, {
    header: [
      heading(key("h-title"), "Travel planner", 1),
      p("Lay out the trip day by day, keep an eye on the budget, and pack without the last-minute scramble."),
    ],
    main: [
      dbInline(ITINERARY, key("v-dashboard")), dbInline(ITINERARY, key("v-calendar")),
      dbInline(ITINERARY, key("v-timeline")), dbInline(ITINERARY, key("v-table")),
    ],
    footer: [
      heading(key("h-packing"), "Pack the night before", 2),
      p("Tick items off as they go into each bag, and keep travel documents in the carry-on."),
      dbInline(PACKING, key("v-packing")),
    ],
  }), "travel-planner"),
  databases: mergeSlices(itinerary, packing),
};

export default template;