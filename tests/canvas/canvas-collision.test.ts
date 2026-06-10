/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   canvas-collision.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { canvasReducer } from "../../src/features/block-editor/ui/canvas/model/canvasReducer.ts";
import { resolveHugDisplacements, resolveOverlapsByPushDown } from "../../src/features/block-editor/ui/canvas/model/collision.ts";
import { nudgeFrames, resizeFrames, CANVAS_CELL_MIN_SIZE } from "../../src/features/block-editor/ui/canvas/model/frameOps.ts";
import { createCanvasStateFromLegacy } from "../../src/features/block-editor/ui/canvas/model/migration.ts";
import { computeScaleX, screenDeltaToFrame, snapFrameToGrid } from "../../src/features/block-editor/ui/canvas/model/resolveLayout.ts";
import type { CanvasCell, CanvasState } from "../../src/features/block-editor/ui/canvas/model/types.ts";

function cell(id: string, frame: CanvasCell["frame"], z = 0, height: CanvasCell["sizing"]["height"] = "fixed"): CanvasCell {
  return {
    id,
    frame,
    constraints: { horizontal: "min", vertical: "min" },
    sizing: { width: "fixed", height },
    visuals: {},
    blocks: [{ id: `${id}-block`, type: "paragraph", content: id }],
    z,
  };
}

function stateWith(cells: CanvasCell[]): CanvasState {
  const base = createCanvasStateFromLegacy("layout", { columns: 12, rowHeight: 96, gap: 16 }, []);
  return { ...base, cells };
}

test("push-down cascades displaced cells in reading order", () => {
  const cells = [
    cell("moved", { x: 0, y: 0, width: 100, height: 100 }),
    cell("under", { x: 0, y: 40, width: 100, height: 100 }),
    cell("below", { x: 0, y: 150, width: 100, height: 100 }),
    cell("aside", { x: 300, y: 0, width: 100, height: 100 }),
  ];
  const displaced = resolveOverlapsByPushDown(cells, new Set(["moved"]), 16);

  assert.equal(displaced.under.y, 116); // pushed below "moved" + gap
  assert.equal(displaced.below.y, 232); // cascaded below the displaced "under"
  assert.equal(displaced.aside, undefined); // untouched neighbour stays put
});

test("hug growth displaces neighbours at render time only", () => {
  const cells = [
    cell("hug", { x: 0, y: 0, width: 100, height: 100 }, 0, "hug"),
    cell("under", { x: 0, y: 116, width: 100, height: 100 }),
  ];
  const grown = resolveHugDisplacements(cells, new Map([["hug", 200]]), 16);
  const idle = resolveHugDisplacements(cells, new Map([["hug", 90]]), 16);

  assert.equal(grown.under.y, 216); // measured 200 + 16 gap
  assert.deepEqual(idle, {}); // content shorter than the frame displaces nothing
});

test("updateCellFrames commits a multi-cell move as one undo step", () => {
  const state = stateWith([
    cell("a", { x: 0, y: 0, width: 100, height: 100 }),
    cell("b", { x: 200, y: 0, width: 100, height: 100 }),
  ]);
  const moved = canvasReducer(state, {
    type: "updateCellFrames",
    frames: {
      a: { x: 0, y: 300, width: 100, height: 100 },
      b: { x: 200, y: 300, width: 100, height: 100 },
    },
  });
  const undone = canvasReducer(moved, { type: "undo" });

  assert.equal(moved.cells.find((entry) => entry.id === "a")?.frame.y, 300);
  assert.equal(moved.history.past.length, state.history.past.length + 1);
  assert.equal(undone.cells.find((entry) => entry.id === "a")?.frame.y, 0);
  assert.equal(undone.cells.find((entry) => entry.id === "b")?.frame.y, 0);
  // Untouched nested blocks survive history round-trips by reference.
  assert.equal(undone.cells.find((entry) => entry.id === "a")?.blocks, state.cells[0].blocks);
});

test("updateCellFrames with resolveCollisions pushes the occupant down", () => {
  const state = stateWith([
    cell("mover", { x: 0, y: 300, width: 100, height: 100 }),
    cell("victim", { x: 0, y: 0, width: 100, height: 100 }),
  ]);
  const next = canvasReducer(state, {
    type: "updateCellFrames",
    frames: { mover: { x: 0, y: 0, width: 100, height: 100 } },
    resolveCollisions: true,
  });

  assert.equal(next.cells.find((entry) => entry.id === "mover")?.frame.y, 0);
  assert.equal(next.cells.find((entry) => entry.id === "victim")?.frame.y, 116);
});

test("frame ops clamp and scale math round-trips", () => {
  const cells = [cell("a", { x: 10, y: 10, width: 100, height: 100 })];
  const nudged = nudgeFrames(cells, new Set(["a"]), -50, 4);
  const shrunk = resizeFrames(cells, new Set(["a"]), -500, -500);

  assert.equal(nudged.a.x, 0); // clamped at the canvas origin
  assert.equal(nudged.a.y, 14);
  assert.equal(shrunk.a.width, CANVAS_CELL_MIN_SIZE);
  assert.equal(shrunk.a.height, CANVAS_CELL_MIN_SIZE);

  const config = { columns: 12, columnWidth: 96, rowHeight: 96, columnGap: 16, rowGap: 16, snapToGrid: true };
  const scaleX = computeScaleX(664, config); // half of the 1328px natural width
  assert.equal(scaleX, 0.5);
  assert.deepEqual(screenDeltaToFrame({ x: 50, y: 20 }, scaleX), { x: 100, y: 20 });

  const snapped = snapFrameToGrid({ x: 230, y: 100, width: 200, height: 100 }, config);
  assert.deepEqual(snapped, { x: 224, y: 112, width: 208, height: 96 }); // col 3, 2-col span
});

test("removeCells and toggleSelect keep selection consistent", () => {
  const state = stateWith([
    cell("a", { x: 0, y: 0, width: 100, height: 100 }),
    cell("b", { x: 200, y: 0, width: 100, height: 100 }),
  ]);
  const selected = canvasReducer(canvasReducer(state, { type: "select", ids: ["a"] }), { type: "toggleSelect", id: "b" });
  const removed = canvasReducer(selected, { type: "removeCells", ids: ["a", "b"] });

  assert.deepEqual(selected.selectedIds, ["a", "b"]);
  assert.deepEqual(removed.cells, []);
  assert.deepEqual(removed.selectedIds, []);
  assert.deepEqual(canvasReducer(removed, { type: "undo" }).cells.map((entry) => entry.id), ["a", "b"]);
});
