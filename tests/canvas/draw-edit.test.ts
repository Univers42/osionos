/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   draw-edit.test.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 11:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 11:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The editing layer of @osionos/draw-engine: clipboard (copy/paste id remap),
// z-order, align/distribute, flip, grouping, object snapping, and aspect-locked
// resize. All pure — no canvas, no DOM.

import assert from "node:assert/strict";
import test from "node:test";

import { createElement, type DrawElement } from "../../packages/draw-engine/src/core/scene/element.ts";
import { materializeElements, serializeSelection } from "../../packages/draw-engine/src/core/edit/clipboard.ts";
import { reorderElements } from "../../packages/draw-engine/src/core/edit/zorder.ts";
import { alignElements, distributeElements } from "../../packages/draw-engine/src/core/edit/align.ts";
import { flipElements } from "../../packages/draw-engine/src/core/edit/flip.ts";
import { expandToGroups, groupPatches, isSingleGroup, ungroupPatches } from "../../packages/draw-engine/src/core/edit/group.ts";
import { snapMove } from "../../packages/draw-engine/src/core/interaction/snapping.ts";
import { resizeElement } from "../../packages/draw-engine/src/core/selection/transform.ts";
import { linearEndpoints } from "../../packages/draw-engine/src/core/scene/binding.ts";

const box = (x: number, y: number, w = 100, h = 60) => createElement("rectangle", { x, y, width: w, height: h });

const arrow = (x1: number, y1: number, x2: number, y2: number): DrawElement => ({
  ...createElement("arrow", { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }),
  points: [[0, 0], [x2 - x1, y2 - y1]],
});

const ids = (...elements: DrawElement[]) => new Set(elements.map((e) => e.id));

test("clipboard: paste remaps every id and keeps intra-selection bindings", () => {
  const a = box(0, 0);
  const b = box(300, 0);
  const link = { ...arrow(100, 30, 300, 30), startBinding: a.id, endBinding: b.id };
  const label = { ...createElement("text", { x: 10, y: 10, width: 40, height: 20 }), text: "hi", containerId: a.id };
  const shapeWithLabel = { ...a, boundTextId: label.id };
  const scene = [shapeWithLabel, b, link, label];

  // Copying the shape pulls its bound label along even though it wasn't selected.
  const json = serializeSelection(scene, ids(shapeWithLabel, b, link));
  assert.ok(json);
  const pasted = materializeElements(json as string, 20, 10, 5);
  assert.ok(pasted);
  const copies = pasted as DrawElement[];
  assert.equal(copies.length, 4);

  const oldIds = new Set(scene.map((e) => e.id));
  for (const copy of copies) {
    assert.equal(oldIds.has(copy.id), false, "every copy has a fresh id");
    assert.equal(copy.version, 1);
    assert.equal(copy.updated, 5);
  }
  const copyA = copies.find((e) => e.boundTextId) as DrawElement;
  const copyLabel = copies.find((e) => e.type === "text") as DrawElement;
  const copyLink = copies.find((e) => e.type === "arrow") as DrawElement;
  assert.equal(copyA.x, shapeWithLabel.x + 20);
  assert.equal(copyLabel.containerId, copyA.id, "label re-bound to the COPIED shape");
  assert.equal(copyA.boundTextId, copyLabel.id);
  assert.equal(copyLink.startBinding, copyA.id, "arrow re-bound within the copied set");
  assert.notEqual(copyLink.endBinding, null);
});

test("clipboard: a binding whose target was not copied is stripped", () => {
  const a = box(0, 0);
  const b = box(300, 0);
  const link = { ...arrow(100, 30, 300, 30), startBinding: a.id, endBinding: b.id };
  const json = serializeSelection([a, b, link], ids(link)); // the arrow alone
  const [copy] = materializeElements(json as string, 0, 0) as DrawElement[];
  assert.equal(copy.startBinding, null);
  assert.equal(copy.endBinding, null);
});

test("clipboard: group ids are remapped to a fresh shared group", () => {
  const g = "group-1";
  const a = { ...box(0, 0), groupId: g };
  const b = { ...box(200, 0), groupId: g };
  const json = serializeSelection([a, b], ids(a, b));
  const copies = materializeElements(json as string, 0, 0) as DrawElement[];
  assert.ok(copies[0].groupId);
  assert.equal(copies[0].groupId, copies[1].groupId, "copies share ONE new group");
  assert.notEqual(copies[0].groupId, g, "…which is not the original group");
});

test("zorder: front/back jump, forward/backward step one layer", () => {
  const [a, b, c] = [box(0, 0), box(10, 0), box(20, 0)];
  const order = (elements: DrawElement[]) => elements.map((e) => [a, b, c].indexOf(e));

  assert.deepEqual(order(reorderElements([a, b, c], ids(a), "front")), [1, 2, 0]);
  assert.deepEqual(order(reorderElements([a, b, c], ids(c), "back")), [2, 0, 1]);
  assert.deepEqual(order(reorderElements([a, b, c], ids(a), "forward")), [1, 0, 2]);
  assert.deepEqual(order(reorderElements([a, b, c], ids(c), "backward")), [0, 2, 1]);
  // A multi-selection moves as a unit, preserving its internal order.
  assert.deepEqual(order(reorderElements([a, b, c], ids(a, b), "forward")), [2, 0, 1]);
  // Already at the top: no change.
  assert.deepEqual(order(reorderElements([a, b, c], ids(c), "forward")), [0, 1, 2]);
});

