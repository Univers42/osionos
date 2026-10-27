/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sysHomeDashboards.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { SysBuiltInView } from "./sysDataSources";

// Every widget here is an entry of the engine's dashboard picker (statEntries,
// chartEntries, recordEntries) over the source's columns, so a user can rebuild
// any of them; tests/canvas/home-account.test.ts holds that. A select filters on
// the option id the source synthesizes from its value (`opt-<value>`).

function view(id: string, name: string, settings: Record<string, unknown>): SysBuiltInView {
  return { id, name, type: "dashboard", editable: true, settings };
}

export const SYS_HOME_DASHBOARDS: Record<string, SysBuiltInView[]> = {
  "my-tasks": [
    view("my-tasks-home-dashboard", "Your tasks", {
      dashboardWidgets: [
        { id: "open", viewId: "my-tasks-home-dashboard", title: "Open",
          stat: { fn: "count", where: [{ id: "f-checked", propertyId: "checked", operator: "is_not_checked", value: true }] } },
        { id: "done", viewId: "my-tasks-home-dashboard", title: "Done",
          stat: { fn: "count", where: [{ id: "f-checked", propertyId: "checked", operator: "is_checked", value: true }] } },
        { id: "next-due", viewId: "my-tasks-home-dashboard", title: "Next due",
          records: { sortPropertyId: "due_at", direction: "asc", limit: 10, showPropertyId: "due_at" } },
      ],
      dashboardRows: [
        { id: "r1", widgetIds: ["open", "done"], widths: [0.5, 0.5], height: 120 },
        { id: "r2", widgetIds: ["next-due"], widths: [1], height: 320 },
      ],
    }),
  ],
  "my-pages": [
    view("my-pages-home-dashboard", "Your pages", {
      dashboardWidgets: [
        { id: "pages", viewId: "my-pages-home-dashboard", title: "Pages",
          stat: { fn: "count" } },
        { id: "by-surface", viewId: "my-pages-home-dashboard", title: "By surface",
          chart: { chartType: "vertical_bar", xAxisProperty: "surface", yAxisAggregation: "count" } },
        { id: "recently-edited", viewId: "my-pages-home-dashboard", title: "Recently edited",
          records: { direction: "desc", limit: 10 } },
      ],
      dashboardRows: [
        { id: "r1", widgetIds: ["pages", "by-surface"], widths: [0.33, 0.67], height: 240 },
        { id: "r2", widgetIds: ["recently-edited"], widths: [1], height: 320 },
      ],
    }),
  ],
  "my-connections": [
    view("my-connections-home-dashboard", "Your people", {
      dashboardWidgets: [
        { id: "connected", viewId: "my-connections-home-dashboard", title: "Connected",
          stat: { fn: "count", where: [{ id: "f-status", propertyId: "status", operator: "equals", value: "opt-accepted" }] } },
        { id: "requests", viewId: "my-connections-home-dashboard", title: "Requests",
          stat: { fn: "count", where: [{ id: "f-status", propertyId: "status", operator: "equals", value: "opt-pending" }] } },
        { id: "newest", viewId: "my-connections-home-dashboard", title: "Newest",
          records: { sortPropertyId: "created_at", direction: "desc", limit: 10, showPropertyId: "created_at" } },
      ],
      dashboardRows: [
        { id: "r1", widgetIds: ["connected", "requests"], widths: [0.5, 0.5], height: 120 },
        { id: "r2", widgetIds: ["newest"], widths: [1], height: 320 },
      ],
    }),
  ],
  "my-workspaces": [
    view("my-workspaces-home-dashboard", "Your workspaces", {
      dashboardWidgets: [
        { id: "workspaces", viewId: "my-workspaces-home-dashboard", title: "Workspaces",
          stat: { fn: "count" } },
        { id: "list", viewId: "my-workspaces-home-dashboard", title: "Workspaces",
          records: { direction: "desc", limit: 10 } },
      ],
      dashboardRows: [
        { id: "r1", widgetIds: ["workspaces"], widths: [1], height: 120 },
        { id: "r2", widgetIds: ["list"], widths: [1], height: 320 },
      ],
    }),
  ],
};
