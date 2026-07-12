/* ************************************************************************** */
/*  profile-header-preset.test.ts — "/header" glass dashboard preset          */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  createHeaderCanvasBlock,
  createProfileHeaderCells,
  createProfileHeaderContent,
  PROFILE_HEADER_COVER,
} from "../../src/features/slash-commands/model/profileHeaderPreset.ts";
import { isVideoCoverSource } from "../../src/entities/page/ui/coverMedia.ts";

test("profile header: one full-page layout block with a 12-col config", () => {
  const content = createProfileHeaderContent();
  assert.equal(content.length, 1);
  const layout = content[0];
  assert.equal(layout.type, "layout");
  assert.equal(layout.layoutMode, "full_page");
  assert.equal(layout.layoutConfig?.columns, 12);
  assert.ok((layout.layoutCells?.length ?? 0) >= 4);
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

test("customize-header transform: existing blocks survive in a Content cell", () => {
  const existing = [
    { id: "a", type: "heading_1" as const, content: "Keep me" },
    { id: "b", type: "paragraph" as const, content: "  " }, // blank — dropped
    { id: "c", type: "paragraph" as const, content: "Body text" },
  ];
  const layout = createHeaderCanvasBlock(existing);
  const contentCell = layout.layoutCells?.find((cell) => cell.label === "Content");
  assert.ok(contentCell, "expected a Content cell for existing blocks");
  assert.deepEqual(contentCell?.blocks.map((b) => b.id), ["a", "c"]);
  assert.equal(contentCell?.sizing, "auto-height");
  assert.ok(contentCell!.colStart === 1 && contentCell!.colSpan === 12);
});

test("customize-header transform: an effectively-empty page gets no Content cell", () => {
  const layout = createHeaderCanvasBlock([{ id: "x", type: "paragraph", content: "" }]);
  assert.equal(layout.layoutCells?.some((cell) => cell.label === "Content"), false);
  assert.equal(layout.layoutCells?.length, createProfileHeaderCells().length);
});
