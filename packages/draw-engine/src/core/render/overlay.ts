/**
 * Selection + marquee overlay, painted in SCREEN space (after the world pass) so
 * handles stay a constant size at any zoom. Not node-tested (needs a 2D context);
 * the geometry it draws (handles/corners/marquee) is tested in selection/.
 */

import { type Camera, type WorldBounds, worldToScreen } from "../camera/transform";
import type { DrawElement } from "../scene/element";
import { selectionCorners, selectionHandlePoints } from "../selection/handles";

export interface OverlayTheme {
  accent: string;
  handleFill: string;
}

/** Selection box + 8 resize handles + rotate handle for a single element. */
export function paintSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  element: DrawElement,
  rotateGap: number,
  theme: OverlayTheme,
  handlePx: number,
): void {
  ctx.save();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);

  const corners = selectionCorners(element).map((p) => worldToScreen(camera, p.x, p.y));
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i += 1) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.stroke();

  const half = handlePx / 2;
  for (const point of selectionHandlePoints(element, rotateGap)) {
    const s = worldToScreen(camera, point.x, point.y);
    ctx.beginPath();
    if (point.kind === "rotate") {
      ctx.arc(s.x, s.y, half, 0, Math.PI * 2);
    } else {
      ctx.rect(s.x - half, s.y - half, handlePx, handlePx);
    }
    ctx.fillStyle = theme.handleFill;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** A plain dashed box around a multi-selection (no handles). */
export function paintMultiSelectionBox(ctx: CanvasRenderingContext2D, camera: Camera, bounds: WorldBounds, theme: OverlayTheme): void {
  const tl = worldToScreen(camera, bounds.minX, bounds.minY);
  const br = worldToScreen(camera, bounds.maxX, bounds.maxY);
  ctx.save();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  ctx.restore();
}

/** The rubber-band marquee: faint fill + dashed outline. */
export function paintMarquee(ctx: CanvasRenderingContext2D, camera: Camera, rect: WorldBounds, theme: OverlayTheme): void {
  const tl = worldToScreen(camera, rect.minX, rect.minY);
  const br = worldToScreen(camera, rect.maxX, rect.maxY);
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = theme.accent;
  ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  ctx.restore();
}
