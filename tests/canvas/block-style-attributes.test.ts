// `{k=v}` on a `:::` opener becomes style only through sanitizeBlockStyle, numbers coerced
// per scale; anything else is dropped and reported, never thrown (ADR 0064 PS13). The
// writer's half emits only layout keys, so an unstyled opener keeps its bytes (PS12).

import assert from "node:assert/strict";
import test from "node:test";

import { layoutAttributeText, styleFromAttributes } from "../../src/entities/block/model/blockStyleAttributes.ts";

const record = (entries: Record<string, string>): Record<string, string> =>
  Object.assign(Object.create(null) as Record<string, string>, entries);

test("numbers are coerced per scale and checked against it", () => {
  assert.deepEqual(styleFromAttributes("columns", record({ layout: "grid", cols: "3", minCol: "16", padding: "04" })), {
    style: { layout: "grid", cols: 3, minCol: 16, padding: 4 },
    dropped: [],
  });
  assert.deepEqual(styleFromAttributes("column", record({ span: "2" })).style, { span: 2 });
});

test("a value off its scale or an unknown key is dropped and named", () => {
  const read = styleFromAttributes("columns", record({ cols: "9", minCol: "15", span: "x", stackAt: "phone", bogus: "1" }));
  assert.deepEqual(read.style, {});
  assert.deepEqual(read.dropped, [
    { key: "bogus", reason: "unknown" },
    { key: "cols", reason: "value" },
    { key: "minCol", reason: "value" },
    { key: "span", reason: "value" },
    { key: "stackAt", reason: "value" },
  ]);
});

test("only plain small integers coerce", () => {
  for (const cols of ["1e0", "3.0", " 3", "-1", "0x3", "3 ", "", "1000"]) {
    assert.deepEqual(styleFromAttributes("columns", record({ cols })), { style: {}, dropped: [{ key: "cols", reason: "value" }] }, cols);
  }
});

test("row, stack and grid imply their layout and win over a layout attribute", () => {
  for (const kind of ["row", "stack", "grid"] as const) {
    assert.deepEqual(styleFromAttributes(kind, record({})), { style: { layout: kind }, dropped: [] });
  }
  assert.deepEqual(styleFromAttributes("grid", record({ layout: "row", cols: "2" })), {
    style: { layout: "grid", cols: 2 },
    dropped: [{ key: "layout", reason: "kind" }],
  });
  assert.deepEqual(styleFromAttributes("section", record({ surface: "muted" })), { style: { surface: "muted" }, dropped: [] });
});

test("prototype names are unknown keys, never the prototype", () => {
  const values = record({ constructor: "1", toString: "grid", hasOwnProperty: "2", valueOf: "3" });
  const read = styleFromAttributes("grid", values);
  assert.deepEqual(read.style, { layout: "grid" });
  assert.deepEqual(read.dropped.map((drop) => drop.key), ["constructor", "toString", "hasOwnProperty", "valueOf"]);
  assert.equal(({} as Record<string, unknown>).cols, undefined);
});

test("the writer emits layout keys only, in scale order", () => {
  assert.equal(layoutAttributeText(undefined), "");
  assert.equal(layoutAttributeText({ padding: 3, surface: "muted" }), "");
  assert.equal(layoutAttributeText({ cols: 9, layout: "flex" }), "");
  assert.equal(layoutAttributeText({ minCol: 16, surface: "muted", cols: 3, layout: "grid" }), " {layout=grid cols=3 minCol=16}");
  assert.equal(layoutAttributeText({ span: 2 }), " {span=2}");
  assert.equal(layoutAttributeText({ stackAt: "never", wrap: "wrap", layout: "row" }), " {layout=row wrap=wrap stackAt=never}");
});
