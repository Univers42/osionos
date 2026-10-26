/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   db-group-rows.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A grouped table body flattens to one windowable list; the rows it shows, in
// visual order, are what keyboard nav and fill-drag index. New rows created
// from a group land in that group.

import assert from "node:assert/strict";
import test from "node:test";

import { layoutGroupRows } from "../../src/shared/notion-database-sys/src/components/views/table/groupRowsLayout.ts";
import { buildGroups, groupPresetValue } from "../../src/shared/notion-database-sys/src/store/slices/storeHelpers.ts";
import type { Page, SchemaProperty } from "../../src/shared/notion-database-sys/src/types/database.ts";

const page = (id: string, properties: Record<string, unknown> = {}) =>
  ({ id, databaseId: "db", properties, content: [], createdAt: "", updatedAt: "" }) as unknown as Page;
const group = (groupId: string, n: number) => ({
  groupId, groupLabel: groupId, groupColor: "", pages: Array.from({ length: n }, (_, i) => page(`${groupId}-${i}`)),
});

test("layout: header, capped rows, load-more, empty, new — rows numbered in visual order", () => {
  const { items, rowPages, itemIndexOfRow } = layoutGroupRows([group("a", 3), group("b", 0), group("c", 2)], new Set(), () => 2);
  assert.deepEqual(items.map(i => i.kind), [
    "header", "row", "row", "more", "new",
    "header", "empty", "new",
    "header", "row", "row", "new",
  ]);
  assert.deepEqual(rowPages.map(p => p.id), ["a-0", "a-1", "c-0", "c-1"]);
  for (const [rowIdx, itemIdx] of itemIndexOfRow.entries()) {
    const item = items[itemIdx];
    assert.equal(item.kind, "row");
    assert.equal(item.kind === "row" && item.rowIdx, rowIdx);
    assert.equal(item.kind === "row" && item.page, rowPages[rowIdx]);
  }
});

test("layout: a collapsed group is only its header; Infinity shows all", () => {
  const { items, rowPages } = layoutGroupRows([group("a", 3), group("b", 4)], new Set(["a"]), () => Infinity);
  assert.deepEqual(items.map(i => i.kind), ["header", "header", "row", "row", "row", "row", "new"]);
  assert.equal(rowPages.length, 4);
  assert.equal(layoutGroupRows([], new Set(), () => 5).items.length, 0);
});

test("layout: 5k rows flatten in linear time", () => {
  const groups = Array.from({ length: 12 }, (_, g) => group(`g${g}`, 420));
  const t0 = performance.now();
  const { items, rowPages } = layoutGroupRows(groups, new Set(), () => Infinity);
  assert.equal(rowPages.length, 5040);
  assert.equal(items.length, 5040 + 24);
  assert.ok(performance.now() - t0 < 20, "flatten under 20 ms");
});

test("group preset puts a new page back into the group it was created from", () => {
  const select = { id: "s", name: "S", type: "select", options: [{ id: "o1", value: "One", color: "" }] } as SchemaProperty;
  const check = { id: "c", name: "C", type: "checkbox" } as SchemaProperty;
  const num = { id: "n", name: "N", type: "number" } as SchemaProperty;
  const text = { id: "t", name: "T", type: "text" } as SchemaProperty;
  const pages = [page("p1", { s: "o1", c: true, n: 2, t: "x" }), page("p2", {})];
  for (const prop of [select, check, num, text]) {
    for (const g of buildGroups(pages, prop, { propertyId: prop.id })) {
      const preset = groupPresetValue(prop, g.groupId);
      assert.ok(preset, `${prop.type} ${g.groupId} has a preset`);
      const created = page("new", { [prop.id]: preset.value });
      const landed = buildGroups([created], prop, { propertyId: prop.id }).find(x => x.pages.length === 1);
      assert.equal(landed?.groupId, g.groupId, `${prop.type} new page lands in ${g.groupId}`);
    }
  }
  assert.equal(groupPresetValue({ ...select, nullable: false }, "__unassigned__"), undefined);
  assert.equal(groupPresetValue({ id: "f", name: "F", type: "formula" } as SchemaProperty, "3"), undefined);
});
