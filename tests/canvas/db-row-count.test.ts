/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   db-row-count.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The toolbar's row count is read on every store change. It scanned the whole
// account each time (1.35 ms on 8,646 rows); it now counts once per pages object.

import assert from "node:assert/strict";
import test from "node:test";

import { rowCountOf } from "../../src/shared/notion-database-sys/src/store/rowCounts.ts";
import type { Page } from "../../src/shared/notion-database-sys/src/types/database.ts";

const row = (id: string, databaseId: string) => ({ id, databaseId, properties: {} }) as unknown as Page;

test("counts the rows of one database among the account's", () => {
  const pages = { a: row("a", "tasks"), b: row("b", "tasks"), c: row("c", "notes") };
  assert.equal(rowCountOf(pages, "tasks"), 2);
  assert.equal(rowCountOf(pages, "notes"), 1);
  assert.equal(rowCountOf(pages, "empty"), 0);
});

test("a new pages object is counted again", () => {
  const pages = { a: row("a", "tasks") };
  assert.equal(rowCountOf(pages, "tasks"), 1);
  assert.equal(rowCountOf({ ...pages, b: row("b", "tasks") }, "tasks"), 2);
});

test("the same pages object is counted once", () => {
  const pages: Record<string, Page> = { a: row("a", "tasks") };
  assert.equal(rowCountOf(pages, "tasks"), 1);
  pages.b = row("b", "tasks");
  assert.equal(rowCountOf(pages, "tasks"), 1);
});
