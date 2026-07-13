/**
 * Hand-drawn (roughjs) rendering for the bbox shapes. roughjs is dynamically
 * imported so it never enters the warm chunk — the engine loads the adapter once
 * and repaints. Drawables are cached per element and regenerated only when the
 * element's shape/style changes, so the hand-drawn wobble stays stable during
 * pan/zoom. Not node-tested (needs a canvas).
 */

import type { Drawable, Options } from "roughjs/bin/core";
import type { RoughGenerator } from "roughjs/bin/generator";
import { normalizeRect } from "../scene/geometry";
import type { DrawElement } from "../scene/element";

export interface RoughAdapter {
  draw(ctx: CanvasRenderingContext2D, element: DrawElement): void;
}

/** Shapes roughjs renders today (bbox-defined). Line/arrow join with the points model. */
export const ROUGHABLE_TYPES = new Set<DrawElement["type"]>(["rectangle", "diamond", "ellipse"]);

/** Cache key: everything that changes the generated geometry/style. */
function drawableKey(element: DrawElement): string {
  return [
    element.type,
    Math.round(element.width),
    Math.round(element.height),
    element.seed,
    element.strokeColor,
    element.backgroundColor,
    element.strokeWidth,
    element.roughness,
    element.fillStyle,
  ].join(":");
}

/** Generate the drawable at the ORIGIN (element-local coords). The cache key
 *  excludes x/y, so the drawable itself must not bake them in — the draw call
 *  translates instead. That is what lets a shape MOVE without regenerating
 *  (stable wobble while dragging) — baking absolute coords froze moved shapes
 *  at their old position. */
function buildDrawable(generator: RoughGenerator, element: DrawElement): Drawable {
  const { width, height } = normalizeRect(element.x, element.y, element.width, element.height);
  const filled = element.backgroundColor && element.backgroundColor !== "transparent";
  const options: Options = {
    stroke: element.strokeColor,
    strokeWidth: element.strokeWidth,
    roughness: element.roughness,
    seed: element.seed,
    ...(filled ? { fill: element.backgroundColor, fillStyle: element.fillStyle } : {}),
  };
  if (element.type === "ellipse") return generator.ellipse(width / 2, height / 2, width, height, options);
  if (element.type === "diamond") {
    const points: Array<[number, number]> = [
      [width / 2, 0],
      [width, height / 2],
      [width / 2, height],
      [0, height / 2],
    ];
    return generator.polygon(points, options);
  }
  return generator.rectangle(0, 0, width, height, options);
}

/** Dynamically import roughjs and return an adapter bound to `canvas`. */
export async function loadRoughAdapter(canvas: HTMLCanvasElement): Promise<RoughAdapter> {
  const rough = (await import("roughjs")).default;
  const roughCanvas = rough.canvas(canvas);
  const generator = roughCanvas.generator;
  const cache = new Map<string, { key: string; drawable: Drawable }>();

  return {
    draw(ctx, element) {
      const key = drawableKey(element);
      let entry = cache.get(element.id);
      if (!entry || entry.key !== key) {
        entry = { key, drawable: buildDrawable(generator, element) };
        cache.set(element.id, entry);
      }
      const rect = normalizeRect(element.x, element.y, element.width, element.height);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, element.opacity / 100));
      // The drawable is origin-local: place it, then rotate about its centre.
      ctx.translate(rect.x, rect.y);
      if (element.angle) {
        ctx.translate(rect.width / 2, rect.height / 2);
        ctx.rotate(element.angle);
        ctx.translate(-rect.width / 2, -rect.height / 2);
      }
      roughCanvas.draw(entry.drawable);
      ctx.restore();
    },
  };
}
