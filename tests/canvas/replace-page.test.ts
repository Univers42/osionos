/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   replace-page.test.ts                               :+:      :+:    :+:   */
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
import { derivePageState, updatePageInState, type PageDerivedState } from "@/store/pageStore.helpers";
import { replacePage } from "@/store/replacePage";
import { generatedTree, page, seeded } from "./page-tree-fixtures";

const RUNS = 500;

function workspaces(random: () => number): Record<string, PageEntry[]> {
  const pages: Record<string, PageEntry[]> = {};
  const count = 1 + Math.floor(random() * 3);
  for (let w = 0; w < count; w++) {
    pages[`ws${w}`] = generatedTree(Math.floor(random() * 40), Math.floor(random() * 1e6)).map((entry) => ({
      ...entry,
      _id: `w${w}-${entry._id}`,
    }));
  }
  return pages;
}

/** An existing id most of the time, sometimes one that is in no workspace. */
function pickId(random: () => number, state: PageDerivedState): string {
  const ids = Object.keys(state.pagesIndex);
  if (ids.length === 0 || random() < 0.1) return "missing";
  return ids[Math.floor(random() * ids.length)];
}

type Updater = (entry: PageEntry) => PageEntry;

function pickUpdater(random: () => number): Updater {
  const roll = random();
  if (roll < 0.1) return (entry) => entry;
  if (roll < 0.2) return (entry) => ({ ...entry, _id: `${entry._id}-renamed` });
  return (entry) => ({ ...entry, title: `${entry.title}!` });
}

test("replacePage equals the scan + full derive for any page, updater and workspace set", () => {
  const random = seeded(7);
  for (let run = 0; run < RUNS; run++) {
    const state = derivePageState(workspaces(random));
    const pageId = pickId(random, state);
    const updater = pickUpdater(random);
    const fast = replacePage(state, pageId, updater);
    const slow = derivePageState(updatePageInState(state.pages, pageId, updater));
    assert.deepEqual(fast, slow, `run ${run}, page ${pageId}`);
  }
});

test("a content edit reuses both indexes and copies only the edited workspace", () => {
  const state = derivePageState({ a: [page("p1", "One", null), page("p2", "Two", null)], b: [page("q1", "Q", null)] });
  const next = replacePage(state, "p2", (entry) => ({ ...entry, title: "Two!" }));
  assert.equal(next.pageIdsByWorkspace, state.pageIdsByWorkspace);
  assert.equal(next.pagesIndex, state.pagesIndex);
  assert.equal(next.pages.b, state.pages.b);
  assert.notEqual(next.pages.a, state.pages.a);
  assert.equal(next.pages.a[0], state.pages.a[0]);
  assert.equal(next.pages.a[1].title, "Two!");
});

test("a stale index falls back to the scan instead of editing the wrong page", () => {
  const state = derivePageState({ a: [page("p1", "One", null), page("p2", "Two", null)] });
  const stale = { ...state, pagesIndex: { ...state.pagesIndex, p2: { workspaceId: "a", index: 0 } } };
  const next = replacePage(stale, "p2", (entry) => ({ ...entry, title: "Two!" }));
  assert.equal(next.pages.a[0].title, "One");
  assert.equal(next.pages.a[1].title, "Two!");
  assert.deepEqual(next.pagesIndex.p2, { workspaceId: "a", index: 1 });
});

test("derivePageState reuses the previous indexes only while every id sequence is unchanged", () => {
  const first = derivePageState({ a: [page("p1", "One", null)], b: [page("q1", "Q", null)] });
  const retitled = derivePageState({ ...first.pages, a: [{ ...first.pages.a[0], title: "Uno" }] }, first);
  assert.equal(retitled.pageIdsByWorkspace, first.pageIdsByWorkspace);
  assert.equal(retitled.pagesIndex, first.pagesIndex);

  const inserted = derivePageState({ ...first.pages, a: [...first.pages.a, page("p2", "Two", null)] }, first);
  assert.notEqual(inserted.pagesIndex, first.pagesIndex);
  assert.equal(inserted.pageIdsByWorkspace.b, first.pageIdsByWorkspace.b);
  assert.deepEqual(inserted.pagesIndex.p2, { workspaceId: "a", index: 1 });

  const dropped = derivePageState({ a: first.pages.a }, first);
  assert.notEqual(dropped.pagesIndex, first.pagesIndex);
  assert.equal(dropped.pagesIndex.q1, undefined);

  const added = derivePageState({ ...first.pages, c: [] }, first);
  assert.notEqual(added.pageIdsByWorkspace, first.pageIdsByWorkspace);
});
