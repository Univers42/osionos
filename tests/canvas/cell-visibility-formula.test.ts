/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   cell-visibility-formula.test.ts                      :+:      :+:    :+:   */
/*                                                    +#+#+ +#+        :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test, { before } from "node:test";
import { fileURLToPath } from "node:url";

import type { LayoutCell } from "../../src/entities/block/model/types.ts";
import { buildCanvasBlockPatch } from "../../src/features/block-editor/ui/canvas/controller/persistence.ts";
import { createCanvasStateFromLegacy, gridConfigFromLegacy, migrate, unmigrateCanvasCells } from "../../src/features/block-editor/ui/canvas/model/migration.ts";
import { canvasReducer } from "../../src/features/block-editor/ui/canvas/model/canvasReducer.ts";
import { evaluateCellVisibility, filterHiddenCells, filterVisibleCells, resolvePropertyMap, toPropertyMap } from "../../src/features/block-editor/ui/canvas/model/visibility.ts";
import {
  FORMULA_ENGINE_UNAVAILABLE,
  initFormulaEngine,
  isWasmReady,
  validateFormula,
} from "../../src/shared/notion-database-sys/src/lib/engine/bridge.ts";

const LAYOUT_CONFIG = { columns: 12, rowHeight: 96, gap: 16 };

/**
 * The engine's WASM is fetched from a file:// URL, which node's fetch refuses,
 * so the bridge would never boot here. Shim that one scheme and the REAL
 * Rust engine runs — these tests evaluate real formulas, not a stand-in.
 */
before(async () => {
  const originalFetch = globalThis.fetch;
  // The bridge reads the flag the Vite define injects in the browser; in node
  // the identifier is free, so it has to exist before the engine is asked for.
  (globalThis as Record<string, unknown>).__OBJECT_DATABASE_DISABLE_WASM__ = false;
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    if (url.startsWith("file:")) {
      const bytes = await readFile(fileURLToPath(url));
      return new Response(bytes, { headers: { "content-type": "application/wasm" } });
    }
    return originalFetch(input as never);
  }) as typeof fetch;
  try {
    assert.equal(await initFormulaEngine(), true, "the formula engine must boot");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(isWasmReady(), true);
});

function legacyCell(overrides: Partial<LayoutCell> = {}): LayoutCell {
  return {
    id: "cell-1",
    colStart: 1,
    colSpan: 4,
    rowStart: 1,
    rowSpan: 2,
    blocks: [],
    ...overrides,
  };
}

test("a cell whose formula is true is visible, and a false formula hides it", () => {
  assert.equal(evaluateCellVisibility('prop("status") == "active"', { status: "active" }), true);
  assert.equal(evaluateCellVisibility('prop("status") == "active"', { status: "done" }), false);
});

test("a cell without a formula is always visible", () => {
  assert.equal(evaluateCellVisibility(undefined, {}), true);
  assert.equal(evaluateCellVisibility("", {}), true);
  assert.equal(evaluateCellVisibility("   ", {}), true);
});

test("an invalid formula leaves the cell visible, and validateFormula reports the error", () => {
  assert.equal(evaluateCellVisibility('prop("status") == ', { status: "active" }), true);

  const result = validateFormula('prop("status") == ');
  assert.equal(result.ok, false);
  assert.equal(result.errors.length > 0, true);
  assert.equal(typeof result.errors[0].message, "string");
  assert.equal(result.errors[0].message.length > 0, true);
});

test("the engine-unavailable sentinel keeps the cell visible", () => {
  assert.equal(
    evaluateCellVisibility('prop("status") == "active"', { status: "done" }, () => FORMULA_ENGINE_UNAVAILABLE),
    true,
  );
});

test("a falsy result hides the cell even when it is not a boolean", () => {
  assert.equal(evaluateCellVisibility('prop("count")', { count: 0 }), false);
  assert.equal(evaluateCellVisibility('prop("name")', { name: "" }), false);
});

test("a missing property yields undefined and hides the cell (m6)", () => {
  assert.equal(evaluateCellVisibility('prop("missing")', {}), false);
});

test("a null or undefined result hides the cell", () => {
  assert.equal(evaluateCellVisibility("x", {}, () => null), false);
  assert.equal(evaluateCellVisibility("x", {}, () => undefined), false);
  assert.equal(evaluateCellVisibility('prop("x")', { x: null }), false);
  assert.equal(evaluateCellVisibility('prop("x")', { x: undefined }), false);
});

test("the page's own properties are the formula's context", () => {
  const props = toPropertyMap([
    { key: "status", label: "Status", value: "active" },
    { key: "tags", label: "Tags", value: ["alpha", "beta"] },
  ]);

  assert.equal(props.status, "active");
  assert.deepEqual(props.tags, ["alpha", "beta"]);
  assert.equal(evaluateCellVisibility('prop("status") == "active"', props), true);
  assert.equal(evaluateCellVisibility('prop("status") == "active"', toPropertyMap(undefined)), false);
});

