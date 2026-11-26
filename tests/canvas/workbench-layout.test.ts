import assert from "node:assert/strict";
import test from "node:test";
import {
  clampDockHeight,
  clampDockWidth,
  dockDragDelta,
  dockKeySize,
  dockPresence,
  effectiveDockPosition,
  isDockPosition,
  migrateFromIdeMode,
  DOCK_DEFAULT_WIDTH,
  DOCK_KEY_STEP,
  DOCK_MIN_WIDTH,
  DOCK_POSITIONS,
  DOCK_TABS,
  DOCK_MIN_HEIGHT,
  DOCK_DEFAULT_HEIGHT,
  isDockTab,
  type DockPosition,
} from "../../src/widgets/workbench/model/workbenchLayout.ts";

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
// Once opened, the dock is hidden on close, never unmounted, on the web as on the desktop: the node
// terminal's shell ends with its socket, so an unmount on close killed it (the web used to unmount).
test("dockPresence: absent until first opened, then shown or hidden, never absent again", () => {
  assert.equal(dockPresence({ open: false, everOpened: false }), "absent");
  assert.equal(dockPresence({ open: true, everOpened: true }), "shown");
  assert.equal(dockPresence({ open: false, everOpened: true }), "hidden");
});

// --- dock position: constants ---

test("DOCK_POSITIONS lists bottom, left, right, frozen", () => {
  assert.deepStrictEqual(DOCK_POSITIONS, ["bottom", "left", "right"]);
  assert.strictEqual(Object.isFrozen(DOCK_POSITIONS), true);
});

test("dock width and key step constants", () => {
  assert.strictEqual(DOCK_MIN_WIDTH, 240);
  assert.strictEqual(DOCK_DEFAULT_WIDTH, 420);
  assert.strictEqual(DOCK_KEY_STEP, 16);
});

// --- isDockPosition ---

test("isDockPosition: the three positions are valid", () => {
  for (const position of ["bottom", "left", "right"]) assert.strictEqual(isDockPosition(position), true);
});

test("isDockPosition: anything else is not", () => {
  for (const value of ["top", "", "Bottom", 1, null, undefined, {}, ["bottom"]]) assert.strictEqual(isDockPosition(value), false);
});

// --- clampDockWidth ---

test("clampDockWidth: inside [240, floor(vw/2)] stays", () => {
  assert.strictEqual(clampDockWidth(400, 1200), 400);
});

test("clampDockWidth: below the minimum clamps up, above half the viewport clamps down", () => {
  assert.strictEqual(clampDockWidth(100, 1200), 240);
  assert.strictEqual(clampDockWidth(900, 1200), 600);
});

test("clampDockWidth: the cap is floor(vw * 0.5)", () => {
  assert.strictEqual(clampDockWidth(Number.MAX_SAFE_INTEGER, 1201), 600);
  assert.strictEqual(clampDockWidth(Number.MAX_SAFE_INTEGER, 1280), 640);
});

test("clampDockWidth: px NaN or Infinity falls back to the default width", () => {
  assert.strictEqual(clampDockWidth(NaN, 1600), 420);
  assert.strictEqual(clampDockWidth(Infinity, 1600), 420);
  assert.strictEqual(clampDockWidth(-Infinity, 1600), 420);
});

test("clampDockWidth: the default itself is capped by a small viewport", () => {
  assert.strictEqual(clampDockWidth(NaN, 700), 350);
});

test("clampDockWidth: unknown viewport (NaN, 0, negative, Infinity) caps at the default width", () => {
  for (const vw of [NaN, 0, -5, Infinity]) {
    assert.strictEqual(clampDockWidth(900, vw), 420);
    assert.strictEqual(clampDockWidth(300, vw), 300);
    assert.strictEqual(clampDockWidth(100, vw), 240);
  }
});

test("clampDockWidth: a tiny viewport (half under 240) still allows exactly the minimum", () => {
  assert.strictEqual(clampDockWidth(500, 300), 240);
  assert.strictEqual(clampDockWidth(100, 300), 240);
  assert.strictEqual(clampDockWidth(240, 479), 240);
});

test("clampDockWidth: the cap equals the minimum at vw 480 and opens up from vw 482", () => {
  assert.strictEqual(clampDockWidth(999, 480), 240);
  assert.strictEqual(clampDockWidth(999, 482), 241);
});

test("clampDockWidth: rounds a fractional width after clamping", () => {
  assert.strictEqual(clampDockWidth(300.6, 1200), 301);
  assert.strictEqual(clampDockWidth(300.4, 1200), 300);
  assert.strictEqual(clampDockWidth(239.6, 1200), 240);
});

