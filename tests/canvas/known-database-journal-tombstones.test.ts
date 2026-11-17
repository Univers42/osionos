// A row deleted inside the unload window (groot ADR 0055 J-C10, devil D6a/D6b): the journal carries
// the tombstone with the slice, and the readiness unions it into the stored ones. Without it the
// reload reads the database dirty, unions the server's copy that still holds the row, and pushes
// the row back.

import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

await import("./support/memory-local-storage.ts");
await import("./support/stub-bridge.ts");
await import("./support/kds-browser.ts");

const kds = await import("./support/kds-tab.ts");
const { EMPTY, withDb, sliceOf, hashOf, valuesOf, settle, storeWith, memoryLegacy, openTab, reload, useBridge } = kds;

const X3 = withDb(EMPTY, "db-x", ["a", "b", "c"]);

async function deleteRowAndLeave(t: TestContext, isCommitLanding: boolean) {
  const bridge = useBridge(t, { "db-x": sliceOf(X3, "db-x") });
  const store = storeWith(X3, { "db-x": hashOf(X3, "db-x") });
  const legacy = memoryLegacy();
  const tab = openTab(store, { legacy });
  await tab.persistence.ready; await tab.hydrate(); await settle();
  tab.edit("db-x", ["a", "b"]); tab.live.deleted.add("db-x-r2"); // row c deleted
  bridge.failPosts = true; store.failWrites = !isCommitLanding; tab.pagehide(); await settle();
  bridge.failPosts = false; store.failWrites = false;
  const reloaded = await reload(store, legacy);
  return { local: valuesOf(reloaded.live.state, "db-x"), server: valuesOf(bridge.server.get("db-x"), "db-x") };
}

test("D6a: a row deleted in the unload window, push not landed, commit lost → it stays deleted", async (t) => {
  const where = await deleteRowAndLeave(t, false);
  assert.deepEqual(where.local, ["a", "b"], "D6a: deleted row back locally");
  assert.deepEqual(where.server, ["a", "b"], "D6a: deleted row pushed back");
});

test("D6b: control, the commit lands → the row stays deleted", async (t) => {
  const where = await deleteRowAndLeave(t, true);
  assert.deepEqual(where.local, ["a", "b"]);
  assert.deepEqual(where.server, ["a", "b"]);
});
