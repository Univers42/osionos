/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   opsActivityViewPresets.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Curated view presets for the OPS (mysql-ops: projects, tasks, tickets,
 * time_entries) and ACTIVITY (mongo-activity: events, product_reviews,
 * notes) live mounts — the MySQL/Mongo halves of `make seed-live-demo`.
 * Same composable registry as the commerce/agency packs. Calendars run on
 * real DATE columns, feeds on the mongo event stream, dashboards aggregate
 * live decimal columns (hours, budget, rating).
 */

import type { DatabaseSchema, ViewConfig } from "@/shared/notion-database-sys/src/component/types";
import type { LiveMountRef } from "@/shared/notion-database-sys/src/store/live/liveTypes";
import {
  registerLiveTablePresets,
  type LiveTablePreset,
} from "@/shared/notion-database-sys/src/store/live/liveViewPresets";
import { presetView } from "./livePresetView";

function tableViews(database: DatabaseSchema, ref: LiveMountRef): ViewConfig[] {
  switch (ref.table) {
    case "projects":
      return [
        presetView(database, "ops", "board", "By Status", "board", {
          grouping: { propertyId: "status" },
        }),
        presetView(database, "ops", "budget", "Budgets", "dashboard", {
          settings: { widgets: [
            { id: "o-projects", type: "stat", title: "Projects", aggregation: "count", width: 1, height: 1 },
            { id: "o-budget", type: "stat", title: "Total budget", propertyId: "budget", aggregation: "sum", width: 1, height: 1 },
            { id: "o-avg", type: "stat", title: "Average budget", propertyId: "budget", aggregation: "average", width: 1, height: 1 },
            { id: "o-status", type: "chart", title: "By status", propertyId: "status", chartStyle: "donut", width: 2, height: 2 },
          ] },
        }),
      ];
    case "tasks":
      return [
        presetView(database, "ops", "priority", "By Priority", "board", {
          grouping: { propertyId: "priority" },
        }),
        presetView(database, "ops", "due", "Due Calendar", "calendar", {
          settings: { showCalendarBy: "due_on", showCalendarAs: "month", showWeekends: true },
        }),
        presetView(database, "ops", "load", "Workload", "chart", {
          settings: { chartType: "vertical_bar", xAxisProperty: "status", yAxisProperty: "estimate_h", yAxisAggregation: "sum" },
        }),
      ];
    case "tickets":
      return [
        presetView(database, "ops", "severity", "By Severity", "board", {
          grouping: { propertyId: "severity" },
        }),
        presetView(database, "ops", "inbox", "Inbox", "feed", {
          sorts: [{ id: "o-opened", propertyId: "opened_at", direction: "desc" }],
          settings: { showAuthorByline: false, showPageIcon: false },
        }),
        presetView(database, "ops", "support", "Support Stats", "dashboard", {
          settings: { widgets: [
            { id: "o-open", type: "stat", title: "Tickets", aggregation: "count", width: 1, height: 1 },
            { id: "o-csat", type: "stat", title: "Avg satisfaction", propertyId: "satisfaction", aggregation: "average", width: 1, height: 1 },
            { id: "o-sev", type: "chart", title: "By severity", propertyId: "severity", chartStyle: "donut", width: 2, height: 2 },
            { id: "o-chan", type: "chart", title: "By channel", propertyId: "channel", chartStyle: "bar", width: 2, height: 2 },
          ] },
        }),
      ];
    case "time_entries":
      return [
        presetView(database, "ops", "calendar", "Time Calendar", "calendar", {
          settings: { showCalendarBy: "entry_date", showCalendarAs: "week" },
        }),
        presetView(database, "ops", "hours", "Hours by Person", "chart", {
          settings: { chartType: "horizontal_bar", xAxisProperty: "person", yAxisProperty: "hours", yAxisAggregation: "sum" },
        }),
      ];
    case "events":
      return [
        presetView(database, "activity", "stream", "Live Stream", "feed", {
          sorts: [{ id: "a-ts", propertyId: "ts", direction: "desc" }],
          settings: { showAuthorByline: false, showPageIcon: false },
        }),
        presetView(database, "activity", "kinds", "By Kind", "chart", {
          settings: { chartType: "vertical_bar", xAxisProperty: "kind", yAxisAggregation: "count" },
        }),
      ];
    case "product_reviews":
      return [
        presetView(database, "activity", "latest", "Latest Reviews", "feed", {
          sorts: [{ id: "a-reviewed", propertyId: "reviewed_at", direction: "desc" }],
          settings: { showAuthorByline: false },
        }),
        presetView(database, "activity", "ratings", "Ratings", "dashboard", {
          settings: { widgets: [
            { id: "a-count", type: "stat", title: "Reviews", aggregation: "count", width: 1, height: 1 },
            { id: "a-avg", type: "stat", title: "Average rating", propertyId: "rating", aggregation: "average", width: 1, height: 1 },
            { id: "a-dist", type: "chart", title: "Rating distribution", propertyId: "rating", chartStyle: "bar", width: 2, height: 2 },
          ] },
        }),
      ];
    case "notes":
      return [
        presetView(database, "activity", "wall", "Notes Wall", "gallery", {
          settings: { cardPreview: "page_properties", cardSize: "medium" },
        }),
      ];
    default:
      return [];
  }
}

/** Ops + activity table presets (related_kind upgraded to select lanes). */
const OPS_ACTIVITY_TABLE_PRESETS: Record<string, LiveTablePreset> = {
  projects: { views: tableViews },
  tasks: { views: tableViews },
  tickets: { views: tableViews },
  time_entries: { views: tableViews },
  events: { views: tableViews },
  product_reviews: { views: tableViews },
  notes: { selectColumns: ["related_kind"], views: tableViews },
};

registerLiveTablePresets((ref) => OPS_ACTIVITY_TABLE_PRESETS[ref.table] ?? null);
