/**
 * World ↔ screen transform for the canvas graph. Pure math, shared by culling,
 * hit-testing, and pointer handling. screen = world · scale + offset.
 */

export interface Camera {
  /** Screen-space offset (px) of world origin. */
  x: number;
  y: number;
  /** Uniform zoom factor. */
  scale: number;
}

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 5;
export const IDENTITY: Camera = { x: 0, y: 0, scale: 1 };

export function worldToScreen(camera: Camera, wx: number, wy: number): { x: number; y: number } {
  return { x: wx * camera.scale + camera.x, y: wy * camera.scale + camera.y };
}

export function screenToWorld(camera: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - camera.x) / camera.scale, y: (sy - camera.y) / camera.scale };
}