test("align: elements line up on the selection's own bounds", () => {
  const a = box(0, 0, 100, 60); // left edge 0, centre y 30
  const b = box(300, 200, 50, 20); // left edge 300, centre y 210
  const left = alignElements([a, b], ids(a, b), "left");
  assert.deepEqual(left.map((e) => e.x), [0, 0]);
  const centred = alignElements([a, b], ids(a, b), "centerY");
  const cy = (e: DrawElement) => e.y + e.height / 2;
  assert.equal(cy(centred[0]), cy(centred[1]));
  // A single element (or fewer) has nothing to align against.
  assert.deepEqual(alignElements([a, b], ids(a), "left"), []);
});

test("distribute: centres spread evenly, first and last stay put", () => {
  const a = box(0, 0, 20, 20); // centre 10
  const b = box(30, 0, 20, 20); // centre 40
  const c = box(200, 0, 20, 20); // centre 210
  const spread = distributeElements([a, b, c], ids(a, b, c), "x");
  const centres = spread.map((e) => e.x + e.width / 2).sort((p, q) => p - q);
  assert.deepEqual(centres, [10, 110, 210]);
  assert.deepEqual(distributeElements([a, b], ids(a, b), "x"), [], "needs at least three");
});

test("flip horizontal: bbox mirrors within selection bounds; connector endpoints swap sides", () => {
  const a = box(0, 0, 100, 60);
  const b = box(300, 0, 100, 60); // selection spans x 0..400
  const [fa, fb] = flipElements([a, b], ids(a, b), "horizontal");
  assert.equal(fa.x, 300, "left shape lands on the right");
  assert.equal(fb.x, 0);

  const link = arrow(0, 0, 400, 100);
  const [flipped] = flipElements([link], ids(link), "horizontal");
  const ends = linearEndpoints(flipped);
  assert.equal(ends.start.x, 400, "start swapped to the right edge");
  assert.equal(ends.end.x, 0);
  assert.equal(ends.start.y, 0, "y untouched by a horizontal flip");
});

test("group: hitting one member expands to the whole group; single-group detection", () => {
  const a = box(0, 0);
  const b = box(200, 0);
  const c = box(400, 0);
  const grouped = groupPatches([a, b], ids(a, b), "g1");
  assert.deepEqual(grouped.map((e) => e.groupId), ["g1", "g1"]);

  const scene = [...grouped, c];
  assert.deepEqual([...expandToGroups(scene, [a.id])].sort(), [a.id, b.id].sort());
  assert.deepEqual([...expandToGroups(scene, [c.id])], [c.id], "ungrouped stays alone");

  assert.equal(isSingleGroup(scene, ids(grouped[0], grouped[1])), true);
  assert.equal(isSingleGroup(scene, ids(grouped[0], c)), false);
  const ungrouped = ungroupPatches(scene, ids(grouped[0], grouped[1]));
  assert.deepEqual(ungrouped.map((e) => e.groupId), [null, null]);
});

test("snapMove: magnetises to edges and centres within the threshold, with guides", () => {
  const staticBounds = { minX: 100, minY: 100, maxX: 200, maxY: 200 };
  // Moving box whose left edge is 4px from the static's right edge.
  const near = { minX: 204, minY: 300, maxX: 254, maxY: 340 };
  const hit = snapMove(near, [staticBounds], 6);
  assert.equal(hit.dx, -4, "snapped edge-to-edge");
  assert.equal(hit.guides.length >= 1 && hit.guides[0].axis === "x", true);
  assert.equal(hit.guides[0].at, 200);

  // Beyond the threshold: untouched.
  const far = { minX: 220, minY: 300, maxX: 270, maxY: 340 };
  const miss = snapMove(far, [staticBounds], 6);
  assert.deepEqual([miss.dx, miss.dy, miss.guides.length], [0, 0, 0]);

  // Centre-to-centre snap on y.
  const centre = { minX: 400, minY: 128, maxX: 440, maxY: 168 }; // centre y 148, static centre 150
  const snapped = snapMove(centre, [staticBounds], 6);
  assert.equal(snapped.dy, 2);
});

test("resize with aspect keeps the gesture-start ratio", () => {
  const element = box(0, 0, 100, 50); // ratio 2
  // Drag the SE corner way out horizontally: height must follow at ratio 2.
  const corner = resizeElement(element, "se", 300, 60, 1, 2);
  assert.equal(Math.round(corner.width / corner.height), 2);
  // Edge handle (e): only x is dragged; height derives from the ratio.
  const edge = resizeElement(element, "e", 240, 25, 1, 2);
  assert.equal(Math.round(edge.width), 240);
  assert.equal(Math.round(edge.height), 120);
  // Without aspect, the edge drag leaves height alone.
  const free = resizeElement(element, "e", 240, 25);
  assert.equal(free.height, 50);
});
