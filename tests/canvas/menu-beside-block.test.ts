// The block menu opens beside its block, never over it, when there is room (#257).

import assert from "node:assert/strict";
import test from "node:test";

import { menuLeftBesideBlock } from "../../src/features/block-editor/model/menuBesideBlock.ts";

const menu = { width: 260, viewportWidth: 1600, margin: 8 };

test("sits right of a centred block", () => {
  assert.equal(menuLeftBesideBlock({ left: 500, right: 1100 }, menu), 1108);
});

test("falls to the left when the right has no room", () => {
  assert.equal(menuLeftBesideBlock({ left: 700, right: 1500 }, menu), 432);
});

test("a block filling the viewport gets the edge with the most room", () => {
  assert.equal(menuLeftBesideBlock({ left: 40, right: 1500 }, menu), 1332);
  assert.equal(menuLeftBesideBlock({ left: 120, right: 1590 }, menu), 8);
});

test("a menu that exactly fits with its gap still sits beside the block", () => {
  assert.equal(menuLeftBesideBlock({ left: 500, right: 1324 }, menu), 1332);
});
