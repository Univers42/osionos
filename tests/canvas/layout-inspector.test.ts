/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layout-inspector.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Layout inspector's pure half: which controls a block gets, that every
// option is a STYLE_SCALES entry, and the tree a choice or a reset writes
// (ADR 0064 PS2, PS6).

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";
import { PROP_SCALE, STYLE_SCALES, sanitizeBlockStyle } from "../../src/entities/block/model/blockStyle.ts";
import {
  applyLayoutChoice,
  layoutControlsFor,
  parseLayoutChoice,
  resetLayout,
} from "../../src/features/block-editor/model/layoutInspector.ts";
import { createLayoutContextMenuSections } from "../../src/features/block-editor/model/layoutContextMenuSection.tsx";

const para = (id: string): Block => ({ id, type: "paragraph", content: id });
const col = (id: string, style?: Block["style"]): Block => ({ id, type: "column", content: "", children: [para(`${id}-p`)], ...(style ? { style } : {}) });
const list = (style?: Block["style"]): Block => ({
  id: "list", type: "column_list", content: "", children: [col("a"), col("b")], ...(style ? { style } : {}),
});
const keysOf = (block: Block, level?: "basic" | "more") =>
  layoutControlsFor(block).filter((control) => !level || control.level === level).map((control) => control.key);
const findById = (blocks: Block[], id: string): Block | undefined => {
  for (const block of blocks) {
    if (block.id === id) return block;
    const hit = findById(block.children ?? [], id);
    if (hit) return hit;
  }
  return undefined;
};

test("a plain column list offers arrange and gap first, the rest under More", () => {
  assert.deepEqual(keysOf(list(), "basic"), ["layout", "gap"]);
  assert.deepEqual(keysOf(list(), "more"), ["align", "justify", "wrap", "stackAt"]);
});

test("a grid list adds columns, min width and one span per column, and drops wrap", () => {
  const grid = list({ layout: "grid" });
  assert.deepEqual(keysOf(grid, "basic"), ["layout", "cols", "gap"]);
  assert.deepEqual(keysOf(grid, "more"), ["align", "justify", "minCol", "stackAt", "span", "span"]);
  const spans = layoutControlsFor(grid).filter((control) => control.key === "span");
  assert.deepEqual(spans.map((control) => control.targetId), ["a", "b"]);
});

test("a wrapping row offers the min column width", () => {
  assert.ok(keysOf(list({ wrap: "wrap" }), "more").includes("minCol"));
});

test("a leaf block gets padding only, a column gets nothing", () => {
  assert.deepEqual(keysOf(para("p")), ["padding"]);
  assert.deepEqual(keysOf(col("c")), []);
});

test("every option list is the STYLE_SCALES entry of its key", () => {
  const all = [...layoutControlsFor(list({ layout: "grid" })), ...layoutControlsFor(para("p"))];
  for (const control of all) {
    const scale = STYLE_SCALES[PROP_SCALE[control.key]];
    assert.deepEqual([...control.options], [...scale], control.key);
  }
});

test("a control reads the stored value, or undefined when the key is absent", () => {
  const controls = layoutControlsFor(list({ layout: "grid", cols: 3 }));
  assert.equal(controls.find((control) => control.key === "cols")?.value, 3);
  assert.equal(controls.find((control) => control.key === "gap")?.value, undefined);
});

test("choosing Grid writes layout, keeps other style keys, and passes the sanitizer", () => {
  const blocks = [list({ tone: "subtle" })];
  const next = applyLayoutChoice(blocks, "list", "layout", "grid");
  const style = findById(next, "list")?.style;
  assert.deepEqual(style, { tone: "subtle", layout: "grid" });
  assert.deepEqual(sanitizeBlockStyle(style), style);
  assert.deepEqual(blocks[0].style, { tone: "subtle" }, "the input tree is not mutated");
});

test("Row and Default remove the key: absent is today's look", () => {
  const blocks = [list({ layout: "grid", gap: 4 })];
  assert.deepEqual(findById(applyLayoutChoice(blocks, "list", "layout", "row"), "list")?.style, { gap: 4 });
  assert.deepEqual(findById(applyLayoutChoice(blocks, "list", "gap", undefined), "list")?.style, { layout: "grid" });
  const bare = findById(applyLayoutChoice([list({ gap: 4 })], "list", "gap", undefined), "list");
  assert.equal(bare && "style" in bare, false, "an emptied style is dropped");
});

test("a style key this build does not know survives a choice and a reset", () => {
  const future = { ...list(), style: { layout: "grid", bleed: "full" } as Block["style"] };
  assert.deepEqual(findById(applyLayoutChoice([future], "list", "cols", 2), "list")?.style, { layout: "grid", bleed: "full", cols: 2 });
  assert.deepEqual(findById(resetLayout([future], "list"), "list")?.style, { bleed: "full" });
});

test("a value outside the scale changes nothing", () => {
  const blocks = [list()];
  assert.equal(applyLayoutChoice(blocks, "list", "cols", 7 as never), blocks);
  assert.equal(applyLayoutChoice(blocks, "list", "layout", "evil" as never), blocks);
});

test("a span choice lands on the column, not on the list", () => {
  const next = applyLayoutChoice([list({ layout: "grid" })], "b", "span", 2);
  assert.deepEqual(findById(next, "b")?.style, { span: 2 });
  assert.deepEqual(findById(next, "list")?.style, { layout: "grid" });
});

test("Reset clears the inspector keys on the list and its columns, and keeps the rest", () => {
  const styled: Block = {
    id: "list", type: "column_list", content: "",
    style: { tone: "subtle", layout: "grid", cols: 3, gap: 4, minCol: 16, stackAt: "mobile", align: "center" },
    children: [col("a", { span: 2, surface: "muted" }), col("b", { span: 1 })],
  };
  const next = resetLayout([styled], "list");
  assert.deepEqual(findById(next, "list")?.style, { tone: "subtle" });
  assert.deepEqual(findById(next, "a")?.style, { surface: "muted" });
  assert.equal("style" in (findById(next, "b") ?? {}), false);
});

test("parseLayoutChoice maps a select value back to the scale entry", () => {
  assert.equal(parseLayoutChoice("cols", "3"), 3);
  assert.equal(parseLayoutChoice("minCol", "16"), 16);
  assert.equal(parseLayoutChoice("layout", "grid"), "grid");
  assert.equal(parseLayoutChoice("gap", ""), undefined);
  assert.equal(parseLayoutChoice("cols", "9"), null);
  assert.equal(parseLayoutChoice("layout", "constructor"), null);
});

test("the Layout entry exists only with the flag on, and not for a column", () => {
  const noop = (): void => undefined;
  const labels = (block: Block, enabled: boolean) =>
    createLayoutContextMenuSections(block, enabled, noop).flatMap((section) => section.items.map((item) => item.label));
  assert.deepEqual(labels(list(), true), ["Layout"]);
  assert.deepEqual(labels(para("p"), true), ["Layout"]);
  assert.deepEqual(labels(list(), false), []);
  assert.deepEqual(labels(col("c"), true), []);
});
