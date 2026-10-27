// Live 2026-10-27: the online seed posted "Design System", "Sprint Review" and "Tasks
// database" into workspaces whose page list never landed, and the bridge answered 403
// "App session is not scoped to this workspace" for each.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { PageEntry } from "../../src/entities/page/index.ts";
import { isSeedTarget } from "../../src/store/seedTarget.ts";

const page = { _id: "p1", title: "Notes", workspaceId: "w1", content: [] } as unknown as PageEntry;

test("a workspace whose page list never landed is not seeded", () => {
  assert.equal(isSeedTarget(undefined, undefined), false);
  assert.equal(isSeedTarget(undefined, []), false);
});

test("a workspace the server confirmed empty is seeded", () => {
  assert.equal(isSeedTarget(1_766_000_000_000, []), true);
  assert.equal(isSeedTarget(1_766_000_000_000, undefined), true);
});

test("a workspace holding pages is not seeded", () => {
  assert.equal(isSeedTarget(1_766_000_000_000, [page]), false);
});
