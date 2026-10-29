/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-actions-turn-into-dashboard.test.ts           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { Block, LayoutCell } from "../../src/entities/block/model/types.ts";
import {
  PAGE_ACTION_NAMES,
  canTurnIntoDashboard,
  turnIntoDashboard,
  turnIntoDashboardContent,
  type PageActionName,
} from "../../src/services/page-actions/index.ts";
import { createViewShowcaseCells } from "../../src/widgets/database-view/model/databaseViewShowcase.ts";

/** The dashboard template (createViewShowcaseCells): a command-center hero + 12 view cells. */
const TEMPLATE_CELL_COUNT = 13;

function cell(id: string, label: string): LayoutCell {
  return {
    id,
    colStart: 1,
    colSpan: 4,
    rowStart: 1,
    rowSpan: 2,
    label,
    blocks: [],
  };
}

function paragraph(id: string, content: string): Block {
  return { id, type: "paragraph", content };
}

function headerBand(id: string): Block {
  return {
    id,
    type: "layout",
    content: "",
    layoutMode: "inline",
    layoutRole: "header",
    layoutCells: [cell(`${id}-cell`, "Old band")],
  };
}

function page(content: Block[]): { _id: string; title: string; workspaceId: string; content: Block[] } {
  return { _id: "page-1", title: "Ops", workspaceId: "ws-1", content };
}

function templateCells(): LayoutCell[] {
  return Array.from({ length: TEMPLATE_CELL_COUNT }, (_, index) => cell(`c${index}`, `Cell ${index}`));
}

test("the dashboard is one full-page layout band carrying the template's cells", () => {
  const cells = templateCells();
  const band = turnIntoDashboard(page([]), cells);

  assert.equal(band.type, "layout");
  assert.equal(band.layoutMode, "full_page");
  assert.equal(band.layoutRole, "header");
  assert.equal(band.layoutCells?.length, TEMPLATE_CELL_COUNT);
  assert.deepEqual(band.layoutCells, cells);
});

test("the dashboard band is edited, not previewed, on a 12-column grid", () => {
  const band = turnIntoDashboard(page([]), templateCells());

  assert.equal(band.layoutConfig?.columns, 12);
  assert.equal(band.layoutConfig?.rowHeight, 96);
  assert.equal(band.layoutConfig?.gap, 16);
  assert.equal(band.layoutConfig?.autoArrange, false);
  assert.equal(band.layoutConfig?.snapToGrid, true);
  assert.equal(band.layoutConfig?.preview, false);
});

test("the builder is pure: the same page in, the same band out", () => {
  const target = page([paragraph("p1", "hello")]);
  const cells = templateCells();

  assert.deepEqual(turnIntoDashboard(target, cells), turnIntoDashboard(target, cells));
});

test("the dashboard goes in front and the page's blocks keep flowing below", () => {
  const target = page([paragraph("p1", "hello"), paragraph("p2", "world")]);
  const next = turnIntoDashboardContent(target, templateCells());

  assert.equal(next.length, 3);
  assert.equal(next[0].type, "layout");
  assert.equal(next[0].layoutRole, "header");
  assert.deepEqual(next.slice(1), target.content);
});

test("an existing header band is replaced, never stacked", () => {
  const target = page([headerBand("old"), paragraph("p1", "hello")]);
  const next = turnIntoDashboardContent(target, templateCells());

  assert.equal(next.filter((block) => block.type === "layout" && block.layoutRole === "header").length, 1);
  assert.equal(next[0].layoutCells?.length, TEMPLATE_CELL_COUNT);
  assert.deepEqual(next.slice(1), [paragraph("p1", "hello")]);
});

test("turning the same page into a dashboard twice keeps one band", () => {
  const cells = templateCells();
  const once = turnIntoDashboardContent(page([paragraph("p1", "hello")]), cells);
  const twice = turnIntoDashboardContent(page(once), cells);

  assert.equal(twice.filter((block) => block.type === "layout" && block.layoutRole === "header").length, 1);
  assert.equal(twice.length, once.length);
  assert.equal(twice[0].layoutCells?.length, TEMPLATE_CELL_COUNT);
});

test("the action name is part of the page action vocabulary", () => {
  const action: PageActionName = "turn_into_dashboard";

  assert.equal(action, "turn_into_dashboard");
  assert.ok((PAGE_ACTION_NAMES as readonly string[]).includes("turn_into_dashboard"));
});

test("only an ordinary page can be turned into a dashboard", () => {
  assert.equal(canTurnIntoDashboard(undefined, false), true);
  assert.equal(canTurnIntoDashboard({ surface: "page" }, false), true);
  assert.equal(canTurnIntoDashboard({ surface: "agent" }, false), true);
  assert.equal(canTurnIntoDashboard({ surface: "home" }, false), true);
  assert.equal(canTurnIntoDashboard({ surface: "folder" }, false), false);
  assert.equal(canTurnIntoDashboard({ surface: "wiki" }, false), false);
  assert.equal(canTurnIntoDashboard({ surface: "code" }, false), false);
  assert.equal(canTurnIntoDashboard({ surface: "app" }, false), false);
});

test("a locked page cannot be turned into a dashboard", () => {
  assert.equal(canTurnIntoDashboard({ surface: "page" }, true), false);
});

test("a page whose body is not loaded yet still gets the band", () => {
  const unloaded = { _id: "page-2", title: "Ops", workspaceId: "ws-1" };
  const next = turnIntoDashboardContent(unloaded, templateCells());

  assert.equal(next.length, 1);
  assert.equal(next[0].type, "layout");
  assert.equal(next[0].layoutRole, "header");
});

test("the band id is sanitized: a hostile page id cannot leak a path", () => {
  const hostile = { _id: "../../etc/passwd", title: "Ops", workspaceId: "ws-1", content: [] };
  const band = turnIntoDashboard(hostile, templateCells());

  assert.equal(band.id.includes("/"), false);
  assert.equal(band.id.includes(".."), false);
});

test("the template's cells fill the 19-row grid without overlapping", () => {
  const cells = createViewShowcaseCells();
  assert.equal(cells.length, TEMPLATE_CELL_COUNT);
  const taken = new Set<string>();
  for (const c of cells) {
    assert.ok(c.colStart + c.colSpan - 1 <= 12 && c.rowStart + c.rowSpan - 1 <= 19, c.label);
    for (let r = c.rowStart; r < c.rowStart + c.rowSpan; r++) {
      for (let k = c.colStart; k < c.colStart + c.colSpan; k++) {
        assert.ok(!taken.has(`${r}:${k}`), `${c.label} overlaps at ${r}:${k}`);
        taken.add(`${r}:${k}`);
      }
    }
  }
});

test("the template's text never freezes a figure — numbers come from the live views", () => {
  for (const c of createViewShowcaseCells()) {
    for (const block of c.blocks ?? []) {
      if (block.type === "database_inline") continue;
      assert.doesNotMatch(block.content, /\d/, `${c.label}: "${block.content}"`);
    }
  }
});
