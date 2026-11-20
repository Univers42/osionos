/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   event-planner.ts                                   :+:      :+:    :+:   */
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

const key = (suffix: string): string => `event-planner-${suffix}`;
const TASKS = key("db-tasks");
const GUESTS = key("db-guests");

const overview = tileRow(key("row-overview"), [
  statTile(key("w-count"), key("v-table"), "Tasks", "count"),
  statTile(key("w-cost"), key("v-table"), "Budget booked", "sum", key("p-cost")),
  statTile(key("w-largest"), key("v-table"), "Largest cost", "max", key("p-cost")),
  statTile(key("w-phases"), key("v-table"), "Phases in use", "distinct", key("p-phase")),
]);

const taskViews = [
  view(key("v-calendar"), TASKS, "Deadline calendar", "calendar", { showCalendarBy: key("p-due"), showCalendarAs: "month" }),
  { ...view(key("v-board"), TASKS, "Tasks by phase", "board"), grouping: { propertyId: key("p-phase") } },
  view(key("v-table"), TASKS, "All tasks", "table"),
  view(key("v-dashboard"), TASKS, "Event overview", "dashboard", dashboardSettings([overview])),
];

const taskRows = [
  record(key("r-venue"), TASKS, {
    [key("p-title")]: "Book the venue hall", [key("p-phase")]: key("opt-venue"),
    [key("p-due")]: "2026-11-26T09:00:00.000Z", [key("p-cost")]: 1200, [key("p-done")]: true,
  }),
  record(key("r-invites"), TASKS, {
    [key("p-title")]: "Send the invitations", [key("p-phase")]: key("opt-guests"),
    [key("p-due")]: "2026-11-24T09:00:00.000Z", [key("p-cost")]: 80, [key("p-done")]: true,
  }),
  record(key("r-catering"), TASKS, {
    [key("p-title")]: "Confirm the catering menu", [key("p-phase")]: key("opt-food"),
    [key("p-due")]: "2026-12-01T09:00:00.000Z", [key("p-cost")]: 600,
  }),
  record(key("r-program"), TASKS, {
    [key("p-title")]: "Draft the evening program", [key("p-phase")]: key("opt-program"),
    [key("p-due")]: "2026-12-03T09:00:00.000Z", [key("p-cost")]: 150,
  }),
  record(key("r-photos"), TASKS, {
    [key("p-title")]: "Book the photographer", [key("p-phase")]: key("opt-program"),
    [key("p-due")]: "2026-12-05T09:00:00.000Z", [key("p-cost")]: 350,
  }),
  record(key("r-afterparty"), TASKS, {
    [key("p-title")]: "Plan the after-party", [key("p-phase")]: key("opt-after"),
    [key("p-due")]: "2026-12-08T09:00:00.000Z", [key("p-cost")]: 300,
  }),
];

const tasks = database({
  id: TASKS, name: "Tasks", icon: "📋",
  properties: [
    { id: key("p-title"), name: "Task", type: "title" },
    selectProperty(key("p-phase"), "Phase", [
      [key("opt-venue"), "Venue", "gray"], [key("opt-guests"), "Guests", "blue"],
      [key("opt-food"), "Food", "orange"], [key("opt-program"), "Program", "purple"],
      [key("opt-after"), "After", "green"],
    ]),
    { id: key("p-due"), name: "Due date", type: "date" },
    { id: key("p-cost"), name: "Cost", type: "number" },
    { id: key("p-done"), name: "Done", type: "checkbox" },
  ],
  views: taskViews, rows: taskRows,
});

const guests = database({
  id: GUESTS, name: "Guests", icon: "💌",
  properties: [
    { id: key("p-guest-title"), name: "Guest", type: "title" },
    selectProperty(key("p-rsvp"), "RSVP", [
      [key("opt-yes"), "Yes", "green"], [key("opt-no"), "No", "red"], [key("opt-maybe"), "Maybe", "yellow"],
    ]),
    { id: key("p-plusone"), name: "Plus one", type: "checkbox" },
    { id: key("p-diet"), name: "Diet", type: "text" },
  ],
  views: [view(key("v-guests-table"), GUESTS, "Guest list", "table")],
  rows: [
    record(key("r-guest-sam"), GUESTS, {
      [key("p-guest-title")]: "Sam", [key("p-rsvp")]: key("opt-yes"), [key("p-plusone")]: true,
      [key("p-diet")]: "Vegetarian",
    }),
    record(key("r-guest-alex"), GUESTS, { [key("p-guest-title")]: "Alex", [key("p-rsvp")]: key("opt-no") }),
    record(key("r-guest-priya"), GUESTS, {
      [key("p-guest-title")]: "Priya", [key("p-rsvp")]: key("opt-maybe"), [key("p-diet")]: "Gluten-free",
    }),
    record(key("r-guest-noor"), GUESTS, {
      [key("p-guest-title")]: "Noor", [key("p-rsvp")]: key("opt-yes"), [key("p-diet")]: "Halal",
    }),
    record(key("r-guest-jonas"), GUESTS, {
      [key("p-guest-title")]: "Jonas", [key("p-rsvp")]: key("opt-maybe"), [key("p-plusone")]: true,
    }),
    record(key("r-guest-lena"), GUESTS, { [key("p-guest-title")]: "Lena", [key("p-rsvp")]: key("opt-yes") }),
  ],
});

const template: TemplateBody = {
  content: scopeIds(regionPage(rightSidebarShell, {
    header: [
      heading(key("h-title"), "Event planner", 1),
      p("Keep every deadline, cost, and RSVP in one place so the event comes together without surprises."),
    ],
    main: [dbInline(TASKS, key("v-dashboard")), dbInline(TASKS, key("v-calendar")), dbInline(TASKS, key("v-board"))],
    right: [
      heading(key("h-guests"), "Guest list", 2),
      p("Update RSVPs as replies arrive and note diets so the catering brief stays easy."),
      dbInline(GUESTS, key("v-guests-table")),
    ],
  }), "event-planner"),
  databases: mergeSlices(tasks, guests),
};

export default template;
