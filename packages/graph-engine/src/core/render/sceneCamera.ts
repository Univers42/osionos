/**
 * The scene's camera + viewport: holds the current transform and the canvas size,
 * and wraps the pure camera math (camera/transform + camera/controls) so the
 * CanvasScene façade only has to call a verb and request a redraw. No DOM, no draw
 * loop — just state + transforms, so it is unit-testable on its own.
 */

import { type Camera, IDENTITY, screenToWorld, worldToScreen } from "../camera/transform";
import type { WorldBounds } from "../camera/transform";
import { fitBounds, panBy, zoomAt } from "../camera/controls";

export class SceneCamera {
  camera: Camera = { ...IDENTITY };
  width = 0;
  height = 0;
  dpr = 1;
  /** Crisp resolution when settled; reduced resolution used during motion. */
  qualityDpr = 1;
  interactiveDpr = 1;

  setViewport(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.qualityDpr = Math.min(dpr, 2);
    // Render at ~half resolution during pan/zoom/layout so motion stays smooth on
    // pixel-bound browsers (Firefox especially), then snap crisp the moment it settles.
    this.interactiveDpr = Math.max(1, this.qualityDpr * 0.5);
    this.dpr = this.qualityDpr;
  }

  zoomBy(factor: number): void {
    this.camera = zoomAt(this.camera, this.width / 2, this.height / 2, factor);
  }

  reset(): void {
    this.camera = { ...IDENTITY };
  }

  fit(bounds: WorldBounds | null): void {
    if (bounds) this.camera = fitBounds(bounds, this.width, this.height);
  }

  /** Pan so the given world point lands at the viewport center. */
  centerOnWorld(worldX: number, worldY: number): void {
    const screen = worldToScreen(this.camera, worldX, worldY);
    this.camera = panBy(this.camera, this.width / 2 - screen.x, this.height / 2 - screen.y);
  }

  screenToWorld(x: number, y: number): { x: number; y: number } {
    return screenToWorld(this.camera, x, y);
  }
}
