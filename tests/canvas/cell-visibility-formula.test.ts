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
import { readFile } from "node:fs/promises";
import test, { before } from "node:test";
import { fileURLToPath } from "node:url";

import type { LayoutCell } from "../../src/entities/block/model/types.ts";
import { buildCanvasBlockPatch } from "../../src/features/block-editor/ui/canvas/controller/persistence.ts";
import { createCanvasStateFromLegacy, gridConfigFromLegacy, migrate, unmigrateCanvasCells } from "../../src/features/block-editor/ui/canvas/model/migration.ts";
import { evaluateCellVisibility, toPropertyMap } from "../../src/features/block-editor/ui/canvas/model/visibility.ts";
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
