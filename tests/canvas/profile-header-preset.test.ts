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

// -- The way BACK: "Remove header canvas" (··· menu) -------------------------

import {
  contentWithoutHeader,
  extractHeaderCanvasContent,
  isRemovableHeader,
  PROFILE_HEADER_COVER_URL,
} from "../../src/entities/block/model/headerCanvas.ts";
import type { Block } from "../../src/entities/block/model/types.ts";

/** A page as the OLD destructive converter left it: one full-page canvas whose
 *  "Content" cell swallowed the original blocks. */
function convertedPage(original: Block[]): Block[] {
  return [{
    id: "canvas-1",
    type: "layout",
    content: "",
    layoutMode: "full_page",
    layoutCells: [
      { id: "c1", label: "Identity", colStart: 1, colSpan: 4, rowStart: 1, rowSpan: 3, blocks: [] },
      { id: "c2", label: "Content", colStart: 1, colSpan: 12, rowStart: 7, rowSpan: 3, blocks: original },
    ],
  } as Block];
}

test("remove header: a converted page gets its Content-cell blocks back", () => {
  const original: Block[] = [
    { id: "p1", type: "paragraph", content: "hello" },
    { id: "p2", type: "heading_2", content: "world" },
  ];
  const page = convertedPage(original);
  assert.equal(isRemovableHeader(page), true);
  assert.deepEqual(contentWithoutHeader(page), original);
});

test("remove header: a header BAND is dropped, the rest of the page stays", () => {
  const page: Block[] = [createHeaderBandBlock(), { id: "p1", type: "paragraph", content: "kept" }];
  assert.equal(isRemovableHeader(page), true);
  const restored = contentWithoutHeader(page);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].content, "kept");
});

test("remove header: a REAL full-page dashboard (no Content cell) is untouchable", () => {
  const dashboard: Block[] = [{
    id: "dash",
    type: "layout",
    content: "",
    layoutMode: "full_page",
    layoutCells: [{ id: "c1", label: "Hero", colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 3, blocks: [] }],
  } as Block];
  assert.equal(extractHeaderCanvasContent(dashboard[0]), null);
  assert.equal(isRemovableHeader(dashboard), false);
});

test("remove header: an emptied Content cell restores to one empty paragraph, never a blank page", () => {
  const restored = contentWithoutHeader(convertedPage([]));
  assert.equal(restored.length, 1);
  assert.equal(restored[0].type, "paragraph");
});

test("remove header: the preset cover constant matches what customize sets", () => {
  assert.equal(PROFILE_HEADER_COVER_URL, PROFILE_HEADER_COVER);
});
