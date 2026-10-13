/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-overlay.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "../../src/entities/block/model/types.ts";

import {
  EXTRA_BLOCK_KEYS,
  applyOverlay,
  collectOverlay,
  isExtraBlockKey,
} from "../../src/features/page-file/model/blockOverlay.ts";
import type { BlockOverlay } from "../../src/features/page-file/model/types.ts";

function para(id: string): Block {
  return { id, type: "paragraph", content: "" };
}

function withExtras(extras: Record<string, unknown>): Block {
  return { id: "d", type: "paragraph", content: "c", ...extras } as Block;
}

function deepFreeze(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  for (const item of Array.isArray(value) ? value : Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function sampleTree(): Block[] {
  return [
    { id: "p0", type: "toggle", content: "Section", collapsed: true, children: [
      { id: "p0a", type: "code", content: "print()", language: "python", fileName: "demo.py",
        codeTheme: "dark", lineNumbers: true, heightLines: 12, children: [
        { id: "p0a0", type: "paragraph", content: "nested", textColor: "#fff" }] },
      { id: "p0b", type: "to_do", content: "task", checked: true, dueAt: "2026-10-13" }] },
    { id: "p1", type: "image", content: "pic.png", mediaWidth: 66, mediaShape: "rounded", mediaAspect: "16 / 9" },
  ];
}

// What the Markdown round trip leaves behind: same structure, fresh ids, no extras.
function parsedTree(): Block[] {
  return [
    { id: "q0", type: "toggle", content: "Section", children: [
      { id: "q0a", type: "code", content: "print()", language: "python", children: [
        { id: "q0a0", type: "paragraph", content: "nested" }] },
      { id: "q0b", type: "to_do", content: "task", checked: true }] },
    { id: "q1", type: "image", content: "pic.png" },
  ];
}

test("round trip: collect → JSON → apply restores ids and extras", () => {
  const original = sampleTree();
  const overlay = JSON.parse(JSON.stringify(collectOverlay(original))) as BlockOverlay;
  assert.deepEqual(applyOverlay(parsedTree(), overlay), sampleTree());
});

test("overlay keys are the pre-order index paths, one entry per block", () => {
  const small: Block[] = [
    para("a"),
    { id: "b", type: "toggle", content: "t", children: [para("c")] },
  ];
  assert.deepEqual(collectOverlay(small), {
    "0": { t: "paragraph", id: "a" },
    "1": { t: "toggle", id: "b" },
    "1.0": { t: "paragraph", id: "c" },
  });
  // Integer-like paths ("0", "1") order ahead of "0.0" in Object.keys; assert the set sorted.
  assert.deepEqual(Object.keys(collectOverlay(sampleTree())).sort(), ["0", "0.0", "0.0.0", "0.1", "1"]);
});

test("a type mismatch keeps the parsed block; siblings still restore", () => {
  const overlay: BlockOverlay = {
    "0": { t: "paragraph", id: "wrong", collapsed: true },
    "1": { t: "code", id: "restored", codeTheme: "light" },
  };
  const parsed = [{ id: "kept", type: "toggle", content: "s" }, { id: "pc", type: "code", content: "c" }];
  const restored = applyOverlay(parsed, overlay);
  assert.deepEqual(restored[0], parsed[0]);
  assert.equal(restored[1].id, "restored");
  assert.equal(restored[1].codeTheme, "light");
});

test("a duplicate overlay id falls back to the parsed id", () => {
  const overlay: BlockOverlay = {
    "0": { t: "paragraph", id: "dup" },
    "1": { t: "paragraph", id: "dup" },
  };
  const restored = applyOverlay([para("a"), para("b")], overlay);
  assert.equal(restored[0].id, "dup");
  assert.equal(restored[1].id, "b");
});

test("overlay ids are capped at 128 characters", () => {
  const overlay: BlockOverlay = {
    "0": { t: "paragraph", id: "y".repeat(128) },
    "1": { t: "paragraph", id: "x".repeat(129) },
  };
  const restored = applyOverlay([para("a"), para("b")], overlay);
  assert.equal(restored[0].id, "y".repeat(128));
  assert.equal(restored[1].id, "b");
});

test("invalid values are neither collected nor applied", () => {
  const dirty = [
    withExtras({ collapsed: "yes" }), withExtras({ mediaWidth: 0 }),
    withExtras({ dueAt: "2026-1-1" }), withExtras({ layoutConfig: [] }),
    withExtras({ layoutCells: [{ id: 7 }] }), withExtras({ evil: true }),
  ];
  const collected = Object.values(collectOverlay(dirty));
  assert.ok(collected.every((entry) => Object.keys(entry).sort().join(",") === "id,t"));
  const handMade: BlockOverlay = {
    "0": { t: "paragraph", id: "k", collapsed: "yes", mediaWidth: 0, dueAt: "2026-1-1", layoutConfig: [] },
  };
  const restored = applyOverlay([para("p")], handMade);
  assert.deepEqual(Object.keys(restored[0]).sort(), ["content", "id", "type"]);
});

test("dangerous keys and non-object entries are ignored; prototype stays clean", () => {
  const json = '{"0":{"t":"paragraph","id":"safe","__proto__":{"evil":1},'
    + '"constructor":{},"content":"boom","type":"code","children":[],"evil":1},'
    + '"1":{"id":"notype"},"2":"nope"}';
  const overlay = JSON.parse(json) as BlockOverlay;
  assert.equal(Object.hasOwn(overlay["0"], "__proto__"), true);
  const restored = applyOverlay([para("p"), para("q"), para("r")], overlay);
  assert.equal(restored[0].id, "safe");
  assert.deepEqual(Object.keys(restored[0]).sort(), ["content", "id", "type"]);
  assert.deepEqual(restored.slice(1).map((block) => block.id), ["q", "r"]);
  assert.equal(Object.hasOwn(Object.prototype, "evil"), false);
});

test("keys restricts collected extras; unknown names are ignored", () => {
  const overlay = collectOverlay(sampleTree(), ["collapsed", "textColor", "nope"]);
  assert.deepEqual(Object.keys(overlay["0"]).sort(), ["collapsed", "id", "t"]);
  assert.deepEqual(Object.keys(overlay["0.0.0"]).sort(), ["id", "t", "textColor"]);
  assert.deepEqual(Object.keys(overlay["0.1"]).sort(), ["id", "t"]);
});

test("deep-frozen inputs neither throw nor mutate", () => {
  const frozen = deepFreeze(sampleTree()) as readonly Block[];
  const overlay = deepFreeze(collectOverlay(sampleTree())) as BlockOverlay;
  assert.doesNotThrow(() => collectOverlay(frozen));
  const restored = applyOverlay(frozen, overlay);
  assert.notEqual(restored, frozen);
  assert.deepEqual(frozen, sampleTree());
});

test("an empty tree collects {} and applies to []", () => {
  assert.deepEqual(collectOverlay([]), {});
  assert.deepEqual(applyOverlay([], {}), []);
});

test("valid enums, boundary numbers and layout values round-trip", () => {
  const original = withExtras({
    codeView: "source", codeTheme: "light", mediaShape: "circle", collectionRef: "members",
    recordRef: "$viewedUser", layoutMode: "full_page", layoutRole: "header", heightLines: 1,
    recordLimit: 1, schemaVersion: 0, mediaWidth: 100,
    layoutConfig: { columns: 2, rowHeight: 40, gap: 8, wrap: true, autoArrange: false, snapToGrid: false, guideVisibility: "auto", preview: true },
    layoutCells: [{ id: "cell", colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1, blocks: [] }],
  });
  // The overlay carries id + extras only; content comes from Markdown.
  assert.deepEqual(applyOverlay([para("n")], collectOverlay([original])), [{ ...original, content: "" }]);
});

test("children are rebuilt; a missing entry still walks them", () => {
  const overlay: BlockOverlay = {
    "0.0": { t: "paragraph", id: "deep", children: [{ id: "injected" }] },
  };
  const blocks: Block[] = [
    { id: "a", type: "toggle", content: "c", children: [para("b")] },
  ];
  const restored = applyOverlay(blocks, overlay);
  assert.equal(restored[0].children?.[0].id, "deep");
  assert.equal(restored[0].children?.[0].children, undefined);
  assert.deepEqual(Object.keys(restored[0]).sort(), ["children", "content", "id", "type"]);
});

test("EXTRA_BLOCK_KEYS is the frozen 27-key allowlist", () => {
  assert.deepEqual(Object.keys(EXTRA_BLOCK_KEYS).sort(), [
    "backgroundColor", "codeTheme", "codeView", "collapsed", "collectionRef",
    "color", "deferMount", "dueAt", "fieldBind", "fileName", "headingLevel",
    "heightLines", "layoutCells", "layoutConfig", "layoutMode", "layoutRole", "lineNumbers",
    "mediaAspect", "mediaShape", "mediaWidth", "recordLimit", "recordRef",
    "schemaVersion", "sqlMountId", "tableConfig", "textColor", "viewId",
  ]);
  assert.equal(Object.isFrozen(EXTRA_BLOCK_KEYS), true);
  assert.equal(isExtraBlockKey("collapsed"), true);
  assert.equal(isExtraBlockKey("toString"), false);
});
