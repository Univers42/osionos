// The appearance export/import: what differs from the default is exported, and import is a
// trust boundary — too long, not JSON, wrong kind or version are refused with a reason; junk
// axis values fall back to the default and unknown palettes or modes are dropped.

import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_APPEARANCE, PALETTES } from "../../src/shared/config/theme.ts";
import {
  defaultsFor,
  diffFromDefault,
  exportAppearance,
  importAppearance,
  isChanged,
  MAX_IMPORT_CHARS,
} from "../../src/features/theme/model/appearanceTransfer.ts";

const doc = (extra: Record<string, unknown>) => JSON.stringify({ kind: "osionos-appearance", version: 1, ...extra });
const palette = PALETTES[1].id;

test("the default appearance differs from nothing", () => {
  assert.deepEqual(diffFromDefault(DEFAULT_APPEARANCE), {});
  assert.equal(isChanged(DEFAULT_APPEARANCE, ["radius", "density"]), false);
});

test("diff, isChanged and defaultsFor agree", () => {
  const changed = { ...DEFAULT_APPEARANCE, radius: "round", surface: "glass" } as const;
  assert.deepEqual(diffFromDefault(changed), { radius: "round", surface: "glass" });
  assert.equal(isChanged(changed, ["radius"]), true);
  assert.equal(isChanged(changed, ["density"]), false);
  assert.deepEqual(defaultsFor(["radius", "surface"]), { radius: "default", surface: "solid" });
});

test("export then import round-trips appearance, palette and mode", () => {
  const appearance = { ...DEFAULT_APPEARANCE, density: "compact", caretShape: "block" } as const;
  const text = exportAppearance({ appearance, palette, mode: "dark" });
  const parsed = JSON.parse(text);
  assert.equal(parsed.kind, "osionos-appearance");
  assert.equal(parsed.version, 1);
  assert.deepEqual(parsed.appearance, { density: "compact", caretShape: "block" });
  const result = importAppearance(text);
  assert.ok(result.ok);
  assert.deepEqual(result.appearance, appearance);
  assert.equal(result.palette, palette);
  assert.equal(result.mode, "dark");
  assert.equal(result.count, 2);
});

test("import refuses what it cannot trust, and says why", () => {
  const cases: [string, RegExp][] = [
    ["x".repeat(MAX_IMPORT_CHARS + 1), /too long/],
    ["not json", /not valid JSON/],
    ["[1]", /kind/],
    [JSON.stringify({ kind: "other", version: 1 }), /kind/],
    [JSON.stringify({ kind: "osionos-appearance", version: 2 }), /version/],
  ];
  for (const [text, message] of cases) {
    const result = importAppearance(text);
    assert.ok(!result.ok);
    assert.match(result.error, message);
  }
});

test("junk axis values fall back to the default and are not counted", () => {
  const result = importAppearance(doc({ appearance: { surface: "glass", density: "huge", radius: 7, evil: "x" } }));
  assert.ok(result.ok);
  assert.equal(result.appearance.surface, "glass");
  assert.equal(result.appearance.density, DEFAULT_APPEARANCE.density);
  assert.equal(result.appearance.radius, DEFAULT_APPEARANCE.radius);
  assert.equal("evil" in result.appearance, false);
  assert.equal(result.count, 1);
});

test("an unknown palette or mode is dropped, not an error", () => {
  const result = importAppearance(doc({ palette: "nope", mode: "sepia", appearance: "junk" }));
  assert.ok(result.ok);
  assert.equal(result.palette, undefined);
  assert.equal(result.mode, undefined);
  assert.equal(result.count, 0);
});
