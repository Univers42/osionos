/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-content-merge.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The 3-way merge of a page's block tree: the base the client last saw, its own copy, and the
// server's copy. One test per rule, then a seeded random walk over 500 rival trees.
// The merge is a pure function, so every rule is checked here alone — nothing else is wired to
// it yet (a later brief calls it from the 409 path).

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Block, LayoutCell } from "@/entities/block";
import { mergePageContent } from "@/store/sync/mergePageContent";
import { sameBlock } from "@/store/sync/mergePageContent.tree";
import {
  applyEdits,
  buildTree,
  cloneTree,
  collectIds,
  indexBlocks,
  mulberry32,
  randomTree,
} from "./page-content-merge.fixtures";

const para = (id: string, content: string): Block => ({ id, type: "paragraph", content });
const toggle = (id: string, content: string, children: Block[]): Block =>
  ({ id, type: "toggle", content, children });
const cell = (id: string, blocks: Block[]): LayoutCell =>
  ({ id, colStart: 0, colSpan: 1, rowStart: 0, rowSpan: 1, blocks });
const layout = (id: string, cells: LayoutCell[], content = ""): Block =>
  ({ id, type: "layout", content, layoutCells: cells });
const ids = (blocks: Block[]): string[] => blocks.map((block) => block.id);

test("rule 1: with no base the merge refuses to guess and the server's copy stands", () => {
  const local = [para("b1", "mine")];
  const server = [para("b1", "theirs"), para("b2", "also theirs")];
  const result = mergePageContent(null, local, server);
  assert.equal(result.status, "unresolved");
  assert.deepEqual(result.content, server);
  assert.deepEqual(result.conflictIds, []);
});

test("rule 2: the own fields come from the side that changed them", () => {
  const base = [para("b1", "x")];
  const serverChanged = mergePageContent(base, base, [para("b1", "y")]);
  assert.equal(serverChanged.content[0].content, "y");
  assert.equal(serverChanged.status, "clean");
  const localChanged = mergePageContent(base, [para("b1", "z")], base);
  assert.equal(localChanged.content[0].content, "z");
  assert.equal(localChanged.status, "clean");
  const bothSame = mergePageContent(base, [para("b1", "same")], [para("b1", "same")]);
  assert.equal(bothSame.content[0].content, "same");
  assert.equal(bothSame.status, "clean");
  // The own fields are taken as a whole: the local checked the block off and the server
  // renamed it, so the two sides changed the block differently — that is a conflict.
  const baseTodo = [{ id: "b1", type: "to_do", content: "x", checked: false }];
  const localTodo = [{ id: "b1", type: "to_do", content: "x", checked: true }];
  const serverTodo = [{ id: "b1", type: "to_do", content: "y", checked: false }];
  const todo = mergePageContent(baseTodo, localTodo, serverTodo);
  assert.equal(todo.status, "conflicts");
  assert.deepEqual(todo.conflictIds, ["b1"]);
  assert.equal(todo.content.length, 2);
  assert.equal(todo.content[0].checked, true);
  assert.equal(todo.content[1].content, "y");
  // One side alone changing an own field takes the whole block from that side.
  const oneSide = mergePageContent(baseTodo, localTodo, baseTodo);
  assert.equal(oneSide.status, "clean");
  assert.equal(oneSide.content[0].checked, true);
  assert.equal(oneSide.content[0].content, "x");
});

test("rule 3: the server's new blocks land next to their server siblings, the local's stay put", () => {
  const base = [para("b1", "x"), para("b2", "y")];
  const local = [para("b1", "x"), para("l1", "mine"), para("b2", "y")];
  const server = [para("b1", "x"), para("s1", "theirs"), para("b2", "y")];
  const result = mergePageContent(base, local, server);
  assert.equal(result.status, "clean");
  const merged = ids(result.content);
  assert.ok(merged.includes("s1"), "the server's block is missing");
  assert.ok(merged.includes("l1"), "the local's block is missing");
  // The server's block sits right after its nearest preceding server sibling.
  assert.equal(merged.indexOf("s1"), merged.indexOf("b1") + 1);
  assert.equal(new Set(merged).size, merged.length, "a block id appears twice");
  // A block both sides already hold is never inserted twice.
  const shared = mergePageContent(base, base, base);
  assert.deepEqual(ids(shared.content), ["b1", "b2"]);
});

