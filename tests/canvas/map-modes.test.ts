/* ************************************************************************** */
/*  map-modes.test.ts — pure math for the map display modes                  */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  clusterPoints, aggregateByLocation, bubbleRadius, escapeHtml,
} from "../../src/shared/notion-database-sys/src/components/views/map/mapModes.ts";
import type { MapModePoint } from "../../src/shared/notion-database-sys/src/components/views/map/mapModes.ts";

const pt = (id: string, lat: number, lng: number, weight = 1): MapModePoint =>
  ({ id, lat, lng, weight, title: id });

// Identity-ish projection: 10px per degree.
const project = (lat: number, lng: number) => ({ x: lng * 10, y: lat * 10 });

test("map-modes: near points cluster, far points stay apart", () => {
  const clusters = clusterPoints([pt("a", 1, 1), pt("b", 1.2, 1.2), pt("c", 40, 40)], project, 56);
  assert.equal(clusters.length, 2);
  const big = clusters.find(c => c.items.length === 2)!;
  assert.ok(big, "a+b merged");
  assert.ok(Math.abs(big.lat - 1.1) < 1e-9, "centroid lat");
  assert.equal(clusters.find(c => c.items.length === 1)?.items[0].id, "c");
});

test("map-modes: aggregateByLocation merges identical spots and sums weights", () => {
  const groups = aggregateByLocation([pt("a", 48.85, 2.35, 5), pt("b", 48.85, 2.35, 7), pt("c", 40.71, -74, 2)]);
  assert.equal(groups.length, 2);
  const paris = groups.find(g => g.items.length === 2)!;
  assert.equal(paris.weight, 12, "weights summed");
});

test("map-modes: bubbleRadius scales by sqrt, clamped and zero-safe", () => {
  assert.equal(bubbleRadius(0, 100), 10, "zero weight → min");
  assert.equal(bubbleRadius(100, 100), 36, "max weight → max");
  assert.equal(bubbleRadius(25, 100), 10 + Math.round(26 * 0.5), "sqrt scaling");
  assert.equal(bubbleRadius(5, 0), 10, "maxWeight 0 guarded");
  const r1 = bubbleRadius(10, 100);
  const r2 = bubbleRadius(40, 100);
  assert.ok(r2 > r1, "monotonic");
});

test("map-modes: escapeHtml neutralizes markup and quotes for popup HTML", () => {
  assert.equal(escapeHtml("<img src=x onerror=alert(1)>"), "&lt;img src=x onerror=alert(1)&gt;");
  assert.equal(escapeHtml(`a"b'c&d`), "a&quot;b&#39;c&amp;d");
  assert.equal(escapeHtml("plain title"), "plain title");
});

test("map-modes: aggregation folds -0.000 and 0.000 into one bucket (Greenwich)", () => {
  const groups = aggregateByLocation([pt("a", 51.4779, -0.0004), pt("b", 51.4779, 0.0004)]);
  assert.equal(groups.length, 1, "same rounded coordinate → one bubble");
  assert.equal(groups[0].items.length, 2);
});
