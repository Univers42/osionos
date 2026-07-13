/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   draw-binding.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 17:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 17:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The diagram half of @osionos/draw-engine: connectors (line/arrow), the binding
// that makes them follow the shapes they connect, and the centred label that
// lives inside a shape. All pure — no canvas, no DOM.

import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "../../packages/draw-engine/src/core/scene/element.ts";
import {
  attachPoint,
  bindableAt,
  BINDING_GAP,
  elementCenter,
  isBindableElement,
  isLinearElement,
  layoutLabel,
  linearEndpoints,
  refreshBindings,
} from "../../packages/draw-engine/src/core/scene/binding.ts";
import { hitTestElement } from "../../packages/draw-engine/src/core/scene/geometry.ts";
import { constrainToAngle, isDegenerateLinear, linearFromDrag } from "../../packages/draw-engine/src/core/interaction/linearDrag.ts";
import { isLinearTool } from "../../packages/draw-engine/src/core/interaction/tools.ts";
import { defaultArrowhead } from "../../packages/draw-engine/src/core/render/arrowheads.ts";

const box = (x: number, y: number, w = 100, h = 60) =>
  createElement("rectangle", { x, y, width: w, height: h });

/** A connector from (x1,y1) to (x2,y2) in world space. */
const connector = (x1: number, y1: number, x2: number, y2: number, type: "line" | "arrow" = "arrow") => ({
  ...createElement(type, { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }),
  points: [[0, 0], [x2 - x1, y2 - y1]] as Array<[number, number]>,
});

test("linear tools are line + arrow, and only shapes are bindable", () => {
  assert.equal(isLinearTool("arrow"), true);
  assert.equal(isLinearTool("line"), true);
  assert.equal(isLinearTool("rectangle"), false);

  assert.equal(isLinearElement(connector(0, 0, 10, 10)), true);
  assert.equal(isBindableElement(box(0, 0)), true);
  // An arrow never binds to another arrow — that is what keeps a diagram a graph.
  assert.equal(isBindableElement(connector(0, 0, 10, 10)), false);
});

test("linearFromDrag anchors at the origin and stores a relative endpoint", () => {
  const drag = linearFromDrag(20, 30, 60, 90);
  assert.deepEqual({ x: drag.x, y: drag.y }, { x: 20, y: 30 });
  assert.deepEqual(drag.points, [[0, 0], [40, 60]]);
  assert.equal(isDegenerateLinear(drag.width, drag.height), false);
  // A click without a drag is not a connector.
  const click = linearFromDrag(20, 30, 21, 30);
  assert.equal(isDegenerateLinear(click.width, click.height), true);
});

test("shift snaps a drag to the nearest 45°", () => {
  // ~10° off horizontal snaps flat; ~50° snaps to the diagonal — length preserved.
  const flat = constrainToAngle(100, 17);
  assert.equal(Math.round(flat.dy), 0);
  assert.equal(Math.round(flat.dx), Math.round(Math.hypot(100, 17)));
  const diagonal = constrainToAngle(100, 119);
  assert.equal(Math.round(diagonal.dx), Math.round(diagonal.dy));
  // Shift-constraining a real drag keeps the origin and snaps only the endpoint.
  const snapped = linearFromDrag(0, 0, 100, 17, true);
  assert.equal(Math.round(snapped.height), 0);
});

test("attachPoint lands on the outline, pushed out by the gap", () => {
  const shape = box(0, 0, 100, 60); // centre (50,30), rx 50, ry 30
  // Straight to the right: exits the rect's right edge at x=100, +gap.
  const right = attachPoint(shape, { x: 500, y: 30 });
  assert.equal(Math.round(right.x), 100 + BINDING_GAP);
  assert.equal(Math.round(right.y), 30);
  // Straight up: exits the top edge at y=0, minus the gap.
  const up = attachPoint(shape, { x: 50, y: -500 });
  assert.equal(Math.round(up.y), -BINDING_GAP);

  // An ellipse's outline is its curve, so the horizontal reach is the same rx but
  // a diamond's facet pulls the same direction further in — different families,
  // different attach points.
  const ellipse = { ...shape, type: "ellipse" as const };
  const diamond = { ...shape, type: "diamond" as const };
  const dir = { x: 500, y: 500 };
  assert.ok(attachPoint(diamond, dir).x < attachPoint(ellipse, dir).x);
});

