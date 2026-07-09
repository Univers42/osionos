/* ************************************************************************** */
/*  status-defaults.test.ts — a fresh Status property is born usable          */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultStatusSchema,
  needsStatusDefaults,
} from "../../src/shared/notion-database-sys/src/store/slices/statusDefaults.ts";

test("status-defaults: three groups, each wired to an existing option", () => {
  const seed = defaultStatusSchema("prop-x");
  assert.equal(seed.options?.length, 3);
  assert.equal(seed.statusGroups?.length, 3);
  const optionIds = new Set(seed.options?.map((o) => o.id));
  for (const group of seed.statusGroups ?? []) {
    assert.ok(group.optionIds.length >= 1, `${group.label} has an option`);
    for (const id of group.optionIds) assert.ok(optionIds.has(id), `${id} exists`);
  }
  assert.deepEqual(seed.options?.map((o) => o.value), ["Not started", "In progress", "Done"]);
  assert.deepEqual(seed.statusGroups?.map((g) => g.label), ["To-do", "In Progress", "Complete"]);
});

test("status-defaults: ids derive from the property id (no collisions across props)", () => {
  const a = defaultStatusSchema("prop-a");
  const b = defaultStatusSchema("prop-b");
  const idsA = new Set(a.options?.map((o) => o.id));
  for (const option of b.options ?? []) assert.ok(!idsA.has(option.id));
});

test("status-defaults: needsStatusDefaults gates on type + empty options", () => {
  assert.ok(needsStatusDefaults({ type: "status", options: [] }));
  assert.ok(needsStatusDefaults({ type: "status" }));
  assert.ok(!needsStatusDefaults({ type: "status", options: [{ id: "x", value: "Keep", color: "" }] }));
  assert.ok(!needsStatusDefaults({ type: "select", options: [] }));
});