test("rule 4: a block deleted on one side and untouched on the other is deleted", () => {
  const base = [para("b1", "x"), para("b2", "y")];
  const serverDeleted = mergePageContent(base, base, [para("b1", "x")]);
  assert.deepEqual(ids(serverDeleted.content), ["b1"]);
  assert.equal(serverDeleted.status, "clean");
  const localDeleted = mergePageContent(base, [para("b1", "x")], base);
  assert.deepEqual(ids(localDeleted.content), ["b1"]);
  assert.equal(localDeleted.status, "clean");
  // Deleted on one side, changed on the other: the changed block is kept and reported.
  const deletedVsChanged = mergePageContent(
    base,
    [para("b1", "x"), para("b2", "y-local")],
    [para("b1", "x")],
  );
  assert.deepEqual(ids(deletedVsChanged.content), ["b1", "b2"]);
  assert.equal(deletedVsChanged.content[1].content, "y-local");
  assert.equal(deletedVsChanged.status, "conflicts");
  assert.deepEqual(deletedVsChanged.conflictIds, ["b2"]);
  const otherWay = mergePageContent(
    base,
    [para("b1", "x")],
    [para("b1", "x"), para("b2", "y-server")],
  );
  assert.deepEqual(ids(otherWay.content), ["b1", "b2"]);
  assert.equal(otherWay.content[1].content, "y-server");
  assert.equal(otherWay.status, "conflicts");
  assert.deepEqual(otherWay.conflictIds, ["b2"]);
});

test("rule 5: a block both sides changed keeps both variants, the copy right after the original", () => {
  const base = [para("b1", "x")];
  const local = [para("b1", "x-local")];
  const server = [para("b1", "x-server")];
  const result = mergePageContent(base, local, server);
  assert.equal(result.status, "conflicts");
  assert.deepEqual(result.conflictIds, ["b1"]);
  assert.equal(result.content.length, 2);
  assert.equal(result.content[0].id, "b1");
  assert.equal(result.content[0].content, "x-local");
  assert.equal(result.content[1].id.startsWith("b1-c-"), true, "the copy is not named after the original");
  assert.equal(result.content[1].conflictOf, "b1");
  assert.equal(result.content[1].content, "x-server");
  assert.equal(result.content.filter((block) => block.id === "b1").length, 1);
  // The same conflict twice is named the same way, so a re-merge shows it once.
  const again = mergePageContent(base, result.content, server);
  assert.deepEqual(again.content, result.content);
});

test("rule 6: the rules apply inside a toggle's children and inside a layout cell", () => {
  const base = [
    toggle("t1", "toggle", [para("c1", "child")]),
    layout("l1", [cell("l1-cell", [para("c2", "in cell")])]),
  ];
  // The local renames the layout block (an own field) and edits the toggle's child; the server
  // edits the block inside the layout cell. Both edits must survive.
  const local = [
    toggle("t1", "toggle", [para("c1", "child-local")]),
    layout("l1", [cell("l1-cell", [para("c2", "in cell")])], "layout-local"),
  ];
  const server = [
    toggle("t1", "toggle", [para("c1", "child")]),
    layout("l1", [cell("l1-cell", [para("c2", "in cell-server")])]),
  ];
  const result = mergePageContent(base, local, server);
  assert.equal(result.status, "clean");
  const mergedToggle = result.content.find((block) => block.id === "t1");
  const mergedLayout = result.content.find((block) => block.id === "l1");
  assert.equal(mergedToggle?.children?.[0].content, "child-local");
  assert.equal(mergedLayout?.layoutCells?.[0].blocks[0].content, "in cell-server");
  assert.equal(mergedLayout?.content, "layout-local");
  // A change inside a child is not a change of the parent's own fields: no conflict.
  assert.deepEqual(result.conflictIds, []);
});

test("rule 7: the side that moved a block wins its place; when both moved it, the local's wins", () => {
  const base = [para("b1", "x"), para("b2", "y")];
  const serverMoved = mergePageContent(base, base, [para("b2", "y"), para("b1", "x")]);
  assert.deepEqual(ids(serverMoved.content), ["b2", "b1"]);
  const localMoved = mergePageContent(base, [para("b2", "y"), para("b1", "x")], base);
  assert.deepEqual(ids(localMoved.content), ["b2", "b1"]);
  // Both moved it, differently: the local's place wins and no content is lost.
  const three = [para("b1", "x"), para("b2", "y"), para("b3", "z")];
  const both = mergePageContent(
    three,
    [para("b2", "y"), para("b1", "x"), para("b3", "z")],
    [para("b1", "x"), para("b3", "z"), para("b2", "y")],
  );
  assert.deepEqual(ids(both.content), ["b2", "b1", "b3"]);
  assert.deepEqual(
    both.content.map((block) => block.content),
    ["y", "x", "z"],
  );
  // A block moved into another container goes there.
  const nested = mergePageContent(
    [para("b1", "x"), toggle("t1", "toggle", [para("c1", "child")])],
    [toggle("t1", "toggle", [para("c1", "child"), para("b1", "x")])],
    [para("b1", "x"), toggle("t1", "toggle", [para("c1", "child")])],
  );
  assert.deepEqual(ids(nested.content), ["t1"]);
  assert.deepEqual(ids(nested.content[0].children ?? []), ["c1", "b1"]);
});

