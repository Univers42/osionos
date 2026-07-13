/**
 * The per-element renderer dispatch, shared by the live engine loop and PNG export
 * so both pick the same renderer (freehand outline / hand-drawn / clean). Not
 * node-tested (needs a 2D context).
 */

import type { FreehandAdapter } from "../freehand/freehandRenderer";
import { type RoughAdapter, ROUGHABLE_TYPES } from "../roughen/roughRenderer";
import type { DrawElement } from "../scene/element";
import { isLinearElement } from "../scene/binding";
import { paintLinear } from "./arrowheads";
import { paintElement, paintFreedraw, paintFreedrawRaw, paintText } from "./paint";

export function renderScene(
  ctx: CanvasRenderingContext2D,
  elements: readonly DrawElement[],
  rough: RoughAdapter | null,
  freehand: FreehandAdapter | null,
  /** Canvas background — painted as a chip behind labels riding a connector. */
  background?: string,
): void {
  const byId = new Map(elements.map((element) => [element.id, element]));
  for (const element of elements) {
    // Linear elements own their tips (arrowheads), so they never go through rough.
    if (element.type === "line" || element.type === "arrow") {
      paintLinear(ctx, element);
      continue;
    }
    if (element.type === "freedraw") {
      if (freehand) paintFreedraw(ctx, element, freehand.outline(element));
      else paintFreedrawRaw(ctx, element);
      continue;
    }
    if (element.type === "text" && element.containerId) {
      const container = byId.get(element.containerId);
      paintText(ctx, element, container && isLinearElement(container) ? background : undefined);
      continue;
    }
    if (rough && element.roughness > 0 && ROUGHABLE_TYPES.has(element.type)) {
      rough.draw(ctx, element);
      continue;
    }
    paintElement(ctx, element);
  }
}
