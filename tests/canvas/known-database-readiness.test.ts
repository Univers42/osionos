/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   known-database-readiness.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Until the durable copy is read, the store holds the seed. A write made then is dropped inside
// the store (devil I9): queued, it would be a whole seeded snapshot stored over the user's copy.

import assert from "node:assert/strict";
import test from "node:test";

await import("./support/memory-local-storage.ts");
await import("./support/stub-bridge.ts");
const { installRefusingBrowser } = await import("./support/refusing-indexed-db.ts");
installRefusingBrowser(100);
const { EMPTY, withDb, valuesOf, settle } = await import("./support/kds-tab.ts");
const { serializeKnownDatabaseState } = await import("../../src/widgets/database-view/model/knownDatabasePersistedState.ts");

const KEY = "osionos.knownDatabaseState.v1";
const STORED = serializeKnownDatabaseState(withDb(EMPTY, "db-mine", ["kept"]), new Set());
globalThis.localStorage.setItem(KEY, STORED);
const kds = await import("../../src/widgets/database-view/model/knownDatabaseState.ts");

test("(iv) a write before readiness is a no-op, and the loaded copy replaces the seed", async () => {
  const store = kds.useKnownDatabaseStateStore;
  const seed = store.getState().state;
  assert.equal(seed.databases["db-mine"], undefined, "not ready: the store holds the seed");
  store.getState().replaceState(withDb(seed, "db-early", ["early"]));
  store.getState().resetState();
  kds.persistKnownDatabaseState(withDb(seed, "db-early", ["early"]));
  assert.equal(store.getState().state, seed, "the writes were dropped");
  await kds.whenKnownDatabaseReady();
  const loaded = store.getState().state;
  assert.deepEqual(valuesOf(loaded, "db-mine"), ["kept"]);
  assert.equal(loaded.databases["db-early"], undefined);
  await settle(1500); // past the flush debounce: nothing was queued
  assert.equal(globalThis.localStorage.getItem(KEY), STORED, "nothing was written");
  store.getState().replaceState(withDb(loaded, "db-late", ["late"]));
  assert.deepEqual(valuesOf(store.getState().state, "db-late"), ["late"], "after readiness writes land");
});
