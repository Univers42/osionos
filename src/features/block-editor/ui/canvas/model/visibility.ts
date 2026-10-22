/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   visibility.ts                                      :+:      :+:    :+:   */
/*                                                    +#+#+ +#+        :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * @file visibility.ts — a canvas cell shown or hidden by a formula.
 *
 * The formula is evaluated by the Rust/WASM engine that already backs the
 * database formula columns (the vendored `notion-database-sys` bridge). This
 * module only CALLS that engine; it never re-implements its grammar.
 *
 * The formula's context is the page's own properties, so it never leaves the
 * page and never widens a read rule: the values it sees are the ones the page
 * already shows to every one of its readers.
 */

import {
  FORMULA_ENGINE_UNAVAILABLE,
  evalFormula,
  type PropertyMap,
} from "@/shared/notion-database-sys/src/lib/engine/bridge";

/** The evaluator the helper talks to — the engine bridge by default. */
export type CellVisibilityEvaluator = (formula: string, props: PropertyMap) => unknown;

/**
 * Falsy results hide the cell. Everything else shows it: the formula answers
 * a question, and only a clear "no" hides content.
 */
function isFalsyResult(result: unknown): boolean {
  return result === false || result === 0 || result === "" || result === null || result === undefined;
}

/**
 * Is the cell visible?
 *
 * - no formula → visible;
 * - the engine is unavailable, or the formula does not evaluate → visible.
 *   The package fails OPEN: a cell is never hidden because the engine did not
 *   load or because the author typed a broken formula;
 * - a falsy result (false, 0, "", null) → hidden;
 * - anything else → visible.
 *
 * Pure: the same formula and the same properties always give the same answer,
 * and nothing outside the process is touched.
 */
export function evaluateCellVisibility(
  formula: string | undefined,
  props: PropertyMap,
  evaluate: CellVisibilityEvaluator = evalFormula,
): boolean {
  const source = formula?.trim();
  if (!source) return true;
  const result = evaluate(source, props);
  if (result === FORMULA_ENGINE_UNAVAILABLE) return true;
  return !isFalsyResult(result);
}

/**
 * The page's properties as the engine's context: one entry per property,
 * keyed by the property key — the same lookup the header slots use.
 *
 * The values are handed over as they are; the engine converts them (a string,
 * a number, a boolean, an array for a multi-select).
 */
export function toPropertyMap(properties?: readonly { key: string; value: unknown }[]): PropertyMap {
  const props: PropertyMap = {};
  for (const property of properties ?? []) props[property.key] = property.value;
  return props;
}
