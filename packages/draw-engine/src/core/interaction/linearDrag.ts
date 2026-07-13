/**
 * Drag maths for the linear tools (line / arrow). Pure — mirrors shapeDrag.ts,
 * which does the same job for bounding-box shapes.
 */

/** Snap a delta to the nearest 45° ray, keeping its length (Shift-constrain). */
export function constrainToAngle(dx: number, dy: number): { dx: number; dy: number } {
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return { dx: 0, dy: 0 };
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { dx: Math.cos(angle) * length, dy: Math.sin(angle) * length };
}

/**
 * Geometry for a linear element dragged from `start` to `end`. The element's
 * origin IS the first point, so `points` is always [[0,0], [dx,dy]] and the
 * (possibly negative) width/height carry the direction — endpoints stay
 * recoverable without a separate normalise step.
 */
export function linearFromDrag(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  constrain = false,
): { x: number; y: number; width: number; height: number; points: Array<[number, number]> } {
  let dx = endX - startX;
  let dy = endY - startY;
  if (constrain) ({ dx, dy } = constrainToAngle(dx, dy));
  return {
    x: startX,
    y: startY,
    width: dx,
    height: dy,
    points: [
      [0, 0],
      [dx, dy],
    ],
  };
}

/** A drag too short to be a real line (click, not draw). */
export function isDegenerateLinear(width: number, height: number, min = 4): boolean {
  return Math.hypot(width, height) < min;
}
