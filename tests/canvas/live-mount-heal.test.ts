/* ************************************************************************** */
/*  live-mount-heal.test.ts — orphaned live-mount remap decision              */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  pickMountForTable,
  rewriteViewId,
} from "../../src/widgets/database-view/model/liveMountHeal.ts";

// The failing analytics dashboards, mirrored from the live registry: the
// commerce mount was re-registered (d5d96d24 → 59939f19), stranding sources
// authored against the old id. Each failing table maps to exactly one mount.
const MOUNTS = [
  { dbId: "59939f19-commerce" },
  { dbId: "028b32b2-ops" },
  { dbId: "42c85133-activity" },
  { dbId: "8e08344a-restaurant" },
];
const TABLES = new Map<string, string[]>([
  ["59939f19-commerce", ["customers", "products", "orders", "order_items"]],
  ["028b32b2-ops", ["projects", "tasks", "tickets"]],
  ["42c85133-activity", ["events", "product_reviews", "notes"]],
  ["8e08344a-restaurant", ["restaurant", "menu", "dish", "restaurant_order"]],
]);

test("orphaned source → the unique accessible mount serving its table", () => {
  // Every failing analytics table resolves to exactly one current mount.
  assert.equal(pickMountForTable("orders", "d5d96d24-stale", MOUNTS, TABLES), "59939f19-commerce");
  assert.equal(pickMountForTable("products", "d5d96d24-stale", MOUNTS, TABLES), "59939f19-commerce");
  assert.equal(pickMountForTable("tasks", "65b6873d-stale", MOUNTS, TABLES), "028b32b2-ops");
  assert.equal(pickMountForTable("events", "cb79739f-stale", MOUNTS, TABLES), "42c85133-activity");
});

test("a STILL-accessible id is never remapped (nothing to heal)", () => {
  // The current dbId is in the mount list → return null so a transient error on
  // a live mount is not silently redirected to a different database.
  assert.equal(pickMountForTable("orders", "59939f19-commerce", MOUNTS, TABLES), null);
});

test("an ambiguous or absent table refuses to guess", () => {
  const withDupOrders = [...MOUNTS, { dbId: "dup-orders" }];
  const dupTables = new Map(TABLES);
  dupTables.set("dup-orders", ["orders"]);
  // Two mounts have `orders` → ambiguous → null (leave the honest denial).
  assert.equal(pickMountForTable("orders", "d5d96d24-stale", withDupOrders, dupTables), null);
  // No accessible mount has the table → null.
  assert.equal(pickMountForTable("ghost_table", "d5d96d24-stale", MOUNTS, TABLES), null);
  // Empty registry (e.g. signed out) → null, never a crash.
  assert.equal(pickMountForTable("orders", "d5d96d24-stale", [], new Map()), null);
});

test("rewriteViewId carries the #preset suffix onto the healed database id", () => {
  assert.equal(
    rewriteViewId("baas:d5d96d24:orders#commerce-hub", "baas:d5d96d24:orders", "baas:59939f19:orders"),
    "baas:59939f19:orders#commerce-hub",
  );
  // A bare view id (== the database id) becomes the healed id.
  assert.equal(
    rewriteViewId("baas:d5d96d24:orders", "baas:d5d96d24:orders", "baas:59939f19:orders"),
    "baas:59939f19:orders",
  );
  // A view id that is NOT this database's is left untouched (never mangled).
  assert.equal(
    rewriteViewId("baas:other:tasks#board", "baas:d5d96d24:orders", "baas:59939f19:orders"),
    "baas:other:tasks#board",
  );
});
