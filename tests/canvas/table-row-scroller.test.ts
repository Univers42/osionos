/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   table-row-scroller.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 15:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 15:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// An inline table grows to its full height, so its own box never scrolls: the
// rows must be windowed against the page that does, or every row stays mounted.

import assert from "node:assert/strict";
import test from "node:test";

import { resolveRowScroller } from "../../src/shared/notion-database-sys/src/components/views/table/useTableVirtualizer.ts";

interface FakeBox { scrollHeight: number; clientHeight: number; overflowY: string; parentElement: FakeBox | null }

function chain(...boxes: Omit<FakeBox, "parentElement">[]): FakeBox[] {
  const built: FakeBox[] = boxes.map((b) => ({ ...b, parentElement: null }));
  built.forEach((b, i) => { b.parentElement = built[i + 1] ?? null; });
  return built;
}

const resolve = (own: FakeBox) =>
  resolveRowScroller(own as unknown as HTMLElement, (el) => (el as unknown as FakeBox).overflowY);

test("a bounded table that overflows scrolls its own rows", () => {
  const [table] = chain(
    { scrollHeight: 4000, clientHeight: 600, overflowY: "auto" },
    { scrollHeight: 9000, clientHeight: 800, overflowY: "auto" },
  );
  assert.equal(resolve(table), table);
});

test("an inline table that grows to full height uses the page scroller", () => {
  const [table, block, page] = chain(
    { scrollHeight: 4000, clientHeight: 4000, overflowY: "auto" },
    { scrollHeight: 5000, clientHeight: 5000, overflowY: "visible" },
    { scrollHeight: 9000, clientHeight: 800, overflowY: "auto" },
  );
  assert.notEqual(resolve(table), block);
  assert.equal(resolve(table), page);
});

test("a clipped ancestor that cannot scroll is skipped", () => {
  const [table, , page] = chain(
    { scrollHeight: 4000, clientHeight: 4000, overflowY: "auto" },
    { scrollHeight: 5000, clientHeight: 800, overflowY: "hidden" },
    { scrollHeight: 9000, clientHeight: 800, overflowY: "scroll" },
  );
  assert.equal(resolve(table), page);
});

test("nothing scrolls: fall back to the table itself", () => {
  const [table] = chain(
    { scrollHeight: 300, clientHeight: 300, overflowY: "auto" },
    { scrollHeight: 500, clientHeight: 500, overflowY: "auto" },
  );
  assert.equal(resolve(table), table);
});
