import assert from "node:assert/strict";
import test from "node:test";
import { clampDockHeight, migrateFromIdeMode, DOCK_TABS, DOCK_MIN_HEIGHT, DOCK_DEFAULT_HEIGHT, isDockTab } from "../../src/widgets/workbench/model/workbenchLayout.ts";

// --- DOCK_TABS ---

test("DOCK_TABS has correct order", () => {
  assert.deepStrictEqual(DOCK_TABS, ["terminal", "problems", "output", "debug", "ports"]);
});

test("DOCK_MIN_HEIGHT is 120", () => {
  assert.strictEqual(DOCK_MIN_HEIGHT, 120);
});

test("DOCK_DEFAULT_HEIGHT is 260", () => {
  assert.strictEqual(DOCK_DEFAULT_HEIGHT, 260);
});

// --- clampDockHeight ---

// An unknown viewport caps at the default height but keeps a smaller requested height.
test("clampDockHeight: viewport 0 caps at DOCK_DEFAULT_HEIGHT", () => {
  assert.strictEqual(clampDockHeight(200, 0), 200);
  assert.strictEqual(clampDockHeight(900, 0), 260);
});

test("clampDockHeight: viewport NaN caps at DOCK_DEFAULT_HEIGHT", () => {
  assert.strictEqual(clampDockHeight(200, NaN), 200);
  assert.strictEqual(clampDockHeight(50, NaN), 120);
});

test("clampDockHeight: viewport Infinity caps at DOCK_DEFAULT_HEIGHT", () => {
  assert.strictEqual(clampDockHeight(900, Infinity), 260);
});

test("clampDockHeight: px NaN returns DOCK_DEFAULT_HEIGHT clamped", () => {
  assert.strictEqual(clampDockHeight(NaN, 800), 260);
});

test("clampDockHeight: tiny viewport 100, px 150 returns 120", () => {
  // max = floor(100 * 0.7) = 70 -> adjusted to DOCK_MIN_HEIGHT=120; px=150 clamped to [120,120] = 120
  assert.strictEqual(clampDockHeight(150, 100), 120);
});

test("clampDockHeight: viewport 170 max=119->120, px 119 below min -> 120", () => {
  // max = floor(170 * 0.7) = 119 -> adjusted to 120; px=119 clamped to [120,120] = 120
  assert.strictEqual(clampDockHeight(119, 170), 120);
});

test("clampDockHeight: viewport 200px max=140, px 130 inside range stays", () => {
  // max = floor(200 * 0.7) = 140; px=130 clamped to [120,140] = 130
  assert.strictEqual(clampDockHeight(130, 200), 130);
});

test("clampDockHeight: viewport 200px max=140, px 150 above max clamped", () => {
  // max = 140; px=150 clamped to [120,140] = 140
  assert.strictEqual(clampDockHeight(150, 200), 140);
});

test("clampDockHeight: viewport 200px max=140, px 100 below min clamped", () => {
  // max = 140; px=100 clamped to [120,140] = 120
  assert.strictEqual(clampDockHeight(100, 200), 120);
});

test("clampDockHeight: fractional px 130.7 rounds to 131", () => {
  // max = 140; px=130.7 clamped to [120,140] = 130.7 -> round = 131
  assert.strictEqual(clampDockHeight(130.7, 200), 131);
});

test("clampDockHeight: fractional px 119.3 below min rounds to 120", () => {
  // max = 140; px=119.3 clamped to [120,140] = 120 (clamp then round)
  assert.strictEqual(clampDockHeight(119.3, 200), 120);
});

// --- migrateFromIdeMode ---

test("migrateFromIdeMode: valid true returns dockOpen true", () => {
  const result = migrateFromIdeMode('{"state":{"bottomOpen":true},"version":0}');
  assert.deepStrictEqual(result, { dockOpen: true });
});

test("migrateFromIdeMode: valid false returns dockOpen false", () => {
  const result = migrateFromIdeMode('{"state":{"bottomOpen":false},"version":0}');
  assert.deepStrictEqual(result, { dockOpen: false });
});

test("migrateFromIdeMode: null returns null", () => {
  assert.strictEqual(migrateFromIdeMode(null), null);
});

test("migrateFromIdeMode: empty string returns null", () => {
  assert.strictEqual(migrateFromIdeMode(""), null);
});

test("migrateFromIdeMode: not json returns null", () => {
  assert.strictEqual(migrateFromIdeMode("not json"), null);
});

test("migrateFromIdeMode: array returns null", () => {
  assert.strictEqual(migrateFromIdeMode("[]"), null);
});

test("migrateFromIdeMode: object without state returns null", () => {
  assert.strictEqual(migrateFromIdeMode("{}"), null);
});

test("migrateFromIdeMode: state without bottomOpen returns null", () => {
  assert.strictEqual(migrateFromIdeMode('{"state":{}}'), null);
});

test("migrateFromIdeMode: bottomOpen non-boolean returns null", () => {
  assert.strictEqual(migrateFromIdeMode('{"state":{"bottomOpen":"yes"}}'), null);
});

test("migrateFromIdeMode: missing version is OK if state.bottomOpen is boolean", () => {
  const result = migrateFromIdeMode('{"state":{"bottomOpen":true}}');
  assert.deepStrictEqual(result, { dockOpen: true });
});

// --- isDockTab ---

test("isDockTab: valid terminal returns true", () => {
  assert.strictEqual(isDockTab("terminal"), true);
});

test("isDockTab: valid problems returns true", () => {
  assert.strictEqual(isDockTab("problems"), true);
});

test("isDockTab: valid output returns true", () => {
  assert.strictEqual(isDockTab("output"), true);
});

test("isDockTab: valid ports returns true", () => {
  assert.strictEqual(isDockTab("ports"), true);
});

test("isDockTab: valid debug returns true", () => {
  assert.strictEqual(isDockTab("debug"), true);
});

test("isDockTab: undefined returns false", () => {
  assert.strictEqual(isDockTab(undefined), false);
});

test("isDockTab: number 1 returns false", () => {
  assert.strictEqual(isDockTab(1), false);
});