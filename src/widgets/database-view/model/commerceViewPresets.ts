/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   commerceViewPresets.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Curated view presets for the COMMERCE live mount (pg-commerce: orders,
 * customers, products, inventory, employees — seeded by `make
 * seed-live-demo`). Keyed by TABLE NAME through the composable
 * liveViewPresets registry, so they coexist with the agency pack. Every pack
 * view runs on REAL engine rows: fulfillment timeline (placed→shipped),
 * revenue dashboards (sum/avg over the numeric columns), category galleries
 * and region boards — view shapes Notion itself doesn't ship (dashboard,
 * chart-native views) on top of a live PostgreSQL mount.
 */

import type { DatabaseSchema, ViewConfig } from "@/shared/notion-database-sys/src/component/types";
import type { LiveMountRef } from "@/shared/notion-database-sys/src/store/live/liveTypes";
import {
  registerLiveTablePresets,
  type LiveTablePreset,
} from "@/shared/notion-database-sys/src/store/live/liveViewPresets";
import { presetView } from "./livePresetView";

/** Conditional-color rules shared by the orders views (token ids from the
 *  conditionalColor lib; live enum option id === raw value). */
const ORDER_STATUS_COLORS = [
  { id: "cc-delivered", propertyId: "status", operator: "equals" as const, value: "delivered", color: "green" },
  { id: "cc-cancelled", propertyId: "status", operator: "equals" as const, value: "cancelled", color: "red" },
  { id: "cc-pending", propertyId: "status", operator: "equals" as const, value: "pending", color: "yellow" },
];

function ordersViews(database: DatabaseSchema, _ref: LiveMountRef): ViewConfig[] {
  return [
    presetView(database, "commerce", "pipeline", "Pipeline", "board", {
      grouping: { propertyId: "status" },
      settings: { conditionalColors: ORDER_STATUS_COLORS },
    }),
    presetView(database, "commerce", "fulfillment", "Fulfillment", "timeline", {
      settings: { showTimelineBy: "placed_at", timelineEndBy: "shipped_at", separateStartEndDates: true },
    }),
    presetView(database, "commerce", "revenue", "Revenue by Status", "chart", {
      settings: { chartType: "vertical_bar", xAxisProperty: "status", yAxisProperty: "total", yAxisAggregation: "sum", showDataLabels: true, conditionalColors: ORDER_STATUS_COLORS },
    }),
    presetView(database, "commerce", "funnel", "Status Funnel", "chart", {
      settings: { chartType: "funnel", xAxisProperty: "status" },
    }),
    presetView(database, "commerce", "mix", "Status × Ship Heatmap", "chart", {
      settings: { chartType: "heatmap", xAxisProperty: "status", yAxisGroupBy: "ship_method" },
    }),
    presetView(database, "commerce", "gauge", "Revenue Gauge", "chart", {
      settings: { chartType: "progress_gauge", xAxisProperty: "status", yAxisProperty: "total", yAxisAggregation: "sum", yAxisTitle: "Revenue" },
    }),
    presetView(database, "commerce", "waterfall", "Revenue Waterfall", "chart", {
      settings: { chartType: "waterfall", xAxisProperty: "status", yAxisProperty: "total", yAxisAggregation: "sum" },
    }),
    presetView(database, "commerce", "hub", "Analytics Hub", "dashboard", {
      settings: {
        dashboardWidgets: [
          { id: "hub-rev", viewId: `${database.id}#commerce-revenue`, title: "Revenue by status" },
          { id: "hub-funnel", viewId: `${database.id}#commerce-funnel`, title: "Order funnel" },
          { id: "hub-gauge", viewId: `${database.id}#commerce-gauge`, hideTitle: true },
          { id: "hub-mix", viewId: `${database.id}#commerce-mix`, title: "Status × ship method" },
        ],
        dashboardRows: [
          { id: "hub-r1", widgetIds: ["hub-rev", "hub-funnel"], widths: [0.55, 0.45], height: 340 },
          { id: "hub-r2", widgetIds: ["hub-gauge", "hub-mix"], widths: [0.35, 0.65], height: 320 },
        ],
      },
    }),
    presetView(database, "commerce", "stats", "Store Stats", "dashboard", {
      settings: { widgets: [
        { id: "c-orders", type: "stat", title: "Orders", aggregation: "count", width: 1, height: 1 },
        { id: "c-revenue", type: "stat", title: "Revenue", propertyId: "total", aggregation: "sum", width: 1, height: 1 },
        { id: "c-avg", type: "stat", title: "Average order", propertyId: "total", aggregation: "average", width: 1, height: 1 },
        { id: "c-recent", type: "list", title: "Recently updated", width: 1, height: 2 },
        { id: "c-status", type: "chart", title: "Orders by status", propertyId: "status", chartStyle: "donut", width: 2, height: 2 },
        { id: "c-ship", type: "chart", title: "Ship methods", propertyId: "ship_method", chartStyle: "bar", width: 2, height: 2 },
      ] },
    }),
  ];
}

