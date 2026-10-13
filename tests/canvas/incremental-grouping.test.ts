/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   incremental-grouping.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { PageEntry } from "@/entities/page";
import { createIncrementalGrouping, type IdGroups } from "@/shared/lib/collections/incrementalGrouping";
import { generatedTree, page, seeded } from "./page-tree-fixtures";

const byOrder = (a: PageEntry, b: PageEntry) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
// The context stands in for an access check: pages owned by `hidden` are in no group.
const byParent = (page: PageEntry, hidden: string) =>
  page.archivedAt || page.ownerId === hidden ? null : (page.parentPageId ?? "root");

const plain = (groups: IdGroups) => [...groups].sort(([a], [b]) => (a < b ? -1 : 1));

function mutate(pages: PageEntry[], random: () => number): PageEntry[] {
  const next = pages.slice();
  const at = Math.floor(random() * next.length);
  const target = next[at];
  const pick = random();
  if (pick < 0.3) next[at] = { ...target, title: `${target.title}!` };
  else if (pick < 0.45) next[at] = { ...target, sortOrder: Math.floor(random() * 8) };
  else if (pick < 0.55) next[at] = { ...target, parentPageId: random() < 0.3 ? null : next[Math.floor(random() * next.length)]._id };
  else if (pick < 0.65) next[at] = { ...target, archivedAt: target.archivedAt ? null : "2026-10-13T00:00:00Z" };
  else if (pick < 0.72) next[at] = { ...target, ownerId: target.ownerId === "u-hidden" ? "u1" : "u-hidden" };
  else if (pick < 0.8) next.splice(at, 1);
  else if (pick < 0.88) next.splice(at, 0, { ...target, _id: `${target._id}-copy${next.length}` });
  else if (pick < 0.94) [next[at], next[0]] = [next[0], next[at]];
  else for (let i = 0; i < next.length; i += 1) next[i] = { ...next[i], title: `${next[i].title}~` };
  return next;
}

test("matches a fresh rebuild after every random edit (2 000 steps over 20 trees)", () => {
  const random = seeded(11);
  for (let tree = 0; tree < 20; tree += 1) {
    const grouping = createIncrementalGrouping(byParent, byOrder);
    let pages = generatedTree(60 + tree * 7, tree).map((entry, index) => ({ ...entry, sortOrder: index % 5, ownerId: "u1" }));
    for (let step = 0; step < 100; step += 1) {
      pages = mutate(pages, random);
      const hidden = step % 25 === 0 ? "u1" : "u-hidden";
      const fresh = createIncrementalGrouping(byParent, byOrder)(pages, hidden, "ws");
      assert.deepEqual(plain(grouping(pages, hidden, "ws")), plain(fresh), `tree ${tree} step ${step}`);
    }
  }
});

test("a title edit returns the same groups, arrays included; a reorder rebuilds", () => {
  const grouping = createIncrementalGrouping(byParent, byOrder);
  const pages = [page("p0", "Root", null), page("p1", "One", "p0"), page("p2", "Two", "p0")]
    .map((entry, index) => ({ ...entry, sortOrder: index }));
  const before = grouping(pages, "nobody", "ws");
  const edited = pages.slice();
  edited[2] = { ...edited[2], title: "renamed" };
  assert.equal(grouping(edited, "nobody", "ws"), before);
  const moved = edited.slice();
  moved[2] = { ...moved[2], sortOrder: 0 };
  const after = grouping(moved, "nobody", "ws");
  assert.notEqual(after, before);
  assert.deepEqual(after.get("p0"), ["p2", "p1"]);
});

test("one slot per lineage: two workspaces alternating do not evict each other", () => {
  const grouping = createIncrementalGrouping(byParent, byOrder);
  const a = generatedTree(50, 1);
  const b = generatedTree(50, 2);
  const groupsA = grouping(a, "nobody", "a");
  const groupsB = grouping(b, "nobody", "b");
  assert.equal(grouping(a, "nobody", "a"), groupsA);
  assert.equal(grouping(b, "nobody", "b"), groupsB);
});
