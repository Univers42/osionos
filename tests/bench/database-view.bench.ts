/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   database-view.bench.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { createDatabaseStore } from "../../src/shared/notion-database-sys/src/store/useDatabaseStore.ts";
import { rowCountOf } from "../../src/shared/notion-database-sys/src/store/rowCounts.ts";
import { accountState } from "./object-database-fixture.ts";
import { defineBench } from "./harness.ts";

// The rows a table view shows, recomputed after the store changes, on the
// largest account on the funnel. The largest database holds ~1,730 of its
// 8,646 rows; every database's store holds the whole account.
//
// Measured 2026-10-27 (Docker, medians): cell edit 3.58 ms, another view's
// column resize 10.4 µs (1.41 ms before rows were cached per view), search
// keystroke 2.34 ms, toolbar row count 13 ns (1.35 ms when it scanned the
// account on every store change). Opening a database copied the account state
// (structuredClone, 19.48 ms, p95 22.85 ms); it is shared now
// (tests/canvas/known-database-shared-state.test.ts).
//
// Caveat: the store runs without React, so render and paint are not in these
// numbers; tests/e2e/perf/database.spec.mjs measures input to paint.

const LARGEST_VIEW = "db-00000000-v0";
const OTHER_VIEW = "db-00000001-v0";

function loadedStore() {
  const store = createDatabaseStore();
  store.setState(accountState() as never);
  return store;
}

let tick = 0;

export const bench = defineBench("database view rows (8,646-row account)", [
  {
    name: "rows after a cell edit in the view",
    reference: true,
    setup: () => {
      const store = loadedStore();
      return () => {
        store.getState().updatePageProperty("row-0", "p1", `edit ${tick++}`);
        return store.getState().getPagesForView(LARGEST_VIEW).length;
      };
    },
  },
  {
    name: "rows after another view's column resize",
    reference: true,
    setup: () => {
      const store = loadedStore();
      return () => {
        store.getState().updateViewSettings(OTHER_VIEW, { columnWidths: { p0: 200 + (tick++ % 50) } });
        return store.getState().getPagesForView(LARGEST_VIEW).length;
      };
    },
  },
  {
    name: "rows after a search keystroke",
    reference: true,
    setup: () => {
      const store = loadedStore();
      return () => {
        store.getState().setSearchQuery(tick++ % 2 ? "row 1" : "row 12");
        return store.getState().getPagesForView(LARGEST_VIEW).length;
      };
    },
  },
  {
    name: "toolbar row count, run on every store change",
    reference: true,
    setup: () => {
      const store = loadedStore();
      return () => rowCountOf(store.getState().pages, "db-00000000");
    },
  },
]);
