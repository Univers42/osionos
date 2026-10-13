/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-cascade-result.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  cascadeIdsFrom,
  applyArchived,
  applyDeleted,
} from "../../src/store/pageCascadeResult.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";

function makePage(id: string, parentPageId: string | null = null): PageEntry {
  return {
    _id: id,
    title: id,
    workspaceId: "ws",
    parentPageId,
    archivedAt: null,
  };
}

test("cascadedIds from server excludes pruned child → applyArchived leaves that child's archivedAt unchanged and archives others", () => {
  const pages = [
    makePage("root"),
    makePage("child1", "root"),
    makePage("child2", "root"),
    makePage("grandchild", "child1"),
  ];
  const localDescendants = ["child1", "child2", "grandchild"];
  const body = { cascadedIds: ["child1", "grandchild"] }; // child2 pruned by server
  const ids = cascadeIdsFrom(body, "root", localDescendants, "cascadedIds");
  assert.deepEqual(ids.sort(), ["root", "child1", "grandchild"].sort());

  const result = applyArchived(pages, new Set(ids), "2026-01-01T00:00:00.000Z");
  const child2 = result.find((p) => p._id === "child2");
  assert.equal(child2?.archivedAt, null); // pruned child unchanged
  const root = result.find((p) => p._id === "root");
  assert.equal(root?.archivedAt, "2026-01-01T00:00:00.000Z");
  const child1 = result.find((p) => p._id === "child1");
  assert.equal(child1?.archivedAt, "2026-01-01T00:00:00.000Z");
  const grandchild = result.find((p) => p._id === "grandchild");
  assert.equal(grandchild?.archivedAt, "2026-01-01T00:00:00.000Z");
});

test("absent cascadedIds → falls back to local descendants (root included)", () => {
  const localDescendants = ["child1", "child2"];
  const body = { otherField: "value" };
  const ids = cascadeIdsFrom(body, "root", localDescendants, "cascadedIds");
  assert.deepEqual(ids.sort(), ["root", "child1", "child2"].sort());
});

test("deletedIds from server → applyDeleted removes exactly those; a pruned child stays", () => {
  const pages = [
    makePage("root"),
    makePage("child1", "root"),
    makePage("child2", "root"),
  ];
  const localDescendants = ["child1", "child2"];
  const body = { deletedIds: ["root", "child1"] }; // child2 pruned by server
  const ids = cascadeIdsFrom(body, "root", localDescendants, "deletedIds");
  assert.deepEqual(ids.sort(), ["root", "child1"].sort());

  const result = applyDeleted(pages, new Set(ids));
  const remainingIds = result.map((p) => p._id).sort();
  assert.deepEqual(remainingIds, ["child2"]); // pruned child stays
});

test("non-object body (null, string, array) → fallback for both fields", () => {
  const localDescendants = ["child1", "child2"];
  // null body
  assert.deepEqual(
    cascadeIdsFrom(null, "root", localDescendants, "cascadedIds").sort(),
    ["root", "child1", "child2"].sort(),
  );
  assert.deepEqual(
    cascadeIdsFrom(null, "root", localDescendants, "deletedIds").sort(),
    ["root", "child1", "child2"].sort(),
  );
  // string body
  assert.deepEqual(
    cascadeIdsFrom("not-an-object", "root", localDescendants, "cascadedIds").sort(),
    ["root", "child1", "child2"].sort(),
  );
  assert.deepEqual(
    cascadeIdsFrom("not-an-object", "root", localDescendants, "deletedIds").sort(),
    ["root", "child1", "child2"].sort(),
  );
  // array body
  assert.deepEqual(
    cascadeIdsFrom([1, 2, 3], "root", localDescendants, "cascadedIds").sort(),
    ["root", "child1", "child2"].sort(),
  );
  assert.deepEqual(
    cascadeIdsFrom([1, 2, 3], "root", localDescendants, "deletedIds").sort(),
    ["root", "child1", "child2"].sort(),
  );
});

test("non-string items in array are dropped", () => {
  const localDescendants = ["child1", "child2"];
  const body = { cascadedIds: ["child1", 123, null, "child2", undefined, true] };
  const ids = cascadeIdsFrom(body, "root", localDescendants, "cascadedIds");
  assert.deepEqual(ids.sort(), ["root", "child1", "child2"].sort());

  const body2 = { deletedIds: ["root", 123, "child1", null] };
  const ids2 = cascadeIdsFrom(body2, "root", localDescendants, "deletedIds");
  assert.deepEqual(ids2.sort(), ["root", "child1"].sort());
});

test("applyArchived keeps object identity for untouched pages (===)", () => {
  const pages = [
    makePage("root"),
    makePage("child1", "root"),
    makePage("child2", "root"),
  ];
  const ids = new Set(["root", "child1"]);
  const result = applyArchived(pages, ids, "2026-01-01T00:00:00.000Z");

  // child2 should be the exact same object reference
  const originalChild2 = pages.find((p) => p._id === "child2");
  const resultChild2 = result.find((p) => p._id === "child2");
  assert.ok(resultChild2 === originalChild2, "untouched page should keep object identity");

  // root and child1 should be new objects
  const originalRoot = pages.find((p) => p._id === "root");
  const resultRoot = result.find((p) => p._id === "root");
  assert.ok(resultRoot !== originalRoot, "touched page should be new object");
  assert.equal(resultRoot?.archivedAt, "2026-01-01T00:00:00.000Z");
});