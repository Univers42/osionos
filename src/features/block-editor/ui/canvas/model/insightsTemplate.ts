/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   insightsTemplate.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The "Insights" canvas template: the user's own recent activity, as a table and a chart,
 * both bound to the `sys:my-activity` source.
 *
 * Caveat: the source is capped at 200 rows, so the chart covers the last 200 events and not
 * a time range; the cell titles say so.
 */

import type { Block, LayoutCell } from "@/entities/block";
import {
  createDashboardCell,
  dashboardBlock,
  heading3,
  paragraph,
  stableDashboardId,
} from "@/widgets/database-view/model/databaseViewCatalog";

export const INSIGHTS_SOURCE_ID = "sys:my-activity";
export const INSIGHTS_TABLE_VIEW_ID = "my-activity-default";
export const INSIGHTS_CHART_VIEW_ID = "my-activity-chart";
export const INSIGHTS_TITLE = "Last 200 events";

const EMPTY_HINT =
  "Nothing here yet? Events are recorded only after you turn on Record my activity in Settings, Preferences, Privacy.";

const cellId = (index: number): string => stableDashboardId("insights", "cell", index);

function sourceBlock(viewId: string, index: number): Block {
  return dashboardBlock("database_inline", "", {
    id: stableDashboardId("insights", "block", index),
    databaseId: INSIGHTS_SOURCE_ID,
    viewId,
  });
}

export function createInsightsCells(): LayoutCell[] {
  return [
    createDashboardCell(
      { colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 4 },
      {
        id: cellId(0),
        label: `${INSIGHTS_TITLE}: events by type`,
        blocks: [heading3(`${INSIGHTS_TITLE}: events by type`, stableDashboardId("insights", "title", 0)), sourceBlock(INSIGHTS_CHART_VIEW_ID, 0)],
      },
    ),
    createDashboardCell(
      { colStart: 1, colSpan: 12, rowStart: 5, rowSpan: 5 },
      {
        id: cellId(1),
        label: `${INSIGHTS_TITLE}: recent events`,
        blocks: [
          heading3(`${INSIGHTS_TITLE}: recent events`, stableDashboardId("insights", "title", 1)),
          sourceBlock(INSIGHTS_TABLE_VIEW_ID, 1),
          paragraph(EMPTY_HINT, stableDashboardId("insights", "hint")),
        ],
      },
    ),
  ];
}
