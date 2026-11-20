/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-shell-blocks.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The four "/" page shells: one full-page layout each, its cells named by
// region, the sidebars collapsing on tablet and sticking, and no cell pair
// sharing grid area or leaving the twelve columns.

import assert from "node:assert/strict";
import test from "node:test";

import { PAGE_SHELLS, SECTIONS, buildSection } from "../../src/data/templates/sections/sectionIndex.ts";
import { headerFooterShell, leftSidebarShell, rightSidebarShell, twoSidebarsShell } from "../../src/data/templates/sections/shellSections.ts";
import type { Block, LayoutCell } from "../../src/entities/block/model/types.ts";

const SHELLS: Readonly<Record<string, () => Block[]>> = {
  "shell-two-sidebars": twoSidebarsShell,
  "shell-left-sidebar": leftSidebarShell,
  "shell-right-sidebar": rightSidebarShell,
  "shell-header-footer": headerFooterShell,
};

const REGION_SETS: Readonly<Record<string, string[]>> = {
  "shell-two-sidebars": ["header", "left", "main", "right", "footer"],
  "shell-left-sidebar": ["header", "left", "main", "footer"],
  "shell-right-sidebar": ["header", "main", "right", "footer"],
  "shell-header-footer": ["header", "main", "footer"],
};

/** A block list without its generated ids: the shape two builds share. */
function shape(blocks: Block[]): unknown {
  return blocks.map((block) => ({
    type: block.type,
    content: block.content,
    layoutMode: block.layoutMode,
    layoutConfig: block.layoutConfig,
    cells: (block.layoutCells ?? []).map((cell) => ({
      label: cell.label, region: cell.region, stackAt: cell.stackAt, sticky: cell.sticky,
      colStart: cell.colStart, colSpan: cell.colSpan, rowStart: cell.rowStart, rowSpan: cell.rowSpan,
      blocks: (cell.blocks ?? []).map((inner) => ({ type: inner.type, content: inner.content })),
    })),
  }));
}

/** Every cell inside the 12 columns, and no two cells sharing grid area. */
function assertGridIsClean(cells: LayoutCell[]): void {
  const ranges = cells.map((cell) => ({
    id: cell.id,
    cols: [cell.colStart, cell.colStart + cell.colSpan - 1],
    rows: [cell.rowStart, cell.rowStart + cell.rowSpan - 1],
  }));
  for (const range of ranges) assert.ok(range.cols[0] >= 1 && range.cols[1] <= 12, `${range.id} leaves the columns`);
  for (let left = 0; left < ranges.length; left += 1) {
    for (let right = left + 1; right < ranges.length; right += 1) {
      const a = ranges[left];
      const b = ranges[right];
      const overlaps = a.cols[0] <= b.cols[1] && b.cols[0] <= a.cols[1] && a.rows[0] <= b.rows[1] && b.rows[0] <= a.rows[1];
      assert.equal(overlaps, false, `${a.id} overlaps ${b.id}`);
    }
  }
}

for (const [id, build] of Object.entries(SHELLS)) {
  test(`shell ${id}: one full-page layout, the right regions, clean grid`, () => {
    const blocks = build();
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, "layout");
    assert.equal(blocks[0].layoutMode, "full_page");
    const cells = blocks[0].layoutCells ?? [];
    assert.deepEqual(cells.map((cell) => cell.region).sort(), [...REGION_SETS[id]].sort());
    for (const cell of cells) {
      if (cell.region !== "left" && cell.region !== "right") continue;
      assert.deepEqual({ stackAt: cell.stackAt, sticky: cell.sticky }, { stackAt: "tablet", sticky: true }, cell.id);
    }
    assertGridIsClean(cells);
  });
}

test("buildSection resolves a shell through the section catalogue", async () => {
  const built = await buildSection("shell-two-sidebars");
  assert.ok(built);
  assert.deepEqual(shape(built), shape(twoSidebarsShell()));
});

test("the shells are their own group, never among the sections", () => {
  const sectionIds = new Set(SECTIONS.map((section) => section.id));
  for (const shell of PAGE_SHELLS) assert.ok(!sectionIds.has(shell.id), shell.id);
  assert.deepEqual(PAGE_SHELLS.map((shell) => shell.id), Object.keys(SHELLS));
});
