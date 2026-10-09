/**
 * Camera manipulation: zoom-at-cursor, pan, fit-to-bounds, and the visible world
 * rect (for culling). All pure — return a new Camera, never mutate.
 */

import { clamp } from "../math";
import {
  type Camera,
  MAX_ZOOM,
  MIN_ZOOM,
  type WorldBounds,
  screenToWorld,
} from "./transform";

/** Zoom by `factor` while keeping the world point under (sx, sy) fixed. */
export function zoomAt(camera: Camera, sx: number, sy: number, factor: number): Camera {
  const scale = clamp(camera.scale * factor, MIN_ZOOM, MAX_ZOOM);
  const ratio = scale / camera.scale;
  return { scale, x: sx - (sx - camera.x) * ratio, y: sy - (sy - camera.y) * ratio };
}

export function panBy(camera: Camera, dxScreen: number, dyScreen: number): Camera {
  return { ...camera, x: camera.x + dxScreen, y: camera.y + dyScreen };
}

/** Frame `bounds` within a viewport of `width`×`height` (px), with padding. */
export function fitBounds(
  bounds: WorldBounds,
  width: number,
  height: number,
  padding = 64,
): Camera {
  const worldW = Math.max(1, bounds.maxX - bounds.minX);
  const worldH = Math.max(1, bounds.maxY - bounds.minY);
  const scale = clamp(
    Math.min((width - padding * 2) / worldW, (height - padding * 2) / worldH),
    MIN_ZOOM,
    MAX_ZOOM,
  );
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return { scale, x: width / 2 - centerX * scale, y: height / 2 - centerY * scale };
}

/** The world-space rectangle currently visible in a `width`×`height` viewport. */
export function visibleWorldRect(camera: Camera, width: number, height: number): WorldBounds {
  const topLeft = screenToWorld(camera, 0, 0);
  const bottomRight = screenToWorld(camera, width, height);
  return { minX: topLeft.x, minY: topLeft.y, maxX: bottomRight.x, maxY: bottomRight.y };
}
