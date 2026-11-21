// The slash menu filters while it is typed into, so its row count changes under the
// pointer. A panel pinned by its bottom edge moves its top edge with every change
// (~255 px for /database), a click aimed at an entry lands outside, and the
// outside-mousedown handler closes the menu with no pick (issue #330). The top edge
// must therefore be a fixed coordinate that does not depend on the row count.

import assert from "node:assert/strict";
import test from "node:test";

import { placeSlashMenu } from "@/features/slash-commands/model/slashMenuPlacement";

const VIEWPORTS: Array<[number, number]> = [[1280, 800], [1920, 1080], [390, 844], [1024, 500]];
const CARET_YS = [30, 120, 260, 400, 520, 700, 780];

function sweep(check: (name: string, width: number, height: number, y: number) => void) {
  for (const [width, height] of VIEWPORTS) {
    for (const y of CARET_YS.filter((caretY) => caretY < height)) check(`${width}x${height} caret y=${y}`, width, height, y);
  }
}

test("the menu and its preview are pinned by their top edge, never by the bottom", () => {
  sweep((name, width, height, y) => {
    const { menu, preview } = placeSlashMenu({ x: 200, y, top: y - 20 }, width, height);
    assert.equal(menu.bottom, undefined, `${name}: menu pinned by bottom`);
    assert.equal(typeof menu.top, "number", `${name}: menu has no top`);
    if (preview) assert.equal(preview.top, menu.top, `${name}: preview top differs from menu top`);
  });
});

test("the full-height panel stays inside the viewport", () => {
  sweep((name, width, height, y) => {
    const { menu } = placeSlashMenu({ x: 200, y, top: y - 20 }, width, height);
    assert.ok(Number(menu.top) >= 0, `${name}: top ${menu.top} is above the viewport`);
    assert.ok(Number(menu.top) + Number(menu.maxHeight) <= height, `${name}: panel runs past the bottom`);
  });
});
