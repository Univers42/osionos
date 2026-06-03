/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   second-brain-camera.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  IDENTITY,
  MAX_ZOOM,
  fitBounds,
  screenToWorld,
  visibleWorldRect,
  worldToScreen,
  zoomAt,
} from "../../src/features/second-brain/render/camera.ts";

test("world↔screen round-trips for any camera", () => {
  const camera = { x: 120, y: -40, scale: 1.75 };
  const screen = worldToScreen(camera, 33, 77);
  const world = screenToWorld(camera, screen.x, screen.y);
  assert.ok(Math.abs(world.x - 33) < 1e-9);
  assert.ok(Math.abs(world.y - 77) < 1e-9);
});

test("zoomAt keeps the world point under the cursor fixed", () => {
  const cursor = { x: 300, y: 200 };
  const before = screenToWorld(IDENTITY, cursor.x, cursor.y);
  const zoomed = zoomAt(IDENTITY, cursor.x, cursor.y, 1.5);
  const after = screenToWorld(zoomed, cursor.x, cursor.y);
  assert.ok(Math.abs(before.x - after.x) < 1e-6);
  assert.ok(Math.abs(before.y - after.y) < 1e-6);
  assert.ok(Math.abs(zoomed.scale - 1.5) < 1e-9);
});

test("zoomAt clamps to the max zoom", () => {
  const zoomed = zoomAt({ x: 0, y: 0, scale: MAX_ZOOM }, 10, 10, 4);
  assert.equal(zoomed.scale, MAX_ZOOM);
});

test("fitBounds centers world bounds in the viewport", () => {
  const camera = fitBounds({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 800, 600, 0);
  const center = worldToScreen(camera, 50, 50);
  assert.ok(Math.abs(center.x - 400) < 1e-6);
  assert.ok(Math.abs(center.y - 300) < 1e-6);
});

test("visibleWorldRect inverts the camera transform", () => {
  const camera = { x: -50, y: -50, scale: 2 };
  const rect = visibleWorldRect(camera, 400, 300);
  assert.deepEqual(rect, { minX: 25, minY: 25, maxX: 225, maxY: 175 });
});