test("the visibility formula survives a save/reload round-trip", () => {
  const grid = gridConfigFromLegacy(LAYOUT_CONFIG);
  const migrated = migrate(legacyCell({ visibilityFormula: 'prop("status") == "active"' }), grid);

  assert.equal(migrated.visibilityFormula, 'prop("status") == "active"');

  const legacyCells = unmigrateCanvasCells([migrated], grid);
  assert.equal(legacyCells[0].visibilityFormula, 'prop("status") == "active"');

  const state = createCanvasStateFromLegacy("layout", LAYOUT_CONFIG, [legacyCell({ visibilityFormula: 'prop("status") == "active"' })]);
  const patch = buildCanvasBlockPatch(state);
  assert.equal(patch.layoutCells[0].visibilityFormula, 'prop("status") == "active"');
});

test("an empty or malformed visibility formula means always visible", () => {
  const grid = gridConfigFromLegacy(LAYOUT_CONFIG);
  for (const bad of ["", "   ", 42 as unknown as string, null as unknown as string]) {
    const migrated = migrate(legacyCell({ visibilityFormula: bad }), grid);
    assert.equal(migrated.visibilityFormula, undefined, `formula ${String(bad)}`);
    assert.equal(Object.hasOwn(migrated, "visibilityFormula"), false, `formula ${String(bad)}`);
  }

  const withoutFormula = migrate(legacyCell(), grid);
  assert.equal(Object.hasOwn(withoutFormula, "visibilityFormula"), false);
  assert.equal(evaluateCellVisibility(withoutFormula.visibilityFormula, {}), true);
});

function stateWithFormulas() {
  return createCanvasStateFromLegacy("layout", LAYOUT_CONFIG, [
    legacyCell({ id: "a", visibilityFormula: 'prop("status") == "active"' }),
    legacyCell({ id: "b", colStart: 5, visibilityFormula: 'prop("status") == "active"' }),
    legacyCell({ id: "c", colStart: 9 }),
  ]);
}

test("the render list keeps visible cells and drops hidden ones, the store keeps all", () => {
  const state = stateWithFormulas();
  const done = { status: "done" };
  assert.deepEqual(filterVisibleCells(state.cells, done).map((cell) => cell.id), ["c"]);
  assert.deepEqual(filterHiddenCells(state.cells, done).map((cell) => cell.id), ["a", "b"]);
  assert.equal(state.cells.length, 3);
  assert.deepEqual(filterVisibleCells(state.cells, { status: "active" }).map((cell) => cell.id), ["a", "b", "c"]);
  assert.deepEqual(filterHiddenCells(state.cells, { status: "active" }), []);
});

test("every hidden cell, not only the first, can be selected and have its formula edited", () => {
  let state = stateWithFormulas();
  const hidden = filterHiddenCells(state.cells, { status: "done" });
  assert.equal(hidden.length, 2);
  state = canvasReducer(state, { type: "select", ids: [hidden[1].id] });
  assert.deepEqual(state.selectedIds, ["b"]);
  state = canvasReducer(state, { type: "updateCell", id: "b", patch: { visibilityFormula: "" } });
  assert.equal(filterHiddenCells(state.cells, { status: "done" }).map((cell) => cell.id).join(), "a");
});

test("read-only rendering resolves properties from a list, a map or nothing", () => {
  assert.deepEqual(resolvePropertyMap([{ key: "status", value: "active" }]), { status: "active" });
  assert.deepEqual(resolvePropertyMap({ status: "done" }), { status: "done" });
  assert.deepEqual(resolvePropertyMap(undefined), {});
  const cells = [legacyCell({ id: "x", visibilityFormula: 'prop("status") == "active"' })];
  assert.equal(filterVisibleCells(cells, resolvePropertyMap(undefined)).length, 0);
  assert.equal(filterVisibleCells(cells, resolvePropertyMap([{ key: "status", value: "active" }])).length, 1);
});

// Caveat: source-text guards, not behaviour; they pin that each renderer goes
// through the shared helper and that a hidden cell draws nothing.
const source = (path: string) => readFileSync(fileURLToPath(new URL(`../../src/${path}`, import.meta.url)), "utf8");

test("the stage, the cell and the read-only renderer all honour visibility through the shared helper", () => {
  assert.match(source("features/block-editor/ui/canvas/view/CanvasStage.tsx"), /filterVisibleCells\(orderedCells, propertyMap\)/);
  assert.match(source("features/block-editor/ui/canvas/view/CanvasCellView.tsx"), /if \(!evaluateCellVisibility\(cell\.visibilityFormula, properties\)\) return null;/);
  assert.match(source("entities/block/ui/LayoutBlockReadOnly.tsx"), /filterVisibleCells\(block\.layoutCells/);
  assert.match(source("widgets/page-renderer/ui/PageBlocksRenderer.tsx"), /properties=\{properties\}/);
});
