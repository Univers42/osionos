/**
 * Z-order edits over the live element list (draw order IS the list order).
 * Pure: takes the current order, returns the new one.
 */

import type { DrawElement } from "../scene/element";

export type ZOrderMode = "front" | "back" | "forward" | "backward";

/** Reorder `ids` within `live` per `mode`; relative order inside the selection
 *  is preserved. front/back jump to the extremes; forward/backward step past
 *  ONE unselected neighbour (repeat presses walk the stack one layer a time). */
export function reorderElements(
  live: readonly DrawElement[],
  ids: ReadonlySet<string>,
  mode: ZOrderMode,
): DrawElement[] {
  const selected = live.filter((element) => ids.has(element.id));
  if (selected.length === 0) return [...live];
  const rest = live.filter((element) => !ids.has(element.id));

  if (mode === "front") return [...rest, ...selected];
  if (mode === "back") return [...selected, ...rest];

  const out = [...live];
  if (mode === "forward") {
    // High → low index, so each selected element hops at most one neighbour.
    for (let i = out.length - 2; i >= 0; i -= 1) {
      if (ids.has(out[i].id) && !ids.has(out[i + 1].id)) {
        [out[i], out[i + 1]] = [out[i + 1], out[i]];
      }
    }
  } else {
    for (let i = 1; i < out.length; i += 1) {
      if (ids.has(out[i].id) && !ids.has(out[i - 1].id)) {
        [out[i], out[i - 1]] = [out[i - 1], out[i]];
      }
    }
  }
  return out;
}