test("rule 8: the merge is idempotent", () => {
  const base = [para("b1", "x"), toggle("t1", "toggle", [para("c1", "child")])];
  const local = [para("b1", "x-local"), toggle("t1", "toggle", [para("c1", "child")])];
  const server = [para("b1", "x"), toggle("t1", "toggle", [para("c1", "child-server")])];
  const merged = mergePageContent(base, local, server);
  assert.deepEqual(mergePageContent(base, merged.content, server).content, merged.content);
  assert.deepEqual(mergePageContent(base, local, local).content, local);
  assert.deepEqual(mergePageContent(base, base, server).content, server);
  assert.deepEqual(mergePageContent(base, local, base).content, local);
});

test("an assistant append while the user edited the middle keeps both", () => {
  const base = [para("b1", "one"), para("b2", "two"), para("b3", "three")];
  const local = [para("b1", "one"), para("b2", "two-local"), para("b3", "three")];
  const server = [
    para("b1", "one"),
    para("b2", "two"),
    para("b3", "three"),
    para("s1", "appended"),
    para("s2", "appended"),
    para("s3", "appended"),
  ];
  const result = mergePageContent(base, local, server);
  assert.equal(result.status, "clean");
  assert.deepEqual(result.conflictIds, []);
  assert.deepEqual(ids(result.content), ["b1", "b2", "b3", "s1", "s2", "s3"]);
  assert.equal(result.content[1].content, "two-local");
});

test("a seeded random walk over 500 rival trees keeps the merge's promises", () => {
  const seed = 20261021;
  const random = mulberry32(seed);
  let counter = 0;
  const nextId = (): string => `n${counter++}`;
  for (let round = 0; round < 500; round += 1) {
    const baseFlat = randomTree(random, nextId);
    const localFlat = cloneTree(baseFlat);
    const serverFlat = cloneTree(baseFlat);
    applyEdits(localFlat, random, nextId);
    applyEdits(serverFlat, random, nextId);
    const base = buildTree(baseFlat);
    const local = buildTree(localFlat);
    const server = buildTree(serverFlat);
    const merged = mergePageContent(base, local, server);
    const mergedIds = collectIds(merged.content);
    const where = `seed ${seed}, round ${round}`;

    // No id twice.
    assert.equal(
      new Set(mergedIds).size,
      mergedIds.length,
      `a block id appears twice (${where})`,
    );

    // Every local block survives, unless the server deleted it and the local never touched it.
    const baseById = indexBlocks(base);
    const localById = indexBlocks(local);
    const serverIds = new Set(collectIds(server));
    for (const [id, block] of localById) {
      const baseBlock = baseById.get(id);
      const deletedByRule4 =
        baseBlock !== undefined && !serverIds.has(id) && sameBlock(baseBlock, block);
      if (deletedByRule4) continue;
      assert.ok(mergedIds.includes(id), `the local block ${id} was lost (${where})`);
    }

    // Every block the server added survives.
    const baseIds = new Set(collectIds(base));
    const localIds = new Set(collectIds(local));
    for (const id of serverIds) {
      if (baseIds.has(id) || localIds.has(id)) continue;
      assert.ok(mergedIds.includes(id), `the server's block ${id} was lost (${where})`);
    }

    // Rule 8: merging again changes nothing.
    assert.deepEqual(
      mergePageContent(base, merged.content, server).content,
      merged.content,
      `re-merging changed the result (${where})`,
    );
    assert.deepEqual(
      mergePageContent(base, local, local).content,
      local,
      `merging a tree with itself changed it (${where})`,
    );
    assert.deepEqual(
      mergePageContent(base, base, server).content,
      server,
      `merging the base with the server changed the server's tree (${where})`,
    );
    assert.deepEqual(
      mergePageContent(base, local, base).content,
      local,
      `merging the local tree with the base changed it (${where})`,
    );
  }
});
