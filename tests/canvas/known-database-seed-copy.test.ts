/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   known-database-seed-copy.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A fresh browser's first readiness stores the seed as its durable copy (devil R8, A2, RC2). The
// copy must be exactly the seed the store starts from, and reading it back must leave the store as
// a load with no copy does. Date is frozen: the wiki seed dates its pages from the clock, and the
// stored copy keeps the dates of the load that wrote it (accepted, no re-anchor).

import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

await import("./support/memory-local-storage.ts");
await import("./support/stub-bridge.ts");
const { installMemoryIndexedDbBrowser } = await import("./support/memory-indexed-db.ts");
const { serializeKnownDatabaseState } = await import("../../src/widgets/database-view/model/knownDatabasePersistedState.ts");
const databases = installMemoryIndexedDbBrowser();

const NOW = Date.parse("2026-11-17T08:00:00.000Z");
type StoreModule = typeof import("../../src/widgets/database-view/model/knownDatabaseState.ts");
let loading: Promise<{ kds: StoreModule; stored: { text: string; id: string } }> | null = null;

// The module opens its durable copy at evaluation, so it is imported once, under the frozen clock.
function loadOnce(t: TestContext) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  loading ??= (async () => {
    const kds = await import("../../src/widgets/database-view/model/knownDatabaseState.ts");
    await kds.whenKnownDatabaseReady();
    return { kds, stored: databases.get("osionos-kds")?.get("state") as { text: string; id: string } };
  })();
  return loading;
}

function restored(kds: StoreModule, text: string | null) {
  kds.restoreStoredState(text);
  return { state: kds.useKnownDatabaseStateStore.getState().state, deletedPageIds: [...kds.getDeletedPageIds()] };
}

test("RC2(c): the first readiness stores exactly the serialized seed, as a migrated copy", async (t) => {
  const { kds, stored } = await loadOnce(t);
  assert.ok(stored?.id.startsWith("migrated:"), "no seed copy was stored");
  assert.ok(stored.text === serializeKnownDatabaseState(kds.seedSnapshot(), new Set()), "the stored seed is not the seed");
});

test("RC2(a): reading the stored seed back leaves the store as a load with no copy", async (t) => {
  const { kds, stored } = await loadOnce(t);
  assert.ok(stored, "no seed copy was stored");
  assert.deepEqual(restored(kds, stored.text), restored(kds, null));
});
