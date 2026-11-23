/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layout-region-roundtrip-flag-off.test.ts           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// RD9 (groot ADR 0067 D′): the reader half of TD18 is live with the flag off. A canvas
// opened, edited and saved by a live build (MODE production, env unset, tester override
// lost) hands every cell's region/stackAt/sticky back byte-equal (migration.ts:140), so a
// page whose regions were written elsewhere keeps them through a live save.

import assert from "node:assert/strict";
import test from "node:test";

import type { LayoutCell } from "@/entities/block";
import type { CanvasAction, CanvasState } from "@/features/block-editor/ui/canvas/model/types";
import { bakeBuildEnv, setLayoutModesOverride } from "./support/layout-modes-flag.ts";

bakeBuildEnv({ MODE: "production" });

const { canvasReducer } = await import("../../src/features/block-editor/ui/canvas/model/canvasReducer.ts");
const migration = await import("../../src/features/block-editor/ui/canvas/model/migration.ts");
const { isLayoutModesEnabled } = await import("../../src/shared/config/featureFlags.ts");
setLayoutModesOverride("1");

const CONFIG = { columns: 12, rowHeight: 96, gap: 16 };
const SOURCE: LayoutCell[] = [
  { id: "head", colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1, blocks: [], region: "header", stackAt: "never" },
  { id: "side", colStart: 1, colSpan: 3, rowStart: 2, rowSpan: 1, blocks: [], region: "left", stackAt: "tablet", sticky: true },
  { id: "main", colStart: 4, colSpan: 6, rowStart: 2, rowSpan: 1, blocks: [], region: "main" },
  { id: "aside", colStart: 10, colSpan: 3, rowStart: 2, rowSpan: 1, blocks: [], region: "right", stackAt: "mobile", sticky: true },
  { id: "plain", colStart: 1, colSpan: 12, rowStart: 3, rowSpan: 1, blocks: [] },
];

/** Each cell's region triple as the bytes a save writes. */
function triples(cells: LayoutCell[]): Record<string, string> {
  return Object.fromEntries(cells.map((cell) => [cell.id, JSON.stringify([cell.region, cell.stackAt, cell.sticky])]));
}

function saved(state: CanvasState): LayoutCell[] {
  return migration.unmigrateCanvasCells(state.cells, migration.gridConfigFromLegacy(CONFIG));
}

test("the build under test has the flag off", () => {
  assert.equal(isLayoutModesEnabled(), false);
});

test("open then save keeps every region triple byte-equal", () => {
  const state = migration.createCanvasStateFromLegacy("layout", CONFIG, SOURCE);
  assert.deepEqual(triples(saved(state)), triples(SOURCE));
});

test("edits, a refused region write and undo/redo keep every region triple", () => {
  const actions: CanvasAction[] = [
    { type: "updateCell", id: "side", patch: { content: "renamed" } },
    { type: "updateCellFrame", id: "head", frame: { x: 0, y: 0, width: 400, height: 120 } },
    { type: "setCellRegion", id: "aside", region: "footer", stackAt: "never", sticky: false },
    { type: "duplicateCell", id: "main", newId: "main-copy" },
    { type: "undo" },
    { type: "redo" },
  ];
  const state = actions.reduce(canvasReducer, migration.createCanvasStateFromLegacy("layout", CONFIG, SOURCE));
  const out = triples(saved(state));
  assert.deepEqual({ ...out, "main-copy": undefined }, { ...triples(SOURCE), "main-copy": undefined });
  assert.equal(out["main-copy"], out.main);
});
