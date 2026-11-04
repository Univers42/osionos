import assert from "node:assert/strict";
import test from "node:test";

import {
  blockWidthStyle,
  resizeLimits,
  resizedBox,
  widthPercentOf,
  type ResizeLimits,
} from "@/shared/lib/dom/blockResize.ts";
import { blockSizeUpdate, keepsWideBleed } from "@/entities/block/model/blockSize.ts";

const LIMITS: ResizeLimits = { minWidth: 240, maxWidth: 800, minHeight: 120, maxHeight: 1600 };
const START = { width: 400, height: 500 };

test("the right edge grows the width by twice the drag: the left edge moves out by the same amount", () => {
  assert.deepEqual(resizedBox(START, "right", { x: 50, y: 0 }, LIMITS), { width: 500, height: 500 });
});

test("the left edge dragged left grows the width symmetrically too", () => {
  assert.deepEqual(resizedBox(START, "left", { x: -50, y: 0 }, LIMITS), { width: 500, height: 500 });
  assert.deepEqual(resizedBox(START, "left", { x: 30, y: 0 }, LIMITS), { width: 340, height: 500 });
});

test("the width is clamped to the minimum and to the column", () => {
  assert.equal(resizedBox(START, "right", { x: -1000, y: 0 }, LIMITS).width, 240);
  assert.equal(resizedBox(START, "left", { x: -1000, y: 0 }, LIMITS).width, 800);
});

test("the bottom edge adds the drag to the height, the top edge subtracts it", () => {
  assert.equal(resizedBox(START, "bottom", { x: 0, y: 40 }, LIMITS).height, 540);
  assert.equal(resizedBox(START, "top", { x: 0, y: -40 }, LIMITS).height, 540);
  assert.equal(resizedBox(START, "top", { x: 0, y: 40 }, LIMITS).height, 460);
});

test("the height is clamped to its range", () => {
  assert.equal(resizedBox(START, "bottom", { x: 0, y: -1000 }, LIMITS).height, 120);
  assert.equal(resizedBox(START, "top", { x: 0, y: -5000 }, LIMITS).height, 1600);
});

test("an edge leaves the other axis alone; a corner moves both", () => {
  assert.deepEqual(resizedBox(START, "bottom", { x: 90, y: 10 }, LIMITS), { width: 400, height: 510 });
  assert.deepEqual(resizedBox(START, "right", { x: 10, y: 90 }, LIMITS), { width: 420, height: 500 });
  assert.deepEqual(resizedBox(START, "top-left", { x: -10, y: -10 }, LIMITS), { width: 420, height: 510 });
  assert.deepEqual(resizedBox(START, "bottom-right", { x: 10, y: 10 }, LIMITS), { width: 420, height: 510 });
});

test("results are whole pixels", () => {
  assert.deepEqual(resizedBox(START, "bottom-right", { x: 10.3, y: 10.6 }, LIMITS), { width: 421, height: 511 });
});

test("the limits never ask for more than the column: a narrow column lowers the minimum", () => {
  assert.deepEqual(resizeLimits({ column: 330, minWidth: 360, minHeight: 120 }), {
    minWidth: 330, maxWidth: 330, minHeight: 120, maxHeight: Infinity,
  });
  assert.equal(resizeLimits({ column: 900, minWidth: 240, minHeight: 0, maxHeight: 1600 }).minWidth, 240);
});

test("widthPercentOf stores a share of the column, to one decimal, inside (0, 100]", () => {
  assert.equal(widthPercentOf(450, 900), 50);
  assert.equal(widthPercentOf(301, 900), 33.4);
  assert.equal(widthPercentOf(1200, 900), 100);
  assert.equal(widthPercentOf(0, 900), 0.1);
  assert.equal(widthPercentOf(200, 0), 100);
});

test("blockWidthStyle centres the block and keeps the minimum without overflowing the column", () => {
  assert.deepEqual(blockWidthStyle(50, 240), { width: "max(240px, 50%)", maxWidth: "100%", marginInline: "auto" });
  assert.deepEqual(blockWidthStyle(undefined, 240), {});
  assert.deepEqual(blockWidthStyle(100, 240), {});
  assert.deepEqual(blockWidthStyle(Number.NaN, 240), {});
});

test("blockSizeUpdate writes only the axes a drag moved, into the block's own height field", () => {
  assert.deepEqual(blockSizeUpdate({ widthPercent: 60 }, "whiteboardHeight"), { mediaWidth: 60 });
  assert.deepEqual(blockSizeUpdate({ height: 400 }, "embedHeight"), { embedHeight: 400 });
  assert.deepEqual(blockSizeUpdate({ widthPercent: 70.5, height: 300 }, "blockHeight"), { mediaWidth: 70.5, blockHeight: 300 });
  assert.deepEqual(blockSizeUpdate({ widthPercent: 50, height: 300 }), { mediaWidth: 50 });
});

test("a table or database keeps its page-edge bleed only while the user has not sized it", () => {
  assert.equal(keepsWideBleed({}), true);
  assert.equal(keepsWideBleed({ mediaWidth: 100 }), true);
  assert.equal(keepsWideBleed({ mediaWidth: 60 }), false);
  assert.equal(keepsWideBleed({ blockHeight: 300 }), false);
});
