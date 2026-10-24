import test from "node:test";
import assert from "node:assert/strict";

import { useIdeDockStore } from "../../src/features/ide/model/ideDockStore.ts";

test("a safe terminal is a fresh term-id flagged safe; a normal one is not", () => {
  const dock = useIdeDockStore.getState();
  dock.newSafeTerminal();
  const safeId = useIdeDockStore.getState().primary;
  assert.deepEqual(useIdeDockStore.getState().safeTerms, [safeId]);
  assert.equal(useIdeDockStore.getState().secondary, null);

  useIdeDockStore.getState().newTerminal();
  const normalId = useIdeDockStore.getState().primary;
  assert.notEqual(normalId, safeId);
  assert.equal(useIdeDockStore.getState().safeTerms.includes(normalId), false);
});
