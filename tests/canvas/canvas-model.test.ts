/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   canvas-model.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { canvasReducer } from "../../src/features/block-editor/ui/canvas/model/canvasReducer.ts";
import { frameEquals, framesIntersect, roundFrameForDom, translateFrame } from "../../src/features/block-editor/ui/canvas/model/geometry.ts";
import { createCanvasStateFromLegacy } from "../../src/features/block-editor/ui/canvas/model/migration.ts";
import { snapFrameToCells, screenThresholdToCanvas } from "../../src/features/block-editor/ui/canvas/model/snapping.ts";
import type { CanvasCell } from "../../src/features/block-editor/ui/canvas/model/types.ts";

test("geometry keeps sub-pixel frames until the DOM boundary", () => {
  const frame = { x: 10.25, y: 20.5, width: 120.4, height: 80.6 };

  assert.deepEqual(translateFrame(frame, { x: 0.5, y: 0.25 }), { x: 10.75, y: 20.75, width: 120.4, height: 80.6 });
  assert.deepEqual(roundFrameForDom(frame), { x: 10, y: 21, width: 120, height: 81 });
  assert.equal(framesIntersect(frame, { x: 100, y: 60, width: 80, height: 80 }), true);
  assert.equal(frameEquals(frame, { ...frame, x: 10.2504 }), true);
});

test("snapping converts screen threshold to canvas threshold", () => {
  assert.equal(screenThresholdToCanvas(8, 2), 4);
  assert.equal(screenThresholdToCanvas(8, 0), 800);
});

test("snapping supports edge, center, and equal-spacing guides", () => {
  const cells: CanvasCell[] = [
    cell("left", { x: 0, y: 0, width: 100, height: 100 }, 0),
    cell("right", { x: 300, y: 0, width: 100, height: 100 }, 1),
  ];

  const edge = snapFrameToCells({ x: 99, y: 140, width: 80, height: 80 }, cells, { zoom: 1, thresholdPx: 4 });
  const center = snapFrameToCells({ x: 191, y: 0, width: 20, height: 80 }, cells, { zoom: 1, thresholdPx: 10 });
  const spacing = snapFrameToCells({ x: 162, y: 140, width: 80, height: 80 }, cells, { zoom: 1, thresholdPx: 4 });

  assert.equal(edge.frame.x, 100);
  assert.equal(center.frame.x, 190);
  assert.equal(spacing.frame.x, 160);
  assert.equal(spacing.guides[0].kind, "spacing");
});

test("selection does not auto-promote z order", () => {
  const state = createCanvasStateFromLegacy("layout", { columns: 12, rowHeight: 96, gap: 16 }, []);
  const withCells = canvasReducer(state, { type: "addCell", cell: cell("a", { x: 0, y: 0, width: 100, height: 100 }, 0) });
  const withSecond = canvasReducer(withCells, { type: "addCell", cell: cell("b", { x: 120, y: 0, width: 100, height: 100 }, 10) });
  const selected = canvasReducer(withSecond, { type: "select", ids: ["a"] });

  assert.equal(selected.cells.find((entry) => entry.id === "a")?.z, 0);
  assert.equal(selected.cells.find((entry) => entry.id === "b")?.z, 10);
});

function cell(id: string, frame: CanvasCell["frame"], z: number): CanvasCell {
  return {
    id,
    frame,
    constraints: { horizontal: "min", vertical: "min" },
    sizing: { width: "fixed", height: "fixed" },
    visuals: {},
    blocks: [],
    z,
  };
}
