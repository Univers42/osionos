import assert from "node:assert/strict";
import test from "node:test";

import { routeKindOf } from "@/features/issues/model/routeKind";

test("routeKindOf returns each of the six values", () => {
  assert.equal(routeKindOf("/settings/profile", null), "settings");
  assert.equal(routeKindOf("/", "admin"), "admin");
  assert.equal(routeKindOf("/", "chat"), "chat");
  assert.equal(routeKindOf("/", "database"), "database");
  assert.equal(routeKindOf("/", "page"), "page");
  assert.equal(routeKindOf("/", "something-else"), "other");
});
