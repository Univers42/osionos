/* ************************************************************************** */
/*  database-grid-keyboard.test.ts — grid activation + navigation, all types  */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCellActivation,
  isClearableType,
  directionForKey,
  nextFocusedCell,
  isGridEntryKey,
  cellDomId,
  type CellActivation,
} from "../../src/shared/notion-database-sys/src/components/views/table/gridKeyboard.ts";

// Every property type in the object-database (contract-types PROPERTY_TYPES),
// mapped to what Enter/double-click should do. This is the "cover all edge cases
// of every property" guarantee — if a new type is added, add its row here.
const ACTIVATION_BY_TYPE: Record<string, CellActivation> = {
  title: "edit", text: "edit", number: "edit", select: "edit", multi_select: "edit",
  status: "edit", date: "edit", due_date: "edit", person: "edit", user: "edit",
  url: "edit", email: "edit", phone: "edit", place: "edit", relation: "edit", custom: "edit",
  files_media: "edit", // has FilesCellEditor (upload/link + drag-drop)
  checkbox: "toggle",
  button: "button",
  formula: "formula",
  assigned_to: "readonly", id: "readonly", rollup: "readonly",
  created_time: "readonly", last_edited_time: "readonly", created_by: "readonly", last_edited_by: "readonly",
};

test("resolveCellActivation covers every property type", () => {
  assert.equal(Object.keys(ACTIVATION_BY_TYPE).length, 27); // all contract-types PROPERTY_TYPES
  for (const [type, expected] of Object.entries(ACTIVATION_BY_TYPE)) {
    assert.equal(resolveCellActivation(type), expected, `${type} → ${expected}`);
  }
});

test("isClearableType: only writable cells (edit + checkbox) can be Delete-cleared", () => {
  for (const [type, act] of Object.entries(ACTIVATION_BY_TYPE)) {
    const clearable = act === "edit" || type === "checkbox";
    assert.equal(isClearableType(type), clearable, `${type} clearable=${clearable}`);
  }
  // Computed/system cells must never be cleared.
  for (const t of ["formula", "rollup", "id", "created_time", "button"]) {
    assert.equal(isClearableType(t), false, `${t} must not be clearable`);
  }
});

test("directionForKey maps arrows, Home/End (+Ctrl/Cmd), PageUp/Down", () => {
  assert.equal(directionForKey({ key: "ArrowUp" }), "up");
  assert.equal(directionForKey({ key: "ArrowDown" }), "down");
  assert.equal(directionForKey({ key: "ArrowLeft" }), "left");
  assert.equal(directionForKey({ key: "ArrowRight" }), "right");
  assert.equal(directionForKey({ key: "Home" }), "rowStart");
  assert.equal(directionForKey({ key: "Home", ctrlKey: true }), "gridStart");
  assert.equal(directionForKey({ key: "End" }), "rowEnd");
  assert.equal(directionForKey({ key: "End", metaKey: true }), "gridEnd");
  assert.equal(directionForKey({ key: "PageUp" }), "pageUp");
  assert.equal(directionForKey({ key: "PageDown" }), "pageDown");
  assert.equal(directionForKey({ key: "a" }), null);
});

const PAGES = [{ id: "p0" }, { id: "p1" }, { id: "p2" }];
const PROPS = [{ id: "c0" }, { id: "c1" }, { id: "c2" }];

test("nextFocusedCell: arrow moves from the middle", () => {
  const mid = { pageId: "p1", propId: "c1" };
  assert.deepEqual(nextFocusedCell("up", mid, PAGES, PROPS), { pageId: "p0", propId: "c1" });
  assert.deepEqual(nextFocusedCell("down", mid, PAGES, PROPS), { pageId: "p2", propId: "c1" });
  assert.deepEqual(nextFocusedCell("left", mid, PAGES, PROPS), { pageId: "p1", propId: "c0" });
  assert.deepEqual(nextFocusedCell("right", mid, PAGES, PROPS), { pageId: "p1", propId: "c2" });
});

test("nextFocusedCell: blocked at edges returns null (ring stays put)", () => {
  const tl = { pageId: "p0", propId: "c0" };
  const br = { pageId: "p2", propId: "c2" };
  assert.equal(nextFocusedCell("up", tl, PAGES, PROPS), null);
  assert.equal(nextFocusedCell("left", tl, PAGES, PROPS), null);
  assert.equal(nextFocusedCell("rowStart", tl, PAGES, PROPS), null);
  assert.equal(nextFocusedCell("down", br, PAGES, PROPS), null);
  assert.equal(nextFocusedCell("right", br, PAGES, PROPS), null);
  assert.equal(nextFocusedCell("rowEnd", br, PAGES, PROPS), null);
});

test("nextFocusedCell: Home/End/grid jumps and PageUp/Down clamp", () => {
  const mid = { pageId: "p1", propId: "c1" };
  assert.deepEqual(nextFocusedCell("rowStart", mid, PAGES, PROPS), { pageId: "p1", propId: "c0" });
  assert.deepEqual(nextFocusedCell("rowEnd", mid, PAGES, PROPS), { pageId: "p1", propId: "c2" });
  assert.deepEqual(nextFocusedCell("gridStart", mid, PAGES, PROPS), { pageId: "p0", propId: "c0" });
  assert.deepEqual(nextFocusedCell("gridEnd", mid, PAGES, PROPS), { pageId: "p2", propId: "c2" });
  // pageStep 10 overshoots a 3-row grid → clamps to the far row.
  assert.deepEqual(nextFocusedCell("pageDown", { pageId: "p0", propId: "c1" }, PAGES, PROPS), { pageId: "p2", propId: "c1" });
  assert.deepEqual(nextFocusedCell("pageUp", { pageId: "p2", propId: "c1" }, PAGES, PROPS), { pageId: "p0", propId: "c1" });
});

test("nextFocusedCell: unknown current cell or empty grid → null", () => {
  assert.equal(nextFocusedCell("down", { pageId: "ghost", propId: "c0" }, PAGES, PROPS), null);
  assert.equal(nextFocusedCell("down", { pageId: "p0", propId: "c0" }, [], PROPS), null);
  assert.equal(nextFocusedCell("right", { pageId: "p0", propId: "c0" }, PAGES, []), null);
});

test("isGridEntryKey: nav/Enter/Tab enter the grid, letters don't", () => {
  for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Enter", "Tab"]) {
    assert.ok(isGridEntryKey(k), `${k} enters grid`);
  }
  for (const k of ["a", "Escape", " ", "Delete"]) {
    assert.equal(isGridEntryKey(k), false, `${k} does not enter grid`);
  }
});

test("cellDomId is stable and scoped by database id", () => {
  assert.equal(cellDomId("db1", "pageA", "propB"), "odb-cell:db1:pageA:propB");
  assert.notEqual(cellDomId("db1", "p", "c"), cellDomId("db2", "p", "c"));
});
