/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   agencyViewPresets.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Investigation view presets for the AGENCY live tenant (registered into
 * notion-database-sys' liveViewPresets registry on import — see the
 * side-effect import in liveDatabaseAdapter). Presets are keyed by TABLE
 * NAME, so any live mount exposing the agency schema (cases, locations,
 * evidence, …) gets the curated defaults: board (cases by status), map
 * (locations lat/lng via the derived place property), timeline (cases
 * opened_at→closed_at — auto-detected by the timeline view), feed (reports),
 * gallery (evidence) and a case-stats dashboard. Text status-like columns
 * are upgraded to select (options synthesized from the loaded rows) so
 * boards get colored columns and dashboards can chart them.
 */

import type { DatabaseSchema, ViewConfig } from "@/shared/notion-database-sys/src/component/types";
import type { DashboardWidget } from "@/shared/notion-database-sys/src/types/views";
import type { LiveMountRef } from "@/shared/notion-database-sys/src/store/live/liveTypes";
import {
  LIVE_PLACE_PROPERTY_ID,
  registerLiveTablePresets,
  type LiveTablePreset,
} from "@/shared/notion-database-sys/src/store/live/liveViewPresets";

/** One curated ViewConfig (id namespaced under the live database id). */
function presetView(
  database: DatabaseSchema,
  slug: string,
  name: string,
  type: ViewConfig["type"],
  overrides: Partial<Pick<ViewConfig, "grouping" | "sorts" | "settings">> = {},
): ViewConfig {
  const visibleProperties = Object.keys(database.properties)
    .filter((propertyId) => propertyId !== database.titlePropertyId);
  return {
    id: `${database.id}#agency-${slug}`,
    databaseId: database.id,
    name,
    type,
    filters: [],
    filterConjunction: "and",
    sorts: [],
    visibleProperties,
    settings: { openPagesIn: "side_peek" },
    ...overrides,
  };
}

/** Case-stats dashboard widgets (counts + budget + status/priority charts). */
function caseStatWidgets(): DashboardWidget[] {
  return [
    { id: "agency-w-total", type: "stat", title: "Total cases", aggregation: "count", width: 1, height: 1 },
    { id: "agency-w-budget", type: "stat", title: "Total budget", propertyId: "budget", aggregation: "sum", width: 1, height: 1 },
    { id: "agency-w-avg-budget", type: "stat", title: "Average budget", propertyId: "budget", aggregation: "average", width: 1, height: 1 },
    { id: "agency-w-recent", type: "list", title: "Recently updated", width: 1, height: 2 },
    { id: "agency-w-status", type: "chart", title: "Cases by status", propertyId: "status", chartStyle: "donut", width: 2, height: 2 },
    { id: "agency-w-priority", type: "chart", title: "Cases by priority", propertyId: "priority", chartStyle: "bar", width: 2, height: 2 },
  ];
}

/** Curated views per agency table (called by the live state builder). */
function agencyViews(database: DatabaseSchema, ref: LiveMountRef): ViewConfig[] {
  switch (ref.table) {
    case "cases":
      return [
        presetView(database, "board", "By Status", "board", { grouping: { propertyId: "status" } }),
        presetView(database, "timeline", "Case Timeline", "timeline", {
          settings: { openPagesIn: "side_peek", showTimelineBy: "opened_at", timelineEndBy: "closed_at", separateStartEndDates: true },
        }),
        presetView(database, "dashboard", "Case Stats", "dashboard", {
          settings: { openPagesIn: "side_peek", widgets: caseStatWidgets() },
        }),
      ];
    case "locations":
      return [
        presetView(database, "map", "Map", "map", {
          settings: { openPagesIn: "side_peek", mapBy: LIVE_PLACE_PROPERTY_ID },
        }),
      ];
    case "reports":
      return [
        presetView(database, "feed", "Reports Feed", "feed", {
          sorts: [{ id: "agency-s-published", propertyId: "published_at", direction: "desc" }],
          settings: { openPagesIn: "side_peek", showAuthorByline: true, showPageIcon: false },
        }),
      ];
    case "evidence":
      return [
        presetView(database, "gallery", "Evidence Gallery", "gallery", {
          settings: { openPagesIn: "side_peek", cardPreview: "page_properties", cardSize: "medium" },
        }),
      ];
    default:
      return [];
  }
}

/** Agency table presets: curated views + select upgrades + the map source. */
const AGENCY_TABLE_PRESETS: Record<string, LiveTablePreset> = {
  cases: { selectColumns: ["status", "priority", "classification"], views: agencyViews },
  locations: {
    selectColumns: ["kind", "country"],
    place: { lat: "lat", lng: "lng", address: "address" },
    views: agencyViews,
  },
  reports: { selectColumns: ["status", "classification"], views: agencyViews },
  evidence: { selectColumns: ["kind"], views: agencyViews },
  leads: { selectColumns: ["status", "credibility", "source"] },
  subjects: { selectColumns: ["risk_level", "nationality"] },
  transactions: { selectColumns: ["currency", "method"] },
  communications: { selectColumns: ["channel", "classification"] },
  assignments: { selectColumns: ["role_on_case"] },
};

registerLiveTablePresets((ref) => AGENCY_TABLE_PRESETS[ref.table] ?? null);
