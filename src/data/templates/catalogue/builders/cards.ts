/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   cards.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { DashboardRow, DashboardViewWidget, ViewSettings } from "@notion-db/contract-types";

export function statTile(
  id: string,
  viewId: string,
  title: string,
  fn: "count" | "sum" | "avg" | "min" | "max" | "distinct",
  propertyId?: string,
): DashboardViewWidget {
  return { id, viewId, title, stat: { fn, ...(propertyId === undefined ? {} : { propertyId }) } };
}

export function viewTile(id: string, viewId: string, title: string): DashboardViewWidget {
  return { id, viewId, title };
}

export function tileRow(
  id: string,
  tiles: DashboardViewWidget[],
  height = 320,
): { row: DashboardRow; widgets: DashboardViewWidget[] } {
  if (tiles.length === 0 || tiles.length > 4) throw new RangeError("A dashboard row needs 1 to 4 tiles");
  const width = 1 / tiles.length;
  const row = { id, widgetIds: tiles.map((tile) => tile.id), widths: tiles.map(() => width), height };
  return { row, widgets: tiles };
}

export function dashboardSettings(
  rows: Array<{ row: DashboardRow; widgets: DashboardViewWidget[] }>,
): ViewSettings {
  return {
    dashboardRows: rows.map(({ row }) => row),
    dashboardWidgets: rows.flatMap(({ widgets }) => widgets),
  };
}
