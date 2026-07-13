/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   draw-engine.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Phase-0 pure cores of @osionos/draw-engine: camera, element model, scene, and
// geometry/hit-test. Imported by direct `.ts` path (not the barrel) so the react
// adapter + canvas-only engine stay out of the strip-types runner.

import assert from "node:assert/strict";
import test from "node:test";

import { clamp, roundPx } from "../../packages/draw-engine/src/core/math.ts";
import { MAX_ZOOM, MIN_ZOOM, screenToWorld, worldToScreen } from "../../packages/draw-engine/src/core/camera/transform.ts";
import { fitBounds, zoomAt } from "../../packages/draw-engine/src/core/camera/controls.ts";
import { bumpVersion, createElement } from "../../packages/draw-engine/src/core/scene/element.ts";
import { Scene } from "../../packages/draw-engine/src/core/scene/scene.ts";
import { elementBounds, hitTest, hitTestElement, normalizeRect, sceneBounds } from "../../packages/draw-engine/src/core/scene/geometry.ts";
import { isShapeTool, toolForKey } from "../../packages/draw-engine/src/core/interaction/tools.ts";
import { isDegenerateRect, rectFromDrag } from "../../packages/draw-engine/src/core/interaction/shapeDrag.ts";
import { handleLocalPoint, hitHandle, selectionHandlePoints } from "../../packages/draw-engine/src/core/selection/handles.ts";
import { resizeElement, rotateElement } from "../../packages/draw-engine/src/core/selection/transform.ts";
import { elementsInMarquee, marqueeRect } from "../../packages/draw-engine/src/core/selection/marquee.ts";
import { pointsBounds } from "../../packages/draw-engine/src/core/freehand/freehandRenderer.ts";
import { SnapshotHistory } from "../../packages/draw-engine/src/core/history/history.ts";
import { elementsFromJson, sceneToJson } from "../../packages/draw-engine/src/core/export/json.ts";
import { sceneToSvg } from "../../packages/draw-engine/src/core/export/svg.ts";

test("math: clamp + roundPx", () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(roundPx(2.4), 2);
  assert.equal(roundPx(2.6), 3);
});

test("camera: screen↔world round-trips exactly", () => {
  const camera = { x: 120, y: -40, scale: 1.7 };
  for (const [wx, wy] of [[0, 0], [100, 50], [-30, 999]]) {
    const screen = worldToScreen(camera, wx, wy);
    const world = screenToWorld(camera, screen.x, screen.y);
    assert.ok(Math.abs(world.x - wx) < 1e-9);
    assert.ok(Math.abs(world.y - wy) < 1e-9);
  }
});

test("camera: zoomAt keeps the cursor's world point fixed", () => {
  const camera = { x: 0, y: 0, scale: 1 };
  const [sx, sy] = [200, 150];
  const before = screenToWorld(camera, sx, sy);
  const zoomed = zoomAt(camera, sx, sy, 2);
  const after = screenToWorld(zoomed, sx, sy);
  assert.ok(Math.abs(after.x - before.x) < 1e-9);
  assert.ok(Math.abs(after.y - before.y) < 1e-9);
  assert.ok(zoomed.scale > camera.scale);
});

test("camera: zoom clamps to [MIN_ZOOM, MAX_ZOOM]", () => {
  let camera = { x: 0, y: 0, scale: 1 };
  for (let i = 0; i < 100; i += 1) camera = zoomAt(camera, 0, 0, 5);
  assert.ok(camera.scale <= MAX_ZOOM + 1e-9);
  for (let i = 0; i < 200; i += 1) camera = zoomAt(camera, 0, 0, 0.1);
  assert.ok(camera.scale >= MIN_ZOOM - 1e-9);
});