// --- effectiveDockPosition ---

test("effectiveDockPosition: a phone always gets the bottom dock", () => {
  for (const position of DOCK_POSITIONS) assert.strictEqual(effectiveDockPosition(position, true), "bottom");
});

test("effectiveDockPosition: elsewhere the stored position is kept", () => {
  for (const position of DOCK_POSITIONS) assert.strictEqual(effectiveDockPosition(position, false), position);
});

// --- dockDragDelta ---

const FROM = { x: 500, y: 400 };

test("dockDragDelta: bottom grows when the pointer goes up", () => {
  assert.strictEqual(dockDragDelta("bottom", FROM, { x: 500, y: 350 }), 50);
  assert.strictEqual(dockDragDelta("bottom", FROM, { x: 500, y: 450 }), -50);
});

test("dockDragDelta: right grows when the pointer goes left", () => {
  assert.strictEqual(dockDragDelta("right", FROM, { x: 450, y: 400 }), 50);
  assert.strictEqual(dockDragDelta("right", FROM, { x: 560, y: 400 }), -60);
});

test("dockDragDelta: left grows when the pointer goes right", () => {
  assert.strictEqual(dockDragDelta("left", FROM, { x: 550, y: 400 }), 50);
  assert.strictEqual(dockDragDelta("left", FROM, { x: 440, y: 400 }), -60);
});

test("dockDragDelta: only the axis of the position counts", () => {
  assert.strictEqual(dockDragDelta("bottom", FROM, { x: 9000, y: 400 }), 0);
  assert.strictEqual(dockDragDelta("right", FROM, { x: 500, y: 9000 }), 0);
  assert.strictEqual(dockDragDelta("left", FROM, { x: 500, y: 9000 }), 0);
});

// --- dockKeySize: every position x every key ---

const MIN = 100;
const MAX = 500;
const SHOWN = 300;
const NO_KEY = null;

const KEY_TABLE: Record<DockPosition, Record<string, number | null>> = {
  bottom: { ArrowUp: SHOWN + 16, ArrowDown: SHOWN - 16, ArrowLeft: NO_KEY, ArrowRight: NO_KEY, Home: MIN, End: MAX, a: NO_KEY },
  right: { ArrowUp: NO_KEY, ArrowDown: NO_KEY, ArrowLeft: SHOWN + 16, ArrowRight: SHOWN - 16, Home: MIN, End: MAX, a: NO_KEY },
  left: { ArrowUp: NO_KEY, ArrowDown: NO_KEY, ArrowLeft: SHOWN - 16, ArrowRight: SHOWN + 16, Home: MIN, End: MAX, a: NO_KEY },
};

for (const position of DOCK_POSITIONS) {
  for (const [key, expected] of Object.entries(KEY_TABLE[position])) {
    test(`dockKeySize: ${position} + ${key} -> ${expected}`, () => {
      assert.strictEqual(dockKeySize(position, key, SHOWN, MIN, MAX), expected);
    });
  }
}

test("dockKeySize: other keys are never resize keys", () => {
  for (const position of DOCK_POSITIONS) {
    for (const key of ["Enter", " ", "PageUp", "PageDown", "Tab", "Escape", "", "arrowup", "ArrowUp "]) {
      assert.strictEqual(dockKeySize(position, key, SHOWN, MIN, MAX), null, `${position} ${JSON.stringify(key)}`);
    }
  }
});

test("dockKeySize: growing clamps at the max, shrinking at the min, in every position", () => {
  const grow: Record<DockPosition, string> = { bottom: "ArrowUp", right: "ArrowLeft", left: "ArrowRight" };
  const shrink: Record<DockPosition, string> = { bottom: "ArrowDown", right: "ArrowRight", left: "ArrowLeft" };
  for (const position of DOCK_POSITIONS) {
    assert.strictEqual(dockKeySize(position, grow[position], MAX - 5, MIN, MAX), MAX);
    assert.strictEqual(dockKeySize(position, grow[position], MAX, MIN, MAX), MAX);
    assert.strictEqual(dockKeySize(position, shrink[position], MIN + 5, MIN, MAX), MIN);
    assert.strictEqual(dockKeySize(position, shrink[position], MIN, MIN, MAX), MIN);
  }
});

test("dockKeySize: Home and End land on the bounds whatever the shown size", () => {
  for (const position of DOCK_POSITIONS) {
    assert.strictEqual(dockKeySize(position, "Home", MAX, MIN, MAX), MIN);
    assert.strictEqual(dockKeySize(position, "End", MIN, MIN, MAX), MAX);
  }
});
