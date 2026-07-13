/**
 * Line/arrow painting and the arrowhead (extremity) vocabulary a relation diagram
 * needs: plain arrow, filled triangle, dot, diamond, bar — per END, so one
 * connector can read "1 —— * " or "◇—— ▸" like a UML/ERD edge.
 *
 * Pure over a supplied 2D context (the caller has applied the camera transform).
 */

import type { Arrowhead, DrawElement } from "../scene/element";
import { linearEndpoints } from "../scene/binding";

const HEAD_SIZE = 14;
const DASH: Record<DrawElement["strokeStyle"], number[]> = {
  solid: [],
  dashed: [8, 6],
  dotted: [2, 4],
};

/** The default tip for an end when the element doesn't pin one down. */
export function defaultArrowhead(element: DrawElement, end: "start" | "end"): Arrowhead {
  const explicit = end === "start" ? element.startArrowhead : element.endArrowhead;
  if (explicit) return explicit;
  return element.type === "arrow" && end === "end" ? "arrow" : "none";
}

/** How far the shaft must stop short so a solid head isn't drawn over by the line. */
function headInset(kind: Arrowhead, size: number): number {
  if (kind === "triangle" || kind === "diamond") return size * 0.9;
  if (kind === "dot") return size * 0.35;
  return 0;
}

/**
 * Draw one head at `tip`, pointing along `angle` (radians, direction of travel
 * INTO the tip). Stroke-only kinds use the element's stroke; solid kinds fill it.
 */
function paintHead(
  ctx: CanvasRenderingContext2D,
  kind: Arrowhead,
  tipX: number,
  tipY: number,
  angle: number,
  color: string,
  size: number,
): void {
  if (kind === "none") return;
  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(angle);
  ctx.setLineDash([]);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  switch (kind) {
    case "arrow": {
      // Two open barbs — the classic Excalidraw tip.
      const spread = Math.PI / 7;
      ctx.beginPath();
      ctx.moveTo(-size * Math.cos(spread), -size * Math.sin(spread));
      ctx.lineTo(0, 0);
      ctx.lineTo(-size * Math.cos(spread), size * Math.sin(spread));
      ctx.stroke();
      break;
    }
    case "triangle":
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, -size * 0.42);
      ctx.lineTo(-size, size * 0.42);
      ctx.closePath();
      ctx.fill();
      break;
    case "diamond":
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-size * 0.5, -size * 0.42);
      ctx.lineTo(-size, 0);
      ctx.lineTo(-size * 0.5, size * 0.42);
      ctx.closePath();
      ctx.fill();
      break;
    case "dot":
      ctx.beginPath();
      ctx.arc(-size * 0.3, 0, size * 0.32, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "bar":
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.5);
      ctx.lineTo(0, size * 0.5);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/** Paint a 2-point line/arrow: the shaft, then each end's chosen tip. */
export function paintLinear(ctx: CanvasRenderingContext2D, element: DrawElement): void {
  const { start, end } = linearEndpoints(element);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.5) return;

  const ux = dx / length;
  const uy = dy / length;
  const endKind = defaultArrowhead(element, "end");
  const startKind = defaultArrowhead(element, "start");
  const size = Math.max(HEAD_SIZE, element.strokeWidth * 4);

  // Pull the shaft back from any solid tip so the fill stays crisp.
  const startInset = headInset(startKind, size);
  const endInset = headInset(endKind, size);
  const sx = start.x + ux * startInset;
  const sy = start.y + uy * startInset;
  const ex = end.x - ux * endInset;
  const ey = end.y - uy * endInset;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, element.opacity / 100));
  ctx.strokeStyle = element.strokeColor;
  ctx.lineWidth = element.strokeWidth;
  ctx.lineCap = "round";
  ctx.setLineDash(DASH[element.strokeStyle] ?? []);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  const angle = Math.atan2(dy, dx);
  paintHead(ctx, endKind, end.x, end.y, angle, element.strokeColor, size);
  paintHead(ctx, startKind, start.x, start.y, angle + Math.PI, element.strokeColor, size);
  ctx.restore();
}
