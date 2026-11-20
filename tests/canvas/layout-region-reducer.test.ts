/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layout-region-reducer.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The setCellRegion writer (T1b): values normalize against the fixed enums, an
// unknown value erases the field it names, and the change is one undo step.

import assert from "node:assert/strict";
import test from "node:test";

import type { LayoutCell } from "../../src/entities/block/model/types.ts";
import { canvasReducer } from "../../src/features/block-editor/ui/canvas/model/canvasReducer.ts";
import { createCanvasStateFromLegacy } from "../../src/features/block-editor/ui/canvas/model/migration.ts";
import type { CanvasCell, CanvasState } from "../../src/features/block-editor/ui/canvas/model/types.ts";

const cell = (extra: Partial<LayoutCell> = {}): LayoutCell => ({
  id: "cell", colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 1, blocks: [], ...extra,
});

/** A canvas holding one cell that already carries the full region triple. */
function canvas(): CanvasState {
  return createCanvasStateFromLegacy("layout", { columns: 12, rowHeight: 96, gap: 16 }, [
    cell({ region: "left", stackAt: "mobile", sticky: true }),
  ]);
}

function cellOf(state: CanvasState): CanvasCell {
  const found = state.cells.find((entry) => entry.id === "cell");
  assert.ok(found);
  return found;
}

test("a sticky outside the sidebars stores the region and no sticky key", () => {
  const out = cellOf(canvasReducer(canvas(), { type: "setCellRegion", id: "cell", region: "main", sticky: true }));
  assert.equal(out.region, "main");
  assert.equal("sticky" in out, false);
  assert.equal("stackAt" in out, false);
});

test("a sidebar region with collapse and stick stores all three", () => {
  const out = cellOf(canvasReducer(canvas(), { type: "setCellRegion", id: "cell", region: "left", sticky: true, stackAt: "tablet" }));
  assert.deepEqual({ region: out.region, stackAt: out.stackAt, sticky: out.sticky }, { region: "left", stackAt: "tablet", sticky: true });
});

test("an unknown region erases the stored region and its sticky", () => {
  const out = cellOf(canvasReducer(canvas(), { type: "setCellRegion", id: "cell", region: "bogus" }));
  assert.equal("region" in out, false);
  assert.equal("stackAt" in out, false);
  assert.equal("sticky" in out, false);
});

test("the region change is undoable: undo restores the cell before it", () => {
  const before = canvas().cells;
  const changed = canvasReducer(canvas(), { type: "setCellRegion", id: "cell", region: "main" });
  const undone = canvasReducer(changed, { type: "undo" });
  assert.deepEqual(undone.cells, before);
});
