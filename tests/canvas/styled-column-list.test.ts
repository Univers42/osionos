// A column_list that carries a style is a container (a section, a grid), not a drag artefact:
// the tree ops that flatten or unwrap plain column lists leave it whole (ADR 0064 PS7).

import assert from "node:assert/strict";
import test from "node:test";

import "./support/user-store-env.ts";

import type { Block } from "@/entities/block/model/types";

const { flattenColumns } = await import("@/entities/block/model/blockTreeUtils");
const { insertColumnForTarget } = await import("@/features/block-editor/model/columnLayout");
const { pruneColumns } = await import("../../src/store/pageStore.helpers.ts");

const b = (id: string): Block => ({ id, type: "paragraph", content: id });
const column = (id: string, children: Block[], extra: Partial<Block> = {}): Block => ({ id, type: "column", content: "", children, ...extra });
const list = (id: string, children: Block[], extra: Partial<Block> = {}): Block => ({ id, type: "column_list", content: "", children, ...extra });

const grid = () => list("grid", [column("g1", [b("A")]), column("g2", [b("B")])], { style: { layout: "grid", cols: 3 } });
const section = () => [list("section", [column("s1", [grid()]), column("s2", [b("Aside")])], { style: { padding: 4 } })];

test("flattenColumns keeps a styled inner list when asked, hoists it otherwise", () => {
  const columns = section()[0].children ?? [];
  assert.deepEqual(flattenColumns(columns, true).map((c) => c.id), ["s1", "s2"]);
  assert.deepEqual(flattenColumns(columns).map((c) => c.id), ["g1", "g2", "s2"], "flag off: today's flattening");
});

test("flattenColumns still hoists an unstyled inner list when keeping styled ones", () => {
  const columns = [column("c", [list("inner", [column("i1", [b("X")]), column("i2", [b("Y")])])])];
  assert.deepEqual(flattenColumns(columns, true).map((c) => c.id), ["i1", "i2"]);
});

test("pruneColumns keeps a styled list down to one column, unwraps a plain one", () => {
  const styled = pruneColumns([list("g", [column("g1", [b("A")]), column("g2", [])], { style: { layout: "grid" } })]);
  assert.equal(styled.length, 1);
  assert.equal(styled[0].type, "column_list");
  assert.deepEqual(styled[0].children?.map((c) => c.id), ["g1"]);
  assert.deepEqual(pruneColumns([list("p", [column("p1", [b("A")]), column("p2", [])])]).map((x) => x.id), ["A"]);
});

test("pruneColumns unwraps a list whose style holds no scale value", () => {
  const junk = pruneColumns([list("j", [column("j1", [b("A")])], { style: { bogus: 1 } as never })]);
  assert.deepEqual(junk.map((x) => x.id), ["A"]);
});

test("dropping beside a card in a styled grid adds a grid column, the section keeps its two", () => {
  const out = insertColumnForTarget(section(), "B", b("C"), "right");
  const [outer] = out;
  assert.deepEqual(outer.children?.map((c) => c.id), ["s1", "s2"]);
  const inner = outer.children?.[0].children?.[0];
  assert.equal(inner?.id, "grid");
  assert.deepEqual(inner?.style, { layout: "grid", cols: 3 });
  assert.deepEqual(inner?.children?.map((c) => c.children?.[0].id), ["A", "B", "C"]);
});
