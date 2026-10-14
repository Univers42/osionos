/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   explorer-render-rows.test.ts                       :+:      :+:    :+:   */
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
  buildExplorerRows,
  flattenForRender,
  flattenVisible,
  indexByRel,
  renderRowKey,
  type DirState,
  type RenderRow,
} from "../../src/features/ide/model/explorerRows.ts";

const ready = (...entries: Array<[string, "dir" | "file"]>): DirState => ({
  status: "ready",
  rows: buildExplorerRows(entries.map(([name, kind]) => ({ name, kind }))),
});

// root: lib/ (expanded: deep/ expanded+loading, x.ts), src/ (expanded, error), z.md
const DIRS: Record<string, DirState> = {
  "": ready(["lib", "dir"], ["src", "dir"], ["z.md", "file"]),
  lib: ready(["deep", "dir"], ["x.ts", "file"]),
  "lib/deep": { status: "loading" },
  src: { status: "error", message: "EACCES" },
};
const EXPANDED = new Set(["lib", "lib/deep", "src"]);

const describe = (row: RenderRow): string =>
  row.type === "item" ? `${row.item.level}:${row.item.rel}` : `${row.level}:${row.type}:${row.type === "create" ? row.parent : row.dir}`;

test("flattenForRender lists every visible row in flattenVisible's order, plus status lines", () => {
  const rows = flattenForRender(DIRS, EXPANDED, null);
  assert.deepEqual(rows.map(describe), [
    "1:lib",
    "2:lib/deep",
    "3:status:lib/deep",
    "2:lib/x.ts",
    "1:src",
    "2:status:src",
    "1:z.md",
  ]);
  const items = rows.flatMap((row) => (row.type === "item" ? [row.item] : []));
  assert.deepEqual(items, flattenVisible(DIRS, EXPANDED));
});

test("a folder expanded but never listed shows a status line; a collapsed one shows nothing", () => {
  assert.deepEqual(flattenForRender(DIRS, new Set(["src"]), null).map(describe), ["1:lib", "1:src", "2:status:src", "1:z.md"]);
  assert.deepEqual(flattenForRender({ "": ready(["new", "dir"]) }, new Set(["new"]), null).map(describe), ["1:new", "2:status:new"]);
  assert.deepEqual(flattenForRender(DIRS, new Set(), null).map(describe), ["1:lib", "1:src", "1:z.md"]);
});

test("a pending create puts its input first among its folder's rows, only when that folder is shown", () => {
  assert.deepEqual(flattenForRender(DIRS, EXPANDED, { parent: "", kind: "file" }).map(describe)[0], "1:create:");
  const inLib = flattenForRender(DIRS, EXPANDED, { parent: "lib", kind: "dir" }).map(describe);
  assert.deepEqual(inLib.slice(0, 3), ["1:lib", "2:create:lib", "2:lib/deep"]);
  const collapsed = flattenForRender(DIRS, new Set(), { parent: "lib", kind: "dir" });
  assert.equal(collapsed.some((row) => row.type === "create"), false);
  const unready = flattenForRender(DIRS, EXPANDED, { parent: "src", kind: "file" });
  assert.equal(unready.some((row) => row.type === "create"), false);
});

test("indexByRel points at each item's line; keys are unique and stable", () => {
  const rows = flattenForRender(DIRS, EXPANDED, { parent: "lib", kind: "file" });
  const index = indexByRel(rows);
  for (const [rel, at] of index) {
    const row = rows[at];
    assert.ok(row.type === "item" && row.item.rel === rel);
  }
  assert.equal(index.size, rows.filter((row) => row.type === "item").length);
  const keys = rows.map(renderRowKey);
  assert.equal(new Set(keys).size, keys.length);
  const later = flattenForRender(DIRS, EXPANDED, null).map(renderRowKey);
  assert.ok(later.every((key) => keys.includes(key)), "removing the create line keeps every other key");
});
