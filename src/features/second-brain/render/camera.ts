/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   camera.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * World ↔ screen transform for the Canvas graph (doc 04 §7). Pure math, shared
 * by culling, hit-testing, and pointer handling. screen = world · scale + offset.
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function worldToScreen(camera: Camera, wx: number, wy: number): { x: number; y: number } {
  return { x: wx * camera.scale + camera.x, y: wy * camera.scale + camera.y };
}

export function screenToWorld(camera: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - camera.x) / camera.scale, y: (sy - camera.y) / camera.scale };
}

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
  padding = 48,
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
