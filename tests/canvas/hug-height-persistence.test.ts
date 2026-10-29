/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   hug-height-persistence.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ :+:         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { LayoutCell } from "../../src/entities/block/model/types.ts";
import { buildCanvasBlockPatch } from "../../src/features/block-editor/ui/canvas/controller/persistence.ts";
import { canvasReducer, isPersistableCanvasAction } from "../../src/features/block-editor/ui/canvas/model/canvasReducer.ts";
import { createCanvasStateFromLegacy, gridConfigFromLegacy, migrate, unmigrateCanvasCells } from "../../src/features/block-editor/ui/canvas/model/migration.ts";
import type { CanvasPersistedBlockPatch } from "../../src/features/block-editor/ui/canvas/model/types.ts";
import { createCanvasStore } from "../../src/features/block-editor/ui/canvas/store/canvasStore.ts";

const LAYOUT_CONFIG = { columns: 12, rowHeight: 96, gap: 16 };
const GRID_HEIGHT = 2 * 96 + 16;

function legacyCell(overrides: Partial<LayoutCell> = {}): LayoutCell {
  return {
    id: "cell-1",
    colStart: 1,
    colSpan: 4,
    rowStart: 1,
    rowSpan: 2,
    blocks: [],
    sizing: "auto-height",
    ...overrides,
  };
}

function hugState(cell: LayoutCell = legacyCell()) {
  return createCanvasStateFromLegacy("layout", LAYOUT_CONFIG, [cell]);
}

test("pinning a hug cell's measured height writes the cell and the frame without an undo entry", () => {
  const state = hugState();
  assert.equal(state.history.past.length, 0);

  const pinned = canvasReducer(state, { type: "setCellMeasuredHeight", id: "cell-1", height: 137.4 });

  const cell = pinned.cells[0];
  assert.equal(cell.measuredHeight, 137);
  assert.equal(cell.frame.height, 137);
  assert.equal(cell.sizing.height, "fixed");
  assert.equal(pinned.history.past.length, 0);
  assert.equal(pinned.history.future.length, 0);
  assert.equal(state.cells[0].measuredHeight, undefined);
  assert.equal(state.cells[0].frame.height, GRID_HEIGHT);
});

test("a fixed cell rejects a measurement", () => {
  const state = hugState(legacyCell({ sizing: "fixed" }));

  const pinned = canvasReducer(state, { type: "setCellMeasuredHeight", id: "cell-1", height: 137 });

  assert.equal(pinned, state);
  assert.equal(pinned.cells[0].frame.height, GRID_HEIGHT);
  assert.equal(pinned.cells[0].measuredHeight, undefined);
});

test("an unknown cell id is ignored", () => {
  const state = hugState();

  const pinned = canvasReducer(state, { type: "setCellMeasuredHeight", id: "nope", height: 137 });

  assert.equal(pinned, state);
});

test("a hostile measurement never reaches the cell", () => {
  for (const height of [Number.NaN, -5, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
    const state = hugState();
    const pinned = canvasReducer(state, { type: "setCellMeasuredHeight", id: "cell-1", height });
    assert.equal(pinned.cells[0].measuredHeight, undefined, `height ${String(height)}`);
    assert.equal(pinned.cells[0].frame.height, GRID_HEIGHT, `height ${String(height)}`);
  }
});

test("a zero height is a valid measurement", () => {
  const state = hugState();

  const pinned = canvasReducer(state, { type: "setCellMeasuredHeight", id: "cell-1", height: 0 });

  assert.equal(pinned.cells[0].measuredHeight, 0);
  assert.equal(pinned.cells[0].frame.height, 0);
});

test("the pinned height survives a save/reload round-trip", () => {
  const pinned = canvasReducer(hugState(), { type: "setCellMeasuredHeight", id: "cell-1", height: 137 });

  const patch = buildCanvasBlockPatch(pinned);
  assert.equal(patch.layoutCells[0].measuredHeight, 137);

  const legacyCells = unmigrateCanvasCells(pinned.cells, pinned.layoutConfig);
  assert.equal(legacyCells[0].measuredHeight, 137);

  const reloaded = migrate(legacyCells[0], gridConfigFromLegacy(LAYOUT_CONFIG));
  assert.equal(reloaded.measuredHeight, 137);
  assert.equal(reloaded.frame.height, 137);
});

test("a malformed saved height is dropped and the cell keeps its grid height", () => {
  const grid = gridConfigFromLegacy(LAYOUT_CONFIG);
  for (const bad of [-5, Number.NaN, "137", null, Number.POSITIVE_INFINITY]) {
    const migrated = migrate(legacyCell({ measuredHeight: bad as unknown as number }), grid);
    assert.equal(migrated.measuredHeight, undefined, `height ${String(bad)}`);
    assert.equal(migrated.frame.height, GRID_HEIGHT, `height ${String(bad)}`);
    assert.equal(Object.hasOwn(migrated, "measuredHeight"), false, `height ${String(bad)}`);
  }
});

test("a cell without a saved height behaves exactly as today", () => {
  const grid = gridConfigFromLegacy(LAYOUT_CONFIG);

  const migrated = migrate(legacyCell(), grid);

  assert.equal(Object.hasOwn(migrated, "measuredHeight"), false);
  assert.equal(migrated.frame.height, GRID_HEIGHT);
  assert.equal(migrated.sizing.height, "hug");
  const legacyCells = unmigrateCanvasCells([migrated], grid);
  assert.equal(Object.hasOwn(legacyCells[0], "measuredHeight"), false);
});

test("the measurement is persistable and reaches the block patch", () => {
  assert.equal(isPersistableCanvasAction({ type: "setCellMeasuredHeight", id: "cell-1", height: 137 }), true);

  const store = createCanvasStore(hugState());
  const patches: CanvasPersistedBlockPatch[] = [];
  store.getState().setPersistence((_layoutBlockId, patch) => { patches.push(patch); });

  store.getState().dispatch({ type: "setCellMeasuredHeight", id: "cell-1", height: 137 });
  store.getState().flushPendingWrite();

  assert.equal(patches.length, 1);
  assert.equal(patches[0].layoutCells[0].measuredHeight, 137);
});