function tableViews(database: DatabaseSchema, ref: LiveMountRef): ViewConfig[] {
  switch (ref.table) {
    case "orders":
      return ordersViews(database, ref);
    case "customers":
      return [
        presetView(database, "commerce", "regions", "By Region", "board", {
          grouping: { propertyId: "region" },
        }),
        presetView(database, "commerce", "crm", "Customer Stats", "dashboard", {
          settings: { widgets: [
            { id: "c-count", type: "stat", title: "Customers", aggregation: "count", width: 1, height: 1 },
            { id: "c-ltv", type: "stat", title: "Lifetime value", propertyId: "lifetime_value", aggregation: "sum", width: 1, height: 1 },
            { id: "c-avg-ltv", type: "stat", title: "Average LTV", propertyId: "lifetime_value", aggregation: "average", width: 1, height: 1 },
            { id: "c-region", type: "chart", title: "By region", propertyId: "region", chartStyle: "donut", width: 2, height: 2 },
            { id: "c-city", type: "chart", title: "Top cities", propertyId: "city", chartStyle: "horizontal_bar", width: 2, height: 2 },
          ] },
        }),
      ];
    case "products":
      return [
        presetView(database, "commerce", "catalog", "Catalog", "gallery", {
          settings: { cardPreview: "page_properties", cardSize: "medium" },
        }),
        presetView(database, "commerce", "categories", "By Category", "board", {
          grouping: { propertyId: "category" },
        }),
        presetView(database, "commerce", "pricing", "Average Price", "chart", {
          settings: { chartType: "horizontal_bar", xAxisProperty: "category", yAxisProperty: "price", yAxisAggregation: "average" },
        }),
        presetView(database, "commerce", "treemap", "Category Treemap", "chart", {
          settings: { chartType: "treemap", xAxisProperty: "category", yAxisProperty: "price", yAxisAggregation: "sum" },
        }),
        presetView(database, "commerce", "sunburst", "Category Sunburst", "chart", {
          settings: { chartType: "sunburst", xAxisProperty: "category" },
        }),
      ];
    case "inventory":
      return [
        presetView(database, "commerce", "warehouses", "By Warehouse", "board", {
          grouping: { propertyId: "warehouse" },
        }),
        presetView(database, "commerce", "stock", "Stock by Warehouse", "chart", {
          settings: { chartType: "vertical_bar", xAxisProperty: "warehouse", yAxisProperty: "qty_on_hand", yAxisAggregation: "sum" },
        }),
      ];
    case "employees":
      return [
        presetView(database, "commerce", "org", "By Role", "board", {
          grouping: { propertyId: "role" },
        }),
        presetView(database, "commerce", "payroll", "Team Stats", "dashboard", {
          settings: { widgets: [
            { id: "c-headcount", type: "stat", title: "Headcount", aggregation: "count", width: 1, height: 1 },
            { id: "c-salary", type: "stat", title: "Average salary", propertyId: "salary", aggregation: "average", width: 1, height: 1 },
            { id: "c-region", type: "chart", title: "By region", propertyId: "region", chartStyle: "donut", width: 2, height: 2 },
          ] },
        }),
      ];
    default:
      return [];
  }
}

/** Commerce table presets (city upgraded to select for board/chart lanes). */
const COMMERCE_TABLE_PRESETS: Record<string, LiveTablePreset> = {
  orders: { views: tableViews },
  customers: { selectColumns: ["city"], views: tableViews },
  products: { views: tableViews },
  inventory: { views: tableViews },
  employees: { views: tableViews },
};

registerLiveTablePresets((ref) => COMMERCE_TABLE_PRESETS[ref.table] ?? null);
