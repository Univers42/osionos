// VirtualWindow is the one component that calls TanStack's useVirtualizer, so the React
// Compiler skips only it and still compiles its callers (osionos#337). This pins the frame it
// hands its render prop. Server rendering runs no layout effect, so the viewport comes from
// `initialRect`; the scrollToIndex handle needs a mounted DOM and is not covered here.
import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { VirtualWindow } = await import("../../src/shared/ui/virtual-window/VirtualWindow.tsx");

type Frame = Parameters<React.ComponentProps<typeof VirtualWindow>["children"]>[0];

const ROW = 10;
const VIEWPORT = { width: 100, height: 100 };

function capture(props: Partial<React.ComponentProps<typeof VirtualWindow>>): { frame: Frame; html: string } {
  let frame: Frame | null = null;
  const html = renderToStaticMarkup(
    React.createElement(VirtualWindow, {
      count: 1000,
      getScrollElement: () => null,
      estimateSize: () => ROW,
      overscan: 2,
      initialRect: VIEWPORT,
      ...props,
      children: (next: Frame) => {
        frame = next;
        return React.createElement(
          "ul",
          { style: { height: next.totalSize } },
          next.items.map((item) => React.createElement("li", { key: item.key, "data-index": item.index }, String(item.key))),
        );
      },
    }),
  );
  assert.ok(frame, "the render prop was called");
  return { frame, html };
}

test("renders only the items inside the viewport plus the overscan", () => {
  const { frame, html } = capture({});
  const indexes = frame.items.map((item) => item.index);
  assert.equal(indexes[0], 0);
  assert.ok(indexes.length > VIEWPORT.height / ROW && indexes.length <= VIEWPORT.height / ROW + 3, `got ${indexes.length}`);
  assert.deepEqual(indexes, indexes.map((_, position) => position));
  assert.equal((html.match(/<li /g) ?? []).length, indexes.length);
});

test("sizes the window for every item, not only the rendered ones", () => {
  const { frame, html } = capture({});
  assert.equal(frame.totalSize, 1000 * ROW);
  assert.match(html, /height:10000px/);
});

test("passes each item's index, start and the caller's key", () => {
  const { frame } = capture({ getItemKey: (index: number) => `block-${index}` });
  frame.items.forEach((item, position) => {
    assert.equal(item.index, position);
    assert.equal(item.key, `block-${position}`);
    assert.equal(item.start, position * ROW);
    assert.equal(item.size, ROW);
  });
});

test("a range extractor can keep an item outside the window mounted", () => {
  const { frame } = capture({ rangeExtractor: ({ startIndex, endIndex }) => [startIndex, endIndex, 500] });
  assert.deepEqual(frame.items.map((item) => item.index).slice(-1), [500]);
});

test("scrollMargin shifts the starts and is taken off the total size", () => {
  const { frame } = capture({ scrollMargin: 40 });
  assert.equal(frame.items[0].start, 40);
  assert.equal(frame.totalSize, 1000 * ROW);
});

test("count 0 renders the caller's markup with no items", () => {
  const { frame } = capture({ count: 0 });
  assert.deepEqual(frame.items, []);
  assert.equal(frame.totalSize, 0);
});

test("hands out the virtualizer's measureElement as a ref callback", () => {
  const { frame } = capture({});
  assert.equal(typeof frame.measureElement, "function");
  assert.doesNotThrow(() => frame.measureElement(null));
});
