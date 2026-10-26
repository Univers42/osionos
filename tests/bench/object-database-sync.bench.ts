/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   object-database-sync.bench.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { reconcileServerDatabases } from "../../src/widgets/database-view/model/objectDatabaseReconcile.ts";
import { hashSlice, sliceAllDatabases, userDatabaseIds } from "../../src/widgets/database-view/model/objectDatabaseSlice.ts";
import { accountState } from "./object-database-fixture.ts";
import { defineBench } from "./harness.ts";

const NO_SEEDS: ReadonlySet<string> = new Set();

// Budgets are ~3x this host's p95, for the slower CI runner, and stay below the
// replaced loops' p95, so CI fails if the O(databases × rows) shape comes back.
// Caveat: a runner more than 3x slower than this host reads as a regression.
// structuredClone and JSON.stringify of the fixed fixture are reference rows, with no budget:
// the input never changes, so only the runner can move their time. The clone's 70 ms budget
// failed CI on 2026-10-26 (p95 76.39 ms, median 24.44 ms) with no code change under it.

export const bench = defineBench("object-database sync (83 databases, 8,646 rows)", [
  {
    // 2026-10-26: p95 31.22 ms; the per-database sliceDatabase loop it replaced: 184.75 ms
    // (bash scripts/docker-run.sh test-bench tests/bench/object-database-sync.bench.ts)
    name: "flush: slice + hash every database",
    budgetNs: 100_000_000,
    setup: () => {
      const state = accountState();
      return () => {
        const slices = sliceAllDatabases(state);
        return userDatabaseIds(state, NO_SEEDS).map((id) => hashSlice(slices.get(id)!));
      };
    },
  },
  {
    // 2026-10-26: p95 21.80 ms
    name: "flush: structuredClone snapshot",
    reference: true,
    setup: () => {
      const state = accountState();
      return () => structuredClone(state);
    },
  },
  {
    // 2026-10-26: p95 6.17 ms
    name: "flush: JSON.stringify for localStorage",
    reference: true,
    setup: () => {
      const state = accountState();
      return () => JSON.stringify(state);
    },
  },
  {
    // 2026-10-26: p95 54.62 ms; laying each row down on the whole state in turn: 713.99 ms
    name: "hydrate: reconcile every server row",
    budgetNs: 170_000_000,
    setup: () => {
      const live = accountState();
      const server = sliceAllDatabases(accountState());
      const pushed = Object.fromEntries([...server].map(([id, slice]) => [id, hashSlice(slice)]));
      return () => reconcileServerDatabases({ live, server, pushed, deletedPageIds: new Set() });
    },
  },
]);
