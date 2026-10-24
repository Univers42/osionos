// The cut of a menu's scroll region must land on a row edge, never inside a row.

import assert from "node:assert/strict";
import test from "node:test";

import { snappedHeight, syncScrollCue } from "../../src/shared/lib/dom/wholeRowScroll.ts";

const ROWS = [28, 56, 84, 112, 140, 168];

test("the region ends at the last row that fits whole", () => {
  assert.equal(snappedHeight(ROWS, 100), 84);
  assert.equal(snappedHeight(ROWS, 112), 112);
  assert.equal(snappedHeight(ROWS, 400), 168);
});

test("a first row taller than the limit keeps the limit, as there is no boundary to use", () => {
  assert.equal(snappedHeight([200, 228], 150), 150);
});

test("a region with no rows keeps the limit", () => {
  assert.equal(snappedHeight([], 150), 150);
});

const cue = (scrollTop: number, scrollHeight: number, clientHeight: number) => {
  const attributes = new Set<string>();
  const region = {
    scrollTop,
    scrollHeight,
    clientHeight,
    toggleAttribute: (name: string, on: boolean) => void (on ? attributes.add(name) : attributes.delete(name)),
  };
  syncScrollCue(region as unknown as HTMLElement);
  return [...attributes].sort();
};

test("the cue fades the bottom while rows remain below, and the top once scrolled", () => {
  assert.deepEqual(cue(0, 500, 300), ["data-fade-bottom"]);
  assert.deepEqual(cue(100, 500, 300), ["data-fade-bottom", "data-fade-top"]);
  assert.deepEqual(cue(200, 500, 300), ["data-fade-top"]);
});

test("a region that fits shows no cue, and a sub-pixel remainder counts as the end", () => {
  assert.deepEqual(cue(0, 300, 300), []);
  assert.deepEqual(cue(199.5, 500, 300), ["data-fade-top"]);
});
