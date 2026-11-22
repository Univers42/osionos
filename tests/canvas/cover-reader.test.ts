/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   cover-reader.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// groot ADR 0064 PS24/PS25: the reader goes live before any client writes the cover layout.
// A content fetch and a seed read coverPosition/coverHeight/coverWidth back, and a server copy
// written by an older client (no key) never erases the value a newer one wrote.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { SyncLedger } from "@osionos/outbox-ledger";
import type { PageEntry } from "@/entities/page";
import type { SeedPage } from "@/data/seedPages";
import { seedToEntry } from "@/store/pageStore.helpers";
import { pageStamp } from "@/store/sync/pageStamp";
import { settleFetchedPage } from "@/store/sync/mergeServerPages";

const P = "fcf48b5b-2fed-41d6-9c5d-0075988728d1";
const T1 = "2026-10-01T10:00:00.000Z";
const T2 = "2026-10-02T10:00:00.000Z";
const COVER = { coverPosition: 30, coverHeight: 320, coverWidth: "content" as const };

function mkPage(overrides: Partial<PageEntry> = {}): PageEntry {
  return { _id: P, title: "Page", workspaceId: "ws-1", updatedAt: T1, content: [], ...overrides };
}

const cleanLedger = (page: PageEntry): SyncLedger => ({ [P]: pageStamp(page) });

test("a content fetch reads the three cover fields back", () => {
  const current = mkPage();
  const resolved = settleFetchedPage(current, mkPage({ ...COVER }), cleanLedger(current), true).resolved;
  assert.ok(resolved);
  assert.equal(resolved.page.coverPosition, 30);
  assert.equal(resolved.page.coverHeight, 320);
  assert.equal(resolved.page.coverWidth, "content");
});

test("a content fetch clamps the height and drops a width it does not know", () => {
  const current = mkPage();
  const server = { ...mkPage(), coverHeight: 5000, coverWidth: "wide" } as unknown as PageEntry;
  const resolved = settleFetchedPage(current, server, cleanLedger(current), true).resolved;
  assert.ok(resolved);
  assert.equal(resolved.page.coverHeight, 640);
  assert.equal("coverWidth" in resolved.page, false);
});

// groot ADR 0065 CV4: coverPosition is outside the stamp, so "clean" is no evidence that a local
// position was published. Before CV4 this case returned 20: a reposition snapped back on the
// next content fetch of a page whose row held an older position.
test("CV4: a clean page keeps its own cover position against a server copy that is not newer", () => {
  const current = mkPage({ coverPosition: 50 });
  const resolved = settleFetchedPage(current, mkPage({ coverPosition: 20 }), cleanLedger(current), true).resolved;
  assert.equal(resolved, null);
});

test("CV4: a newer server copy brings its cover position", () => {
  const current = mkPage({ coverPosition: 50 });
  const resolved = settleFetchedPage(current, mkPage({ coverPosition: 20, updatedAt: T2 }), cleanLedger(current), true).resolved;
  assert.equal(resolved?.page.coverPosition, 20);
});

test("CV4: a page without a cover position takes the server's at the same updatedAt", () => {
  const current = mkPage();
  const resolved = settleFetchedPage(current, mkPage({ coverPosition: 20 }), cleanLedger(current), true).resolved;
  assert.equal(resolved?.page.coverPosition, 20);
  assert.equal(resolved?.recordSynced, true);
});

test("CV4: a clean page still takes a cover size at the same updatedAt, not the position", () => {
  const current = mkPage({ coverPosition: 50 });
  const resolved = settleFetchedPage(current, mkPage({ ...COVER }), cleanLedger(current), true).resolved;
  assert.equal(resolved?.page.coverPosition, 50);
  assert.equal(resolved?.page.coverHeight, 320);
  assert.equal(resolved?.page.coverWidth, "content");
});

test("a page with an unpublished change keeps its own cover layout against an older server copy", () => {
  const current = mkPage({ ...COVER, title: "edited", updatedAt: T2 });
  const ledger: SyncLedger = { [P]: "an older stamp" };
  const server = mkPage({ coverPosition: 80, coverHeight: 200, coverWidth: "full", content: undefined });
  assert.equal(settleFetchedPage(current, server, ledger, true).resolved, null);
});

// PS25: two writers alternate on the server, one that knows the cover keys and one that predates
// them. `alternate` counts how many times the store was rewritten across the 10 fetches.
function alternate(advanceClock: boolean, start: Partial<PageEntry> = {}): { page: PageEntry; rewrites: number } {
  let page = mkPage(start);
  const ledger: SyncLedger = cleanLedger(page);
  let rewrites = 0;
  for (let round = 0; round < 10; round += 1) {
    const updatedAt = advanceClock ? new Date(Date.parse(T1) + (round + 1) * 1000).toISOString() : T1;
    const server = round % 2 === 0 ? mkPage({ ...COVER, updatedAt }) : mkPage({ updatedAt });
    const resolved = settleFetchedPage(page, server, ledger, true).resolved;
    if (!resolved) continue;
    rewrites += 1;
    page = resolved.page;
    if (resolved.recordSynced) ledger[P] = pageStamp(page);
  }
  return { page, rewrites };
}

test("PS25: 10 alternations with and without the keys keep the value, one rewrite", () => {
  const { page, rewrites } = alternate(false);
  assert.deepEqual(
    { coverPosition: page.coverPosition, coverHeight: page.coverHeight, coverWidth: page.coverWidth },
    COVER,
  );
  assert.equal(rewrites, 1);
});

test("PS25: with a newer server copy every round, the value survives all 10 rewrites", () => {
  const { page, rewrites } = alternate(true);
  assert.equal(page.coverHeight, 320);
  assert.equal(page.coverWidth, "content");
  assert.equal(page.coverPosition, 30);
  assert.equal(rewrites, 10);
});

// Re-stated under CV4: a device holding its own position (50) against an equal-time writer that
// has 30 takes the size once and keeps 50 throughout; before CV4 it took 30 in that rewrite.
test("PS25 + CV4: a local position survives 10 equal-time alternations, one rewrite for the size", () => {
  const { page, rewrites } = alternate(false, { coverPosition: 50 });
  assert.equal(page.coverPosition, 50);
  assert.equal(page.coverHeight, 320);
  assert.equal(page.coverWidth, "content");
  assert.equal(rewrites, 1);
});

const SEED: SeedPage = { _id: P, title: "Seed", workspaceId: "ws-1", content: [] };

test("a seed page carries its cover layout into the store, validated", () => {
  const entry = seedToEntry({ ...SEED, cover: "linear-gradient(red, blue)", ...COVER });
  assert.equal(entry.coverPosition, 30);
  assert.equal(entry.coverHeight, 320);
  assert.equal(entry.coverWidth, "content");
  const clamped = seedToEntry({ ...SEED, coverHeight: 12.2, coverPosition: 140 });
  assert.equal(clamped.coverHeight, 120);
  assert.equal("coverPosition" in clamped, false);
});

test("a seed page without a cover layout gains no cover keys", () => {
  const entry = seedToEntry(SEED);
  for (const key of ["coverPosition", "coverHeight", "coverWidth"]) assert.equal(key in entry, false, key);
});
