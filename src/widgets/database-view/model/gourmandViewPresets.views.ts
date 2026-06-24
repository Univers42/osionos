/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   gourmandViewPresets.views.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Curated view builders for the VITE & GOURMAND client mount (their real
 * Supabase tables — PascalCase Prisma names, status columns are TEXT so the
 * select lanes come from the pack's selectColumns synthesis). Split from
 * gourmandViewPresets.ts for the 200-line discipline.
 */

import type { DatabaseSchema, ViewConfig } from "@/shared/notion-database-sys/src/component/types";
import { LIVE_PLACE_PROPERTY_ID } from "@/shared/notion-database-sys/src/store/live/liveViewPresets";
import { presetView } from "./livePresetView";

function operationsViews(database: DatabaseSchema, table: string): ViewConfig[] {
  if (table === "Order") {
    return [
      presetView(database, "vg", "pipeline", "Order Pipeline", "board", {
        grouping: { propertyId: "status" },
      }),
      presetView(database, "vg", "deliveries", "Delivery Calendar", "calendar", {
        settings: { showCalendarBy: "delivery_date", showCalendarAs: "week", showWeekends: true },
      }),
      presetView(database, "vg", "revenue", "Revenue", "dashboard", {
        settings: { widgets: [
          { id: "vg-orders", type: "stat", title: "Orders", aggregation: "count", width: 1, height: 1 },
          { id: "vg-menu-rev", type: "stat", title: "Menu revenue", propertyId: "menu_price", aggregation: "sum", width: 1, height: 1 },
          { id: "vg-avg", type: "stat", title: "Average ticket", propertyId: "menu_price", aggregation: "average", width: 1, height: 1 },
          { id: "vg-recent", type: "list", title: "Recently updated", width: 1, height: 2 },
          { id: "vg-status", type: "chart", title: "By status", propertyId: "status", chartStyle: "donut", width: 2, height: 2 },
          { id: "vg-city", type: "chart", title: "Top delivery cities", propertyId: "delivery_city", chartStyle: "horizontal_bar", width: 2, height: 2 },
        ] },
      }),
    ];
  }
  if (table === "KanbanColumn") {
    return [
      presetView(database, "vg", "lanes", "Board Lanes", "table", {
        sorts: [{ id: "vg-pos", propertyId: "position", direction: "asc" }],
        settings: { showRowNumbers: true },
      }),
    ];
  }
  return [];
}

function kitchenViews(database: DatabaseSchema, table: string): ViewConfig[] {
  if (table === "Menu") {
    return [
      presetView(database, "vg", "menus", "By Status", "board", {
        grouping: { propertyId: "status" },
      }),
      presetView(database, "vg", "seasons", "Seasonal Planning", "timeline", {
        settings: { showTimelineBy: "available_from", timelineEndBy: "available_until", separateStartEndDates: true },
      }),
      presetView(database, "vg", "cards", "Menu Cards", "gallery", {
        settings: { cardPreview: "page_properties", cardSize: "medium" },
      }),
    ];
  }
  if (table === "Dish") {
    return [
      presetView(database, "vg", "courses", "By Course", "board", {
        grouping: { propertyId: "course_type" },
      }),
      presetView(database, "vg", "plates", "Plates", "gallery", {
        settings: { cardPreview: "page_properties", cardSize: "medium" },
      }),
    ];
  }
  return [];
}

function staffViews(database: DatabaseSchema, table: string): ViewConfig[] {
  if (table === "TimeOffRequest") {
    return [
      presetView(database, "vg", "absences", "Absence Calendar", "calendar", {
        settings: { showCalendarBy: "start_date", showCalendarAs: "month", showWeekends: true },
      }),
      presetView(database, "vg", "approvals", "Approvals", "board", {
        grouping: { propertyId: "status" },
      }),
    ];
  }
  if (table === "SupportTicket") {
    return [
      presetView(database, "vg", "queue", "Ticket Queue", "board", {
        grouping: { propertyId: "status" },
      }),
      presetView(database, "vg", "support", "Support Stats", "dashboard", {
        settings: { widgets: [
          { id: "vg-open", type: "stat", title: "Tickets", aggregation: "count", width: 1, height: 1 },
          { id: "vg-prio", type: "chart", title: "By priority", propertyId: "priority", chartStyle: "donut", width: 2, height: 2 },
          { id: "vg-cat", type: "chart", title: "By category", propertyId: "category", chartStyle: "bar", width: 2, height: 2 },
        ] },
      }),
    ];
  }
  if (table === "WorkingHours") {
    return [
      presetView(database, "vg", "hours", "Opening Hours", "table", {
        sorts: [{ id: "vg-day", propertyId: "id", direction: "asc" }],
        settings: { showRowNumbers: false },
      }),
    ];
  }
  return [];
}

function customersViews(database: DatabaseSchema, table: string): ViewConfig[] {
  if (table === "UserAddress") {
    return [
      presetView(database, "vg", "map", "Delivery Map", "map", {
        settings: { mapBy: LIVE_PLACE_PROPERTY_ID },
      }),
      presetView(database, "vg", "cities", "By City", "board", {
        grouping: { propertyId: "city" },
      }),
    ];
  }
  if (table === "Event") {
    return [
      presetView(database, "vg", "events", "Event Calendar", "calendar", {
        settings: { showCalendarBy: "event_date", showCalendarAs: "month", showWeekends: true },
      }),
      presetView(database, "vg", "types", "By Type", "board", {
        grouping: { propertyId: "event_type" },
      }),
    ];
  }
  return [];
}

/** All curated views for one gourmand table (empty = defaults only). */
export function gourmandViews(database: DatabaseSchema, table: string): ViewConfig[] {
  return [
    ...operationsViews(database, table),
    ...kitchenViews(database, table),
    ...staffViews(database, table),
    ...customersViews(database, table),
  ];
}
