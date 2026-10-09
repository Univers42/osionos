/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pane-drop-zone.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/01 17:57:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/01 17:57:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Unit tests for the VSCode-style pane drop zone geometry. computeDropZone
// classifies a pointer position into one of 5 regions (center / top / right /
// bottom / left); zoneToSplit maps that to a split direction. If this math
// drifts, pane drag-and-drop silently misplaces splits.

import assert from "node:assert/strict";
import test from "node:test";

import {
  computeDropZone,
  zoneToSplit,
  TAB_DND_MIME,
} from "../../src/widgets/workspace-grid/model/paneDropZone.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a DOMRect-like object. Real DOMRect is a browser API; we only need
 *  the four fields computeDropZone reads. */
function mkRect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

const RECT = mkRect(100, 200, 1000, 800); // a generous pane

// ---------------------------------------------------------------------------
// TAB_DND_MIME constant
// ---------------------------------------------------------------------------

test("TAB_DND_MIME is the expected MIME type", () => {
  assert.equal(TAB_DND_MIME, "application/x-osionos-tab");
});

// ---------------------------------------------------------------------------
// computeDropZone — center region
// ---------------------------------------------------------------------------

test("computeDropZone: dead center → 'center'", () => {
  // center of RECT: (600, 600)
  assert.equal(computeDropZone(600, 600, RECT), "center");
});

test("computeDropZone: just inside the edge threshold → 'center'", () => {
  // Default edge = 0.22. At rx=0.23, distance from left = 0.23 > 0.22 → center.
  const x = RECT.left + RECT.width * 0.23;
  const y = RECT.top + RECT.height * 0.5;
  assert.equal(computeDropZone(x, y, RECT), "center");
});

// ---------------------------------------------------------------------------
// computeDropZone — edge regions
// ---------------------------------------------------------------------------

test("computeDropZone: near left edge → 'left'", () => {
  // rx = 0.05, well within the 0.22 edge threshold
  const x = RECT.left + RECT.width * 0.05;
  const y = RECT.top + RECT.height * 0.5;
  assert.equal(computeDropZone(x, y, RECT), "left");
});

test("computeDropZone: near right edge → 'right'", () => {
  const x = RECT.left + RECT.width * 0.95;
  const y = RECT.top + RECT.height * 0.5;
  assert.equal(computeDropZone(x, y, RECT), "right");
});

test("computeDropZone: near top edge → 'top'", () => {
  const x = RECT.left + RECT.width * 0.5;
  const y = RECT.top + RECT.height * 0.05;
  assert.equal(computeDropZone(x, y, RECT), "top");
});

test("computeDropZone: near bottom edge → 'bottom'", () => {
  const x = RECT.left + RECT.width * 0.5;
  const y = RECT.top + RECT.height * 0.95;
  assert.equal(computeDropZone(x, y, RECT), "bottom");
});

// ---------------------------------------------------------------------------
// computeDropZone — corners (nearest-edge wins)
// ---------------------------------------------------------------------------

test("computeDropZone: top-left corner biased to left → 'left'", () => {
  // rx=0.05, ry=0.10 → left distance (0.05) < top distance (0.10)
  const x = RECT.left + RECT.width * 0.05;
  const y = RECT.top + RECT.height * 0.10;
  assert.equal(computeDropZone(x, y, RECT), "left");
});

test("computeDropZone: top-left corner biased to top → 'top'", () => {
  // rx=0.10, ry=0.05 → top distance (0.05) < left distance (0.10)
  const x = RECT.left + RECT.width * 0.10;
  const y = RECT.top + RECT.height * 0.05;
  assert.equal(computeDropZone(x, y, RECT), "top");
});

test("computeDropZone: bottom-right corner → nearest edge wins", () => {
  // rx=0.97, ry=0.90 → right distance (0.03) < bottom distance (0.10)
  const x = RECT.left + RECT.width * 0.97;
  const y = RECT.top + RECT.height * 0.90;
  assert.equal(computeDropZone(x, y, RECT), "right");
});

// ---------------------------------------------------------------------------
// computeDropZone — custom edge threshold
// ---------------------------------------------------------------------------

test("computeDropZone: custom edge=0.5 makes the entire pane edge zones", () => {
  // With edge=0.5, even the center (0.5, 0.5) has distance 0.5 from every
  // edge, which is NOT > 0.5, so it picks the nearest (left wins on tie).
  const x = RECT.left + RECT.width * 0.5;
  const y = RECT.top + RECT.height * 0.5;
  assert.equal(computeDropZone(x, y, RECT, 0.5), "left");
});

test("computeDropZone: edge=0 makes everything 'center'", () => {
  // nearest is always > 0 (except exactly at corner), so center
  const x = RECT.left + RECT.width * 0.01;
  const y = RECT.top + RECT.height * 0.5;
  assert.equal(computeDropZone(x, y, RECT, 0), "center");
});

// ---------------------------------------------------------------------------
// computeDropZone — degenerate rects
// ---------------------------------------------------------------------------

test("computeDropZone: zero-width rect → rx defaults to 0.5 → center", () => {
  const zeroW = mkRect(100, 200, 0, 800);
  assert.equal(computeDropZone(100, 600, zeroW), "center");
});

test("computeDropZone: zero-height rect → ry defaults to 0.5 → center", () => {
  const zeroH = mkRect(100, 200, 1000, 0);
  assert.equal(computeDropZone(600, 200, zeroH), "center");
});

// ---------------------------------------------------------------------------
// computeDropZone — exact boundary
// ---------------------------------------------------------------------------

test("computeDropZone: pointer exactly at left edge → 'left'", () => {
  // rx = 0, distance from left = 0, which is the minimum and ≤ 0.22
  assert.equal(computeDropZone(RECT.left, RECT.top + RECT.height * 0.5, RECT), "left");
});

test("computeDropZone: pointer exactly at right edge → 'right'", () => {
  // rx = 1, distance from right = 0
  assert.equal(computeDropZone(RECT.left + RECT.width, RECT.top + RECT.height * 0.5, RECT), "right");
});

// ---------------------------------------------------------------------------
// zoneToSplit
// ---------------------------------------------------------------------------

test("zoneToSplit: center → null (no split, merge as tab)", () => {
  assert.equal(zoneToSplit("center"), null);
});

test("zoneToSplit: left → row split, new pane before", () => {
  assert.deepEqual(zoneToSplit("left"), { direction: "row", side: "before" });
});

test("zoneToSplit: right → row split, new pane after", () => {
  assert.deepEqual(zoneToSplit("right"), { direction: "row", side: "after" });
});

test("zoneToSplit: top → column split, new pane before", () => {
  assert.deepEqual(zoneToSplit("top"), { direction: "column", side: "before" });
});

test("zoneToSplit: bottom → column split, new pane after", () => {
  assert.deepEqual(zoneToSplit("bottom"), { direction: "column", side: "after" });
});
