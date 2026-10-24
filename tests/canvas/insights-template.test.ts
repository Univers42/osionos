/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   insights-template.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P4-5-app: the Insights template binds its cells to sys:my-activity, carries a chart view,
// says "Last 200 events" and explains an empty source. templates.ts itself pulls the browser-only
// seed blob, so the node runner tests the builder module it delegates to.

import assert from "node:assert/strict";
import test from "node:test";

import type { Block, LayoutCell } from "../../src/entities/block/model/types.ts";
import { turnIntoDashboard } from "../../src/services/page-actions/index.ts";
import {
  INSIGHTS_CHART_VIEW_ID,
  INSIGHTS_SOURCE_ID,
  INSIGHTS_TABLE_VIEW_ID,
  createInsightsCells,
} from "../../src/features/block-editor/ui/canvas/model/insightsTemplate.ts";

const sourceBlocks = (cells: LayoutCell[]): Block[] =>
  cells.flatMap((cell) => cell.blocks ?? []).filter((block) => block.type === "database_inline");

test("every data block is bound to sys:my-activity", () => {
  const blocks = sourceBlocks(createInsightsCells());
  assert.equal(blocks.length, 2);
  for (const block of blocks) assert.equal(block.databaseId, INSIGHTS_SOURCE_ID);
});

test("one chart view and one table view are present", () => {
  const viewIds = sourceBlocks(createInsightsCells()).map((block) => block.viewId).sort();
  assert.deepEqual(viewIds, [INSIGHTS_CHART_VIEW_ID, INSIGHTS_TABLE_VIEW_ID].sort());
  assert.ok(INSIGHTS_CHART_VIEW_ID.endsWith("-chart"));
});

test("the titles say the source is the last 200 events, not a time range", () => {
  for (const cell of createInsightsCells()) assert.match(cell.label ?? "", /^Last 200 events/);
});

test("the empty state names the toggle that turns recording on", () => {
  const text = createInsightsCells().flatMap((cell) => cell.blocks ?? []).map((block) => block.content).join("\n");
  assert.match(text, /Record my activity/);
});

test("cell ids are stable and unique, so a second build changes nothing", () => {
  const ids = createInsightsCells().map((cell) => cell.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, createInsightsCells().map((cell) => cell.id));
});

test("turnIntoDashboard accepts the cells without adding or dropping one", () => {
  const cells = createInsightsCells();
  const band = turnIntoDashboard({ _id: "page-1" } as never, cells);
  assert.equal(band.layoutCells?.length, cells.length);
});
