import assert from "node:assert/strict";
import test from "node:test";

import { isHostBacked } from "@/shared/notion-database-sys/src/components/views/dashboard/notion/model/isHostBacked.ts";

test("a widget over the host dashboard's own view is host-backed", () => {
  assert.equal(isHostBacked({ viewId: "v-host" }, "v-host"), true);
  assert.equal(isHostBacked({ viewId: "v-other" }, "v-host"), false);
});
