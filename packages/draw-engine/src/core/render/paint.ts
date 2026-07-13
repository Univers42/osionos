/**
 * Canvas2D painting: background, grid, and the geometric shape pass. Pure over a
 * supplied 2D context — takes elements + theme, draws, returns nothing. The
 * hand-drawn (roughjs) and freehand (perfect-freehand) passes swap in at this
 * boundary in Phase 1; Phase 0 is clean geometry.
 *
 * Not node-tested (needs a real 2D context); the geometry it relies on is tested
 * in scene/geometry.ts.
 */

import type { Camera } from "../camera/transform";
import type { DrawElement } from "../scene/element";
import { normalizeRect } from "../scene/geometry";

/** Neutral canvas chrome. The app resolves `--osio-*` tokens and passes these;
 *  element ink is explicit per element, never themed. `accent` colors the
 *  selection box + handles. */
export interface DrawTheme {
  background: string;
  grid: string;
  accent: string;
}

export const LIGHT_THEME: DrawTheme = { background: "#ffffff", grid: "rgba(17, 17, 17, 0.06)", accent: "#4c6ef5" };
export const DARK_THEME: DrawTheme = { background: "#191919", grid: "rgba(255, 255, 255, 0.06)", accent: "#748ffc" };

const DASH: Record<DrawElement["strokeStyle"], number[]> = {
  solid: [],
  dashed: [8, 6],
  dotted: [2, 4],
};

export function paintBackground(ctx: CanvasRenderingContext2D, theme: DrawTheme, width: number, height: number): void {
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);
}

/** A single-path line grid in screen space. One stroke; skips when too dense. */
export function paintGrid(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number, theme: DrawTheme): void {
  const step = 40 * camera.scale;
  if (step < 6) return;
  ctx.save();
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = camera.x % step; x < width; x += step) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
  }
  for (let y = camera.y % step; y < height; y += step) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(width, Math.round(y) + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

function traceShape(ctx: CanvasRenderingContext2D, element: DrawElement, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  switch (element.type) {
    case "ellipse":
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case "diamond":
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x, y + h / 2);
      ctx.closePath();
      break;
    default: {
      const r = element.roundness ?? 0;
      if (r > 0 && typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
      else ctx.rect(x, y, w, h);
    }
  }
}

/** Line-height multiple for text elements (shared by render + measurement). */
export const TEXT_LINE_HEIGHT = 1.25;

/** Draw a text element (top-left anchored, multi-line). `backdrop` paints a
 *  canvas-coloured chip behind it — a label riding a connector needs one, or the
 *  line strikes straight through the words. */
export function paintText(ctx: CanvasRenderingContext2D, element: DrawElement, backdrop?: string): void {
  const text = element.text ?? "";
  if (!text) return;
  const fontSize = element.fontSize ?? 20;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, element.opacity / 100));
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textBaseline = "top";
  if (element.angle) {
    const cx = element.x + element.width / 2;
    const cy = element.y + element.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(element.angle);
    ctx.translate(-cx, -cy);
  }
  if (backdrop) {
    ctx.fillStyle = backdrop;
    ctx.fillRect(element.x - 4, element.y - 2, element.width + 8, element.height + 4);
  }
  ctx.fillStyle = element.strokeColor;
  const lineHeight = fontSize * TEXT_LINE_HEIGHT;
  const lines = text.split("\n");
  // A label bound inside a shape is centred in it; a free text element is
  // top-left anchored where the user clicked.
  const centred = Boolean(element.containerId);
  ctx.textAlign = centred ? "center" : "left";
  const originX = centred ? element.x + element.width / 2 : element.x;
  for (let i = 0; i < lines.length; i += 1) ctx.fillText(lines[i], originX, element.y + i * lineHeight);
  ctx.restore();
}

/** Draw one element in world space (the caller has applied the camera transform). */
export function paintElement(ctx: CanvasRenderingContext2D, element: DrawElement): void {
  if (element.type === "text") {
    paintText(ctx, element);
    return;
  }
  const { x, y, width, height } = normalizeRect(element.x, element.y, element.width, element.height);
  if (width === 0 && height === 0) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, element.opacity / 100));
  if (element.angle) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(element.angle);
    ctx.translate(-cx, -cy);
  }
  traceShape(ctx, element, x, y, width, height);
  if (element.backgroundColor && element.backgroundColor !== "transparent") {
    ctx.fillStyle = element.backgroundColor;
    ctx.fill();
  }
  ctx.lineWidth = element.strokeWidth;
  ctx.strokeStyle = element.strokeColor;
  ctx.lineJoin = "round";
  ctx.setLineDash(DASH[element.strokeStyle] ?? []);
  ctx.stroke();
  ctx.restore();
}

export function paintScene(ctx: CanvasRenderingContext2D, elements: readonly DrawElement[]): void {
  for (const element of elements) paintElement(ctx, element);
}

/** Fill a perfect-freehand outline polygon (element-local points → world). */
export function paintFreedraw(ctx: CanvasRenderingContext2D, element: DrawElement, outline: number[][]): void {
  if (outline.length < 2) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, element.opacity / 100));
  ctx.fillStyle = element.strokeColor;
  ctx.translate(element.x, element.y);
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i += 1) ctx.lineTo(outline[i][0], outline[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Plain round-joined polyline for a freedraw before perfect-freehand loads. */
export function paintFreedrawRaw(ctx: CanvasRenderingContext2D, element: DrawElement): void {
  const points = element.points ?? [];
  if (points.length < 2) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, element.opacity / 100));
  ctx.strokeStyle = element.strokeColor;
  ctx.lineWidth = element.strokeWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.translate(element.x, element.y);
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.stroke();
  ctx.restore();
}
