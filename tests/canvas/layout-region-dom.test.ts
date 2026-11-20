/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layout-region-dom.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Read-only layout markup for page regions (ruling TD19): fields reach the DOM only as
// data-region / data-stack-at / data-sticky, and a page without regions keeps its markup.

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import "./support/user-store-env.ts";

const { LayoutBlockReadOnly } = await import("../../src/entities/block/ui/LayoutBlockReadOnly.tsx");

const cell = (id: string, extra: Record<string, unknown> = {}) => ({
  id, colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 1, content: id, ...extra,
});
const render = (cells: unknown[]): string =>
  renderToStaticMarkup(
    React.createElement(LayoutBlockReadOnly, {
      block: { id: "layout", type: "layout", content: "", layoutConfig: { columns: 12, rowHeight: 96, gap: 16 }, layoutCells: cells } as never,
    }),
  );

test("a sticky left cell carries its region attributes and marks the grid", () => {
  const html = render([cell("side", { region: "left", sticky: true, stackAt: "mobile" })]);
  assert.match(html, /data-region="left"/);
  assert.match(html, /data-sticky="true"/);
  assert.match(html, /data-stack-at="mobile"/);
  assert.match(html, /data-has-regions="true"/);
});

test("unknown region values reach the DOM as nothing", () => {
  const html = render([cell("bogus", { region: "bogus", stackAt: "desktop", sticky: "yes" })]);
  assert.doesNotMatch(html, /data-region|data-stack-at|data-sticky|data-has-regions/);
});

test("sticky is dropped outside the sidebars", () => {
  const html = render([cell("main", { region: "main", sticky: true })]);
  assert.match(html, /data-region="main"/);
  assert.doesNotMatch(html, /data-sticky/);
});

test("a layout without regions gets no region attributes", () => {
  const html = render([cell("a"), cell("b", { colStart: 4 })]);
  assert.doesNotMatch(html, /data-region|data-stack-at|data-sticky|data-has-regions/);
});
