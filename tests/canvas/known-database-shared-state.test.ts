/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   known-database-shared-state.test.ts                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Opening a database copied the whole account state (19.5 ms on 8,646 rows,
// tests/bench/database-view.bench.ts) and every mounted database kept its own
// copy. It now shares the state; outside a production build the shared state
// is frozen, so code that writes into it in place fails here and in e2e.

import assert from "node:assert/strict";
import test from "node:test";

import {
  createKnownDatabaseAdapter,
  useKnownDatabaseStateStore,
} from "../../src/widgets/database-view/model/knownDatabaseState.ts";

test("opening a database shares the account's rows instead of copying them", async () => {
  const { pages } = useKnownDatabaseStateStore.getState().state;
  const loaded = await createKnownDatabaseAdapter().loadState();
  const [pageId] = Object.keys(pages);
  assert.ok(pageId, "the seed ships pages");
  assert.equal(loaded.pages[pageId], pages[pageId]);
});

test("writing into a shared row throws outside a production build", async () => {
  const loaded = await createKnownDatabaseAdapter().loadState();
  const [page] = Object.values(loaded.pages);
  assert.throws(() => {
    (page.properties as Record<string, unknown>).written = 1;
  }, TypeError);
});

test("an edit after opening still lands, as a new row object", async () => {
  const adapter = createKnownDatabaseAdapter();
  const loaded = await adapter.loadState();
  const [page] = Object.values(loaded.pages);
  const updated = await adapter.patchPage(page.id, { edited: "yes" });
  assert.equal(updated.properties.edited, "yes");
  assert.equal(useKnownDatabaseStateStore.getState().state.pages[page.id].properties.edited, "yes");
  assert.equal(loaded.pages[page.id].properties.edited, undefined);
});
