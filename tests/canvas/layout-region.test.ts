/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layout-region.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { Block, LayoutCell } from "../../src/entities/block/model/types.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { normalizeRegion, normalizeStackAt, normalizeSticky, regionAttributes } from "../../src/entities/block/model/layoutRegion.ts";
import { gridConfigFromLegacy, migrate, unmigrate } from "../../src/features/block-editor/ui/canvas/model/migration.ts";
import { fileToPage, pageToFile } from "../../src/features/page-file/model/pageFileCodec.ts";
import { serializeBlocksToMarkdown } from "../../src/services/page-actions/pageMarkdownSerialize.ts";
import { parseMarkdownToBlocks } from "../../packages/markdown-engine/markdown/shortcuts.ts";

const cfg = gridConfigFromLegacy({ columns: 12, rowHeight: 96, gap: 16 });
const cell = (extra: Partial<LayoutCell> = {}): LayoutCell => ({
  id: "cell", colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 2, blocks: [], ...extra,
});
const regionCell = (): LayoutCell => cell({ region: "left", stackAt: "mobile", sticky: true });
const layoutBlock = (): Block => ({
  id: "layout", type: "layout", content: "", layoutConfig: { columns: 12, rowHeight: 96, gap: 16 }, layoutCells: [regionCell()],
});
const pageOf = (content: Block[]): PageEntry => ({ _id: "region-page", workspaceId: "ws", title: "Regions", content });

function assertRegionless(out: LayoutCell): void {
  assert.equal("region" in out, false);
  assert.equal("stackAt" in out, false);
  assert.equal("sticky" in out, false);
}

test("normalizeRegion accepts only the five page regions", () => {
  assert.equal(normalizeRegion("left"), "left");
  assert.equal(normalizeRegion("sidebar"), undefined);
  assert.equal(normalizeRegion(1), undefined);
});

test("normalizeStackAt and normalizeSticky accept only their supported values", () => {
  assert.equal(normalizeStackAt("mobile"), "mobile");
  assert.equal(normalizeStackAt("desktop"), undefined);
  assert.equal(normalizeSticky(true, "main"), undefined);
  assert.equal(normalizeSticky(true, "right"), true);
  assert.equal(normalizeSticky("yes", "left"), undefined);
});

test("canvas migration keeps region, stackAt and sticky", () => {
  const out = unmigrate(migrate(regionCell(), cfg), cfg);
  assert.deepEqual({ region: out.region, stackAt: out.stackAt, sticky: out.sticky }, {
    region: "left", stackAt: "mobile", sticky: true,
  });
});

test("canvas migration drops invalid region fields", () => {
  const source = cell({ region: "x", stackAt: "y", sticky: "yes" } as unknown as Partial<LayoutCell>);
  assertRegionless(unmigrate(migrate(source, cfg), cfg));
});

test("canvas migration leaves cells without region fields unchanged", () => {
  const migrated = migrate(cell(), cfg);
  assert.equal("region" in migrated || "stackAt" in migrated || "sticky" in migrated, false);
  assertRegionless(unmigrate(migrated, cfg));
});

test("regionAttributes normalizes DOM data attributes", () => {
  assert.deepEqual(regionAttributes({ region: "left", sticky: true }), {
    "data-region": "left", "data-stack-at": undefined, "data-sticky": "true",
  });
});

test("a layout cell's region fields survive markdown", () => {
  const source = layoutBlock();
  const [out] = parseMarkdownToBlocks(serializeBlocksToMarkdown([source]));
  assert.deepEqual(out.layoutCells, source.layoutCells);
});

test("a one-layout-block page's region fields survive an .omd round trip", () => {
  const source = pageOf([layoutBlock()]);
  const out = fileToPage(pageToFile(source));
  assert.deepEqual(out.content[0]?.layoutCells, source.content?.[0]?.layoutCells);
});
