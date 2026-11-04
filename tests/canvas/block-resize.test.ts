import assert from "node:assert/strict";
import test from "node:test";

import {
  BREAKOUT_GUTTER,
  BREAKOUT_BAND_PADDING,
  availableWidth,
  breakoutStyles,
  blockWidthStyle,
  breakoutBox,
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

test("the limits reach past the column to the pane: the minimum still gives way to a narrow column", () => {
  assert.deepEqual(resizeLimits({ column: 708, available: 1054, minWidth: 240, minHeight: 120 }), {
    minWidth: 240, maxWidth: 1054, minHeight: 120, maxHeight: Infinity,
  });
  assert.equal(resizeLimits({ column: 330, available: 276, minWidth: 360, minHeight: 0 }).minWidth, 330);
  // A pane narrower than the column never shrinks what the column already allows.
  assert.equal(resizeLimits({ column: 330, available: 276, minWidth: 100, minHeight: 0 }).maxWidth, 330);
});

test("the pane gives the block its width minus a gutter on each side, never less than zero", () => {
  assert.equal(availableWidth(1118), 1118 - 2 * BREAKOUT_GUTTER);
  assert.equal(availableWidth(40), 0);
});

test("widthPercentOf stores a share of the column to one decimal, above 100 for a block wider than it", () => {
  assert.equal(widthPercentOf(450, 900), 50);
  assert.equal(widthPercentOf(301, 900), 33.4);
  assert.equal(widthPercentOf(1500, 708), 211.9);
  assert.equal(widthPercentOf(0, 900), 0.1);
  assert.equal(widthPercentOf(200, 0), 100);
});

test("breakoutBox centres a block wider than its column on that column, into both margins", () => {
  assert.equal(breakoutBox({ percent: 100, column: 708, available: 1054, minWidth: 240 }), null);
  assert.equal(breakoutBox({ percent: undefined, column: 708, available: 1054, minWidth: 240 }), null);
  assert.deepEqual(breakoutBox({ percent: 150, column: 708, available: 1054, minWidth: 240 }), { width: 1062, offset: 0, scrolls: true });
  assert.deepEqual(breakoutBox({ percent: 140, column: 700, available: 1054, minWidth: 240 }), { width: 980, offset: -140, scrolls: false });
});

test("breakoutBox keeps a stored width the pane cannot hold, and scrolls it instead of clipping", () => {
  // 150 % of a 265 px phone column is 398 px, more than the 276 px the pane offers.
  assert.deepEqual(breakoutBox({ percent: 150, column: 265, available: 276, minWidth: 240 }), { width: 398, offset: 0, scrolls: true });
});

test("blockWidthStyle centres the block and keeps the minimum without overflowing the column", () => {
  assert.deepEqual(blockWidthStyle(50, 240), { width: "max(240px, 50%)", maxWidth: "100%", marginInline: "auto" });
  assert.deepEqual(blockWidthStyle(undefined, 240), {});
  assert.deepEqual(blockWidthStyle(100, 240), {});
  assert.deepEqual(blockWidthStyle(150, 240), {});
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
  assert.equal(keepsWideBleed({ mediaWidth: 140 }), false);
  assert.equal(keepsWideBleed({ blockHeight: 300 }), false);
});

test("a block already wider than the pane may keep its width while dragged: the limit never snaps it smaller", () => {
  assert.equal(resizeLimits({ column: 265, available: 276, current: 398, minWidth: 240, minHeight: 0 }).maxWidth, 398);
});

test("breakoutStyles: up to 100 % is today's CSS, no band", () => {
  assert.deepEqual(breakoutStyles({ percent: 60, minWidth: 240, column: 708, available: 1054 }), {
    frame: { width: "max(240px, 60%)", maxWidth: "100%", marginInline: "auto" }, band: undefined,
  });
  assert.deepEqual(breakoutStyles({ percent: undefined, minWidth: 240, column: 708, available: 1054 }), { frame: {}, band: undefined });
});

test("breakoutStyles: wider than the column, centred on it with negative margins", () => {
  assert.deepEqual(breakoutStyles({ percent: 140, minWidth: 240, column: 700, available: 1054 }), {
    frame: { width: "980px", maxWidth: "none", marginLeft: "-140px", marginRight: "-140px" }, band: undefined,
  });
});

test("breakoutStyles: wider than the pane, a pane-wide band centred on the column scrolls it", () => {
  assert.deepEqual(breakoutStyles({ percent: 150, minWidth: 240, column: 265, available: 276 }), {
    frame: { width: "398px", maxWidth: "none", marginLeft: "0px", marginRight: "0px" },
    band: {
      width: "276px", marginLeft: "-6px", marginRight: "-5px", overflowX: "auto",
      padding: `${BREAKOUT_BAND_PADDING}px`, boxSizing: "border-box",
    },
  });
});

test("breakoutStyles: before the column is measured a wide block falls back to the column", () => {
  assert.deepEqual(breakoutStyles({ percent: 150, minWidth: 240, column: 0, available: 0 }), { frame: {}, band: undefined });
});