test("bindableAt returns the topmost shape under the point, honouring excludeId", () => {
  const under = box(0, 0);
  const over = box(20, 10);
  const arrow = connector(0, 0, 200, 200);
  const scene = [under, over, arrow];
  assert.equal(bindableAt(scene, 40, 30)?.id, over.id); // last drawn wins
  assert.equal(bindableAt(scene, 40, 30, 0, over.id)?.id, under.id);
  assert.equal(bindableAt(scene, 900, 900), null);
});

test("refreshBindings re-anchors a bound arrow when its shape moves", () => {
  const left = box(0, 0); // centre (50,30)
  const right = box(300, 0); // centre (350,30)
  const arrow = { ...connector(50, 30, 350, 30), startBinding: left.id, endBinding: right.id };

  const [, , bound] = refreshBindings([left, right, arrow]);
  const first = linearEndpoints(bound);
  assert.equal(Math.round(first.start.x), 100 + BINDING_GAP); // left shape's right edge
  assert.equal(Math.round(first.end.x), 300 - BINDING_GAP); // right shape's left edge

  // Move the right shape DOWN: the arrow must follow, without the caller touching
  // its points — that is the whole point of deriving the geometry.
  const moved = { ...right, y: 240 };
  const [, , after] = refreshBindings([left, moved, arrow]);
  const second = linearEndpoints(after);
  assert.ok(second.end.y > first.end.y + 100, "bound end followed the shape");
  assert.ok(second.start.y > first.start.y, "the other tip re-aimed at the new centre");
  // Endpoints stay OUTSIDE the shape they point at (the gap is never crossed).
  assert.equal(hitTestElement(moved, second.end.x, second.end.y, 0), false);
});

test("a binding to a deleted shape is ignored, not crashed on", () => {
  const shape = { ...box(0, 0), isDeleted: true };
  const arrow = { ...connector(50, 30, 350, 30), startBinding: shape.id };
  const [, unchanged] = refreshBindings([shape, arrow]);
  assert.deepEqual(linearEndpoints(unchanged), linearEndpoints(arrow));
});

test("layoutLabel centres a label inside its container", () => {
  const container = box(100, 100, 200, 80);
  const label = { ...createElement("text", { x: 0, y: 0, width: 10, height: 24 }), containerId: container.id };
  const [, placed] = refreshBindings([container, label]);
  assert.equal(placed.y + placed.height / 2, elementCenter(container).y);
  assert.equal(placed.x + placed.width / 2, elementCenter(container).x);
  assert.deepEqual(layoutLabel(label, container), placed);
});

test("a connector is hit on its stroke, not in its bounding box", () => {
  const arrow = connector(0, 0, 200, 200); // the diagonal
  assert.equal(hitTestElement(arrow, 100, 100, 4), true); // on the line
  assert.equal(hitTestElement(arrow, 180, 20, 4), false); // inside the bbox, far from the ink
});

test("an arrow points by default; a line does not", () => {
  const arrow = connector(0, 0, 10, 0, "arrow");
  assert.equal(defaultArrowhead(arrow, "end"), "arrow");
  assert.equal(defaultArrowhead(arrow, "start"), "none");
  assert.equal(defaultArrowhead(connector(0, 0, 10, 0, "line"), "end"), "none");
  // An explicit choice always wins over the default.
  assert.equal(defaultArrowhead({ ...arrow, endArrowhead: "diamond" }, "end"), "diamond");
  assert.equal(defaultArrowhead({ ...arrow, endArrowhead: "none" }, "end"), "none");
});
