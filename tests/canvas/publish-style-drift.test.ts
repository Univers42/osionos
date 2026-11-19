// ADR 0064 PS39: the bridge copies a block's style through its own sanitizer, which cannot import
// the client's TypeScript. This test fails when the two scales, or their answers, disagree.
import assert from "node:assert/strict";
import test from "node:test";

import { PROP_SCALE, STYLE_SCALES, sanitizeBlockStyle } from "../../src/entities/block/model/blockStyle.ts";
// @ts-expect-error plain .mjs, no declaration file
import * as bridge from "../../scripts/bridge-style-scales.mjs";

test("the bridge's scales equal STYLE_SCALES and PROP_SCALE", () => {
  assert.deepEqual(bridge.STYLE_SCALES, STYLE_SCALES);
  assert.deepEqual(bridge.PROP_SCALE, PROP_SCALE);
});

test("the bridge sanitizer answers like the client on every scale value, off-scale value and hostile key", () => {
  const keys = [...Object.keys(PROP_SCALE), ...Object.getOwnPropertyNames(Object.prototype), "x"];
  const values: unknown[] = [0, 1, 3, 12, 13, "panel", "red", "grid", "never", "", null, true, [], {}, "constructor"];
  for (const key of keys) {
    const scale = Object.hasOwn(PROP_SCALE, key) ? (STYLE_SCALES[PROP_SCALE[key]] as readonly unknown[]) : [];
    for (const value of [...values, ...scale]) {
      const style = JSON.parse(JSON.stringify({ [key]: value, padding: 3 }));
      assert.deepEqual(bridge.sanitizeStyle(style), sanitizeBlockStyle(style), `${key}=${String(value)}`);
    }
  }
  for (const input of [null, "x", [], 7]) assert.deepEqual(bridge.sanitizeStyle(input), {});
});
