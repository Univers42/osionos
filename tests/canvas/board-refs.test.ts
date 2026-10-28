import assert from "node:assert/strict";
import test from "node:test";

import {
  isBoardSlug,
  MAX_BOARD_TITLE_LENGTH,
  mintBoardSlug,
  normalizeBoardTitle,
  UNTITLED_BOARD,
} from "../../src/features/whiteboard/model/boardRefs.ts";

test("isBoardSlug accepts only service-shaped slugs", () => {
  assert.equal(isBoardSlug("abc123"), true);
  assert.equal(isBoardSlug("a".repeat(32)), true);
  for (const bad of ["", "abc12", "a".repeat(33), "ABC123", "../../x", '"><script>', "abc 123", undefined, null, 42]) {
    assert.equal(isBoardSlug(bad), false, String(bad));
  }
});

test("mintBoardSlug mints distinct 12-character slugs the bridge accepts", () => {
  const minted = Array.from({ length: 200 }, mintBoardSlug);
  for (const slug of minted) assert.match(slug, /^[a-z0-9]{12}$/);
  assert.equal(new Set(minted).size, minted.length);
});

test("normalizeBoardTitle collapses whitespace and defaults to Untitled", () => {
  assert.equal(normalizeBoardTitle("  Sprint \n  plan  "), "Sprint plan");
  assert.equal(normalizeBoardTitle(""), UNTITLED_BOARD);
  assert.equal(normalizeBoardTitle(" \t\n "), UNTITLED_BOARD);
});

test("normalizeBoardTitle caps at the service limit without a trailing space", () => {
  const out = normalizeBoardTitle(`${"a".repeat(MAX_BOARD_TITLE_LENGTH - 1)} ${"b".repeat(50)}`);
  assert.equal(out.length, MAX_BOARD_TITLE_LENGTH - 1);
  assert.equal(out.endsWith(" "), false);
});
