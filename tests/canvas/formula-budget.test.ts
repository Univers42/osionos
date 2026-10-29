/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   formula-budget.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The formula VM's instruction budget reaches the app through one stable code.
// The engine stops an expensive formula with error_code "budget_exceeded"; the
// bridge turns exactly that one code into one sentinel, and every other
// failure keeps the old "#ENGINE_UNAVAILABLE". The mapping reads the code and
// never the message, so a reworded error message cannot change what a reader
// sees. No wasm is loaded here: the mapping is a pure function.

import assert from "node:assert/strict";
import test from "node:test";

import {
  FORMULA_BUDGET_EXCEEDED,
  FORMULA_ENGINE_UNAVAILABLE,
  surfaceEvalResult,
} from "../../src/shared/notion-database-sys/src/lib/engine/bridge.ts";
import type { EvalResult } from "../../src/shared/notion-database-sys/src/lib/engine/bridgeTypes.ts";

const budgetStop: EvalResult = {
  ok: false,
  error: "Formula budget exceeded: more than 1000000 instructions",
  error_code: "budget_exceeded",
};

test("a budget stop surfaces as the budget sentinel, not as an unavailable engine", () => {
  assert.equal(surfaceEvalResult(budgetStop), FORMULA_BUDGET_EXCEEDED);
  assert.equal(surfaceEvalResult(budgetStop), "#BUDGET_EXCEEDED");
});

test("every other error code keeps the unavailable-engine sentinel", () => {
  for (const code of [
    "stack_overflow",
    "type_error",
    "division_by_zero",
    "property_not_found",
    "function_not_found",
  ]) {
    assert.equal(
      surfaceEvalResult({ ok: false, error: "boom", error_code: code }),
      FORMULA_ENGINE_UNAVAILABLE,
      `code ${code} must not read as a budget stop`,
    );
  }
});

test("an error with no code at all keeps the unavailable-engine sentinel", () => {
  assert.equal(surfaceEvalResult({ ok: false, error: "boom" }), FORMULA_ENGINE_UNAVAILABLE);
  assert.equal(surfaceEvalResult({ ok: false }), FORMULA_ENGINE_UNAVAILABLE);
});

test("the mapping never reads the message — a message that says 'budget' is not a code", () => {
  assert.equal(
    surfaceEvalResult({ ok: false, error: "budget_exceeded" }),
    FORMULA_ENGINE_UNAVAILABLE,
  );
  assert.equal(
    surfaceEvalResult({
      ok: false,
      error: "Formula budget exceeded: more than 1000000 instructions",
    }),
    FORMULA_ENGINE_UNAVAILABLE,
  );
});

test("a successful evaluation returns its value untouched", () => {
  assert.equal(surfaceEvalResult({ ok: true, value: { type: "text", value: "OK!" } }), "OK!");
  assert.equal(surfaceEvalResult({ ok: true, value: { type: "number", value: 2 } }), 2);
  assert.equal(surfaceEvalResult({ ok: true, value: { type: "boolean", value: true } }), true);
  assert.equal(surfaceEvalResult({ ok: true, value: { type: "empty" } }), "");
});

test("the two sentinels are distinct, non-empty, and not the empty-cell marker", () => {
  assert.notEqual(FORMULA_BUDGET_EXCEEDED, FORMULA_ENGINE_UNAVAILABLE);
  assert.notEqual(FORMULA_BUDGET_EXCEEDED, "");
  assert.notEqual(FORMULA_ENGINE_UNAVAILABLE, "");
  // The renderer prints any value that is not '', null or '#ERROR'; a sentinel
  // that collides with one of those would never reach the reader's eye.
  assert.notEqual(FORMULA_BUDGET_EXCEEDED, "#ERROR");
  assert.notEqual(FORMULA_ENGINE_UNAVAILABLE, "#ERROR");
});
