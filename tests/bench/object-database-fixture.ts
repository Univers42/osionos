/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   object-database-fixture.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { NotionState } from "@notion-db/object-database";

/**
 * An account shaped like the largest one on the funnel (2026-10-26): 83 object
 * databases, 8,646 rows (~294 B each), 325 views, 9 properties per database.
 * Row counts are skewed like the real account (a few databases hold most rows).
 */
export function accountState(databaseCount = 83, rowCount = 8_646): NotionState {
  const state = { databases: {}, pages: {}, views: {} } as unknown as {
    databases: Record<string, unknown>; pages: Record<string, unknown>; views: Record<string, unknown>;
  };
  const weights = Array.from({ length: databaseCount }, (_, i) => 1 / (i + 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let row = 0;
  for (let d = 0; d < databaseCount; d += 1) {
    const id = `db-${d.toString(16).padStart(8, "0")}`;
    const properties = Object.fromEntries(Array.from({ length: 9 }, (_, p) => [`p${p}`, { id: `p${p}`, name: `Field ${p}`, type: p === 7 ? "number" : "text" }]));
    const views = [0, 1, 2, 3].slice(0, d % 4 + 1).map((v) => `${id}-v${v}`);
    state.databases[id] = { id, icon: "📊", name: `Database ${d}`, viewOrder: views, properties, description: "", titlePropertyId: "p0" };
    for (const viewId of views) {
      state.views[viewId] = { id: viewId, name: "Table", type: "table", sorts: [], filters: [], settings: {}, databaseId: id, filterConjunction: "and", visibleProperties: Object.keys(properties) };
    }
    const rows = d === databaseCount - 1 ? rowCount - row : Math.round((weights[d] / total) * rowCount);
    for (let r = 0; r < rows; r += 1, row += 1) {
      const pageId = `row-${row}`;
      state.pages[pageId] = {
        id: pageId, content: [], databaseId: id,
        properties: { p0: `Row ${row}`, p1: "alpha", p2: "beta", p3: "gamma", p4: "2026-10-26", p5: "open", p6: "team", p7: row, p8: "note" },
      };
    }
  }
  return state as unknown as NotionState;
}