test("camera: fitBounds centers bounds in the viewport", () => {
  const camera = fitBounds({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 800, 600, 0);
  const center = worldToScreen(camera, 50, 50);
  assert.ok(Math.abs(center.x - 400) < 1e-6);
  assert.ok(Math.abs(center.y - 300) < 1e-6);
});

test("element: createElement fills defaults + geometry; bumpVersion is immutable", () => {
  const element = createElement("rectangle", { x: 10, y: 20, width: 30, height: 40 });
  assert.equal(element.type, "rectangle");
  assert.equal(element.x, 10);
  assert.equal(element.width, 30);
  assert.equal(element.opacity, 100);
  assert.equal(element.version, 1);
  assert.equal(element.isDeleted, false);

  const next = bumpVersion(element, { x: 99 }, 5);
  assert.equal(next.x, 99);
  assert.equal(next.version, 2);
  assert.equal(next.updated, 5);
  assert.equal(element.x, 10); // original untouched
});

test("scene: ordered z-order, tombstone remove, bringToFront", () => {
  const a = createElement("rectangle", { x: 0, y: 0, width: 10, height: 10 });
  const b = createElement("ellipse", { x: 20, y: 0, width: 10, height: 10 });
  const scene = new Scene([a, b]);

  assert.equal(scene.size(), 2);
  assert.deepEqual(scene.ordered().map((e) => e.id), [a.id, b.id]);

  scene.bringToFront(a.id);
  assert.deepEqual(scene.ordered().map((e) => e.id), [b.id, a.id]);

  scene.remove(b.id);
  assert.equal(scene.size(), 1);
  assert.equal(scene.get(b.id)?.isDeleted, true); // tombstoned, not dropped
  assert.equal(scene.toArray().length, 2); // snapshot keeps the tombstone
});

test("geometry: normalizeRect flips negative extents", () => {
  assert.deepEqual(normalizeRect(50, 50, -20, -30), { x: 30, y: 20, width: 20, height: 30 });
  assert.deepEqual(elementBounds(createElement("rectangle", { x: 5, y: 5, width: 10, height: 10 })), {
    minX: 5,
    minY: 5,
    maxX: 15,
    maxY: 15,
  });
});

test("geometry: hit-test respects shape geometry", () => {
  const rect = createElement("rectangle", { x: 0, y: 0, width: 100, height: 100 });
  const ellipse = createElement("ellipse", { x: 0, y: 0, width: 100, height: 100 });
  const diamond = createElement("diamond", { x: 0, y: 0, width: 100, height: 100 });

  // (5,5): inside the bbox, but outside the inscribed ellipse/diamond.
  assert.equal(hitTestElement(rect, 5, 5), true);
  assert.equal(hitTestElement(ellipse, 5, 5), false);
  assert.equal(hitTestElement(diamond, 5, 5), false);
  // centre hits all three.
  assert.equal(hitTestElement(ellipse, 50, 50), true);
  assert.equal(hitTestElement(diamond, 50, 50), true);
  // outside the bbox misses.
  assert.equal(hitTestElement(rect, 200, 200), false);
});

test("geometry: hitTest returns the topmost element (last drawn wins)", () => {
  const bottom = createElement("rectangle", { x: 0, y: 0, width: 100, height: 100 });
  const top = createElement("rectangle", { x: 0, y: 0, width: 100, height: 100 });
  assert.equal(hitTest([bottom, top], 50, 50)?.id, top.id);
  assert.equal(hitTest([], 50, 50), null);
});

test("geometry: sceneBounds unions live elements, null when empty", () => {
  const a = createElement("rectangle", { x: 0, y: 0, width: 10, height: 10 });
  const b = createElement("rectangle", { x: 90, y: 40, width: 10, height: 10 });
  assert.deepEqual(sceneBounds([a, b]), { minX: 0, minY: 0, maxX: 100, maxY: 50 });
  assert.equal(sceneBounds([]), null);
});

test("tools: hotkeys map (case-insensitive), unknown → null", () => {
  assert.equal(toolForKey("r"), "rectangle");
  assert.equal(toolForKey("R"), "rectangle");
  assert.equal(toolForKey("v"), "select");
  assert.equal(toolForKey("1"), "select");
  assert.equal(toolForKey("8"), "text");
  assert.equal(toolForKey("e"), "eraser");
  assert.equal(toolForKey("q"), null);
});

test("tools: isShapeTool covers only the bbox shapes", () => {
  assert.equal(isShapeTool("rectangle"), true);
  assert.equal(isShapeTool("ellipse"), true);
  assert.equal(isShapeTool("diamond"), true);
  assert.equal(isShapeTool("arrow"), false);
  assert.equal(isShapeTool("select"), false);
  assert.equal(isShapeTool("text"), false);
});

test("shapeDrag: rectFromDrag handles forward, reverse, and 1:1-locked drags", () => {
  assert.deepEqual(rectFromDrag(10, 10, 40, 30), { x: 10, y: 10, width: 30, height: 20 });
  // reverse drag (end above-left of start) normalises to a positive box.
  assert.deepEqual(rectFromDrag(40, 30, 10, 10), { x: 10, y: 10, width: 30, height: 20 });
  // square lock takes the larger extent for both sides, preserving direction.
  assert.deepEqual(rectFromDrag(0, 0, 30, 10, true), { x: 0, y: 0, width: 30, height: 30 });
  assert.deepEqual(rectFromDrag(0, 0, -10, -30, true), { x: -30, y: -30, width: 30, height: 30 });
});

test("shapeDrag: isDegenerateRect flags click-sized drags", () => {
  assert.equal(isDegenerateRect({ x: 0, y: 0, width: 1, height: 1 }), true);
  assert.equal(isDegenerateRect({ x: 0, y: 0, width: 40, height: 1 }), false);
  assert.equal(isDegenerateRect({ x: 0, y: 0, width: 40, height: 30 }), false);
});

/** World position of a resize handle, mirroring selection/handles for the test. */
function handleWorld(el: { x: number; y: number; width: number; height: number; angle: number }, kind: string): { x: number; y: number } {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const local = handleLocalPoint(kind as never, el.width / 2, el.height / 2);
  const c = Math.cos(el.angle);
  const s = Math.sin(el.angle);
  return { x: cx + (local.x * c - local.y * s), y: cy + (local.x * s + local.y * c) };
}

test("handles: local offsets + 9 handle points for an axis-aligned element", () => {
  assert.deepEqual(handleLocalPoint("nw", 50, 30), { x: -50, y: -30 });
  assert.deepEqual(handleLocalPoint("se", 50, 30), { x: 50, y: 30 });
  assert.deepEqual(handleLocalPoint("n", 50, 30), { x: 0, y: -30 });
  const el = createElement("rectangle", { x: 0, y: 0, width: 100, height: 60 });
  const points = selectionHandlePoints(el, 20);
  assert.equal(points.length, 9);
  const se = points.find((p) => p.kind === "se");
  assert.deepEqual({ x: se?.x, y: se?.y }, { x: 100, y: 60 });
  const rotate = points.find((p) => p.kind === "rotate");
  assert.deepEqual({ x: rotate?.x, y: rotate?.y }, { x: 50, y: -20 }); // above the top edge
});

test("handles: hitHandle finds the nearby handle, null when far", () => {
  const el = createElement("rectangle", { x: 0, y: 0, width: 100, height: 60 });
  const points = selectionHandlePoints(el, 20);
  assert.equal(hitHandle(points, 100, 60, 6), "se");
  assert.equal(hitHandle(points, 50, -20, 6), "rotate");
  assert.equal(hitHandle(points, 50, 30, 6), null); // centre hits no handle
});

test("transform: resize an axis-aligned element keeps the opposite corner fixed", () => {
  const el = createElement("rectangle", { x: 0, y: 0, width: 100, height: 60 });
  const geom = resizeElement(el, "se", 150, 90);
  assert.deepEqual(geom, { x: 0, y: 0, width: 150, height: 90 });
});

test("transform: resize a ROTATED element keeps the opposite handle world-fixed", () => {
  const el = { ...createElement("rectangle", { x: 0, y: 0, width: 100, height: 60 }), angle: Math.PI / 6 };
  const before = handleWorld(el, "nw"); // anchor opposite the dragged "se"
  const next = { ...el, ...resizeElement(el, "se", 200, 140) };
  const after = handleWorld(next, "nw");
  assert.ok(Math.abs(after.x - before.x) < 1e-9, `anchor x drifted: ${before.x} → ${after.x}`);
  assert.ok(Math.abs(after.y - before.y) < 1e-9, `anchor y drifted: ${before.y} → ${after.y}`);
});

test("transform: resize clamps to minSize", () => {
  const el = createElement("rectangle", { x: 0, y: 0, width: 100, height: 60 });
  const geom = resizeElement(el, "se", 0, 0, 1); // drag onto the anchor
  assert.ok(geom.width >= 1 && geom.height >= 1);
});

test("transform: rotate handle above centre = 0, to the right = +90°", () => {
  const el = createElement("rectangle", { x: 0, y: 0, width: 100, height: 60 });
  assert.ok(Math.abs(rotateElement(el, 50, -100) - 0) < 1e-9); // straight up
  assert.ok(Math.abs(rotateElement(el, 150, 30) - Math.PI / 2) < 1e-9); // to the right
});

test("marquee: rect normalises + selects overlapping elements only", () => {
  assert.deepEqual(marqueeRect(40, 60, 10, 20), { minX: 10, minY: 20, maxX: 40, maxY: 60 });
  const a = createElement("rectangle", { x: 0, y: 0, width: 20, height: 20 });
  const b = createElement("rectangle", { x: 200, y: 200, width: 20, height: 20 });
  const inside = elementsInMarquee([a, b], marqueeRect(-5, -5, 50, 50));
  assert.deepEqual(inside, [a.id]);
  assert.deepEqual(elementsInMarquee([a, b], marqueeRect(500, 500, 600, 600)), []);
});

test("freehand: pointsBounds computes the local bounding box", () => {
  assert.deepEqual(pointsBounds([[0, 0], [10, -4], [6, 8]]), [0, -4, 10, 8]);
  assert.deepEqual(pointsBounds([]), [0, 0, 0, 0]);
});

test("history: undo/redo, signature dedupe, and redo-branch truncation", () => {
  const history = new SnapshotHistory<number[]>([], (value) => value.join(","));
  history.push([1]);
  history.push([1, 2]);
  assert.equal(history.canUndo(), true);
  assert.equal(history.canRedo(), false);

  assert.deepEqual(history.undo(), [1]);
  assert.deepEqual(history.undo(), []);
  assert.equal(history.undo(), null); // already at the start
  assert.deepEqual(history.redo(), [1]);

  history.push([1, 2, 3]); // pushing after an undo drops the redo branch
  assert.equal(history.canRedo(), false);
  assert.deepEqual(history.undo(), [1]);

  history.redo(); // back to [1,2,3]
  history.push([1, 2, 3]); // equal snapshot → no-op (no empty redo step)
  assert.equal(history.canRedo(), false);
});

test("export json: round-trips through the osidraw envelope, rejects other input", () => {
  const rect = createElement("rectangle", { x: 0, y: 0, width: 10, height: 10 });
  const json = sceneToJson([rect]);
  assert.match(json, /"type": "osidraw"/);
  const back = elementsFromJson(json);
  assert.equal(back?.length, 1);
  assert.equal(back?.[0].id, rect.id);
  assert.equal(elementsFromJson("not json"), null);
  assert.equal(elementsFromJson('{"type":"other"}'), null);
});

test("export json: drops tombstoned elements", () => {
  const a = createElement("rectangle", { x: 0, y: 0, width: 10, height: 10 });
  const b = { ...createElement("ellipse", { x: 0, y: 0, width: 10, height: 10 }), isDeleted: true };
  assert.equal(elementsFromJson(sceneToJson([a, b]))?.length, 1);
});

test("export svg: emits an <svg> with a primitive per element", () => {
  const rect = createElement("rectangle", { x: 0, y: 0, width: 40, height: 20 });
  const ellipse = createElement("ellipse", { x: 100, y: 0, width: 40, height: 20 });
  const svg = sceneToSvg([rect, ellipse], { minX: 0, minY: 0, maxX: 140, maxY: 20 }, 8, "#ffffff");
  assert.match(svg, /^<svg /);
  assert.match(svg, /<rect /);
  assert.match(svg, /<ellipse /);
  assert.ok(svg.includes("</svg>"));
});
