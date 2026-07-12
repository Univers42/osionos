/* ************************************************************************** */
/*  profile-header-preset.test.ts — "/header" glass dashboard preset          */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  createHeaderBandBlock,
  createProfileHeaderCells,
  createProfileHeaderContent,
  PROFILE_HEADER_COVER,
} from "../../src/features/slash-commands/model/profileHeaderPreset.ts";
import { isVideoCoverSource } from "../../src/entities/page/ui/coverMedia.ts";

test("profile header: a header BAND block on top of a normal page", () => {
  const content = createProfileHeaderContent();
  assert.equal(content.length, 2);
  const [band, body] = content;
  assert.equal(band.type, "layout");
  assert.equal(band.layoutMode, "inline");
  assert.equal(band.layoutRole, "header");
  assert.equal(band.layoutConfig?.preview, true);
  assert.equal(band.layoutConfig?.columns, 12);
  assert.ok((band.layoutCells?.length ?? 0) >= 4);
  assert.equal(body.type, "paragraph");
});

test("profile header cells: glass fills, inside the grid, unique ids", () => {
  const cells = createProfileHeaderCells();
  const ids = new Set<string>();
  for (const cell of cells) {
    assert.equal(cell.backgroundColor, "glass", `cell ${cell.label} must be glass`);
    assert.ok(cell.colStart >= 1 && cell.colStart + cell.colSpan - 1 <= 12, `cell ${cell.label} exceeds 12 cols`);
    assert.ok(cell.rowStart >= 1 && cell.rowSpan >= 1, `cell ${cell.label} bad rows`);
    assert.ok(cell.blocks.length > 0, `cell ${cell.label} has no blocks`);
    assert.ok(!ids.has(cell.id), "duplicate cell id");
    ids.add(cell.id);
  }
});

test("profile header: live database views (chart + timeline) are wired in", () => {
  const cells = createProfileHeaderCells();
  const viewBlocks = cells.flatMap((cell) => cell.blocks.filter((b) => b.type === "database_inline"));
  assert.ok(viewBlocks.length >= 2, "expected chart + timeline live views");
  for (const view of viewBlocks) {
    assert.ok(view.databaseId, "view block missing databaseId");
    assert.ok(view.viewId, "view block missing viewId");
  }
});

test("profile header cover: an https ambient video the cover pipeline plays", () => {
  assert.ok(PROFILE_HEADER_COVER.startsWith("https://"));
  assert.equal(isVideoCoverSource(PROFILE_HEADER_COVER), true);
});

test("header band block: focus flag drives the customize/done toggle", () => {
  assert.equal(createHeaderBandBlock().layoutConfig?.preview, true);
  assert.equal(createHeaderBandBlock({ preview: false }).layoutConfig?.preview, false);
  const band = createHeaderBandBlock();
  assert.equal(band.layoutRole, "header");
  assert.equal(band.layoutMode, "inline");
  assert.equal(band.layoutCells?.length, createProfileHeaderCells().length);
});
