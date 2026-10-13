/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   merge-server-pages.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Device B holds page P cached (body C1 at T1); device A edits P on the server (C2 at T2).
// The page list B pulls is metadata only. Before this rule B kept C1 under A's T2, the content
// fetch saw "not newer" and kept C1, and B's next keystroke PATCHed C1 over C2.

import assert from "node:assert/strict";
import { test } from "node:test";

import { computeSyncActions, loadLedger, saveLedger, type SyncLedger } from "@osionos/outbox-ledger";
import type { Block } from "@/entities/block";
import type { PageEntry, PageStore } from "@/entities/page";
import type { PageAccessContext } from "@/shared/lib/auth/pageAccess";
import { canEditBody } from "@/store/pageStore.helpers";
import { applyServerPages } from "@/store/sync/applyServerPages";
import { buildDesiredPages, PAGE_OUTBOX_KEY, pageStamp } from "@/store/sync/pageStamp";
import {
  isPageClean,
  mergeServerPage,
  mergeServerPages,
  resolveFetchedPage,
} from "@/store/sync/mergeServerPages";

const P = "fcf48b5b-2fed-41d6-9c5d-0075988728d1";
const Q = "507f1f77bcf86cd799439011";
const T1 = "2026-10-01T10:00:00.000Z";
const T2 = "2026-10-02T10:00:00.000Z";
const T3 = "2026-10-03T10:00:00.000Z";
const USER = "u1";
const CONTEXT: PageAccessContext = { userId: USER, workspaceIds: ["ws-1"], privateWorkspaceIds: ["ws-1"], sharedWorkspaceIds: [] };

const body = (text: string): Block[] => [{ id: "b1", type: "paragraph", content: text }];
const page = (overrides: Partial<PageEntry> = {}): PageEntry => ({
  _id: P,
  title: "Plan",
  workspaceId: "ws-1",
  updatedAt: T1,
  ...overrides,
});
const synced = (...pages: PageEntry[]): SyncLedger =>
  Object.fromEntries(pages.map((entry) => [entry._id, pageStamp(entry)]));
const publishes = (pages: PageEntry[], ledger: SyncLedger, canPublish = true) =>
  computeSyncActions(buildDesiredPages({ "ws-1": pages }, () => canPublish).desired, ledger).toPublish;
const always = () => true;
const never = () => false;

test("isPageClean: only the stamp the server confirmed is clean; a read-only page always is", () => {
  const cached = page({ content: body("C1") });
  const ledger = synced(cached);
  assert.equal(isPageClean(cached, ledger, true), true);
  assert.equal(isPageClean({ ...cached, content: body("C1 + typed"), updatedAt: T2 }, ledger, true), false);
  assert.equal(isPageClean({ ...cached, content: body("other") }, {}, false), true);
});

test("mergeServerPage: a page missing locally is taken whole", () => {
  const row = page({ updatedAt: T2 });
  assert.equal(mergeServerPage(undefined, row, always), row);
});

test("mergeServerPage: a row that is not newer keeps the local copy", () => {
  const local = page({ content: body("C1"), updatedAt: T2 });
  assert.equal(mergeServerPage(local, page({ title: "Old", updatedAt: T1 }), always), null);
  assert.equal(mergeServerPage(local, page({ title: "Same", updatedAt: T2 }), always), null);
});

test("mergeServerPage: a newer row with content replaces body and metadata", () => {
  const merged = mergeServerPage(page({ content: body("C1") }), page({ title: "New", updatedAt: T2, content: body("C2") }), always);
  assert.deepEqual(merged?.content, body("C2"));
  assert.equal(merged?.title, "New");
  assert.equal(merged?.updatedAt, T2);
});

test("mergeServerPage: a newer metadata-only row unloads a clean cached body", () => {
  const merged = mergeServerPage(page({ content: body("C1") }), page({ title: "Plan v2", updatedAt: T2 }), always);
  assert.ok(merged);
  assert.equal(merged.content, undefined);
  assert.equal(merged.title, "Plan v2");
  assert.equal(merged.updatedAt, T2);
});

test("mergeServerPage: a newer metadata-only row never touches a page with an unpublished change", () => {
  const local = page({ content: body("C1 + typed"), updatedAt: T1 });
  assert.equal(mergeServerPage(local, page({ title: "Plan v2", updatedAt: T2 }), never), null);
});

test("mergeServerPages additive: local order kept, new pages appended, server-won pages listed", () => {
  const kept = page({ _id: Q, title: "Kept", content: body("q"), updatedAt: T3 });
  const stale = page({ content: body("C1") });
  const added = page({ _id: "0f0f0f0f-2fed-41d6-9c5d-0075988728d1", title: "Added", updatedAt: T2 });
  const result = mergeServerPages([kept, stale], [page({ updatedAt: T2 }), page({ _id: Q, updatedAt: T1 }), added], {
    authoritative: false,
    isClean: always,
  });
  assert.deepEqual(result.pages.map((entry) => entry._id), [Q, P, added._id]);
  assert.equal(result.pages[0], kept);
  assert.equal(result.pages[1].content, undefined);
  assert.deepEqual(result.serverWon.map((entry) => entry._id), [P, added._id]);
});

test("mergeServerPages authoritative: server order, saved pages it omits dropped, unsaved pages kept", () => {
  const ghost = page({ _id: Q, title: "Deleted elsewhere" });
  const unsaved = page({ _id: "local-tmp-1", title: "Not saved yet" });
  const result = mergeServerPages([ghost, unsaved, page({ content: body("C1") })], [page({ updatedAt: T1 })], {
    authoritative: true,
    isClean: always,
  });
  assert.deepEqual(result.pages.map((entry) => entry._id), [P, "local-tmp-1"]);
  assert.deepEqual(result.pages[0].content, body("C1"));
  assert.deepEqual(result.serverWon, []);
});

test("mergeServerPages: a page under refused-edit recovery keeps its local copy in both modes", () => {
  // The local copy holds the only copy of the edit the bridge refused; a newer row must not win.
  const refused = page({ content: body("refused edit") });
  const other = page({ _id: Q, content: body("q"), updatedAt: T1 });
  const rows = [page({ content: body("C2"), updatedAt: T3 }), page({ _id: Q, content: body("q2"), updatedAt: T3 })];
  for (const authoritative of [false, true]) {
    const result = mergeServerPages([refused, other], rows, { authoritative, isClean: always, recovering: new Set([P]) });
    assert.equal(result.pages[0], refused, `authoritative=${authoritative}`);
    assert.deepEqual(result.pages[1].content, body("q2"), "an ordinary page still merges");
    assert.deepEqual(result.serverWon.map((entry) => entry._id), [Q]);
  }
});

test("mergeServerPages authoritative: an empty list (an outage answering []) changes nothing", () => {
  const local = [page({ content: body("C1") })];
  const result = mergeServerPages(local, [], { authoritative: true, isClean: always });
  assert.deepEqual(result.pages, local);
  assert.deepEqual(result.serverWon, []);
});

test("F1: after the page list merge and the content fetch, B holds A's body and publishes nothing", () => {
  const cached = page({ content: body("C1") });
  const ledger = synced(cached);
  const merged = mergeServerPages([cached], [page({ updatedAt: T2 })], {
    authoritative: true,
    isClean: (entry) => isPageClean(entry, ledger, true),
  });
  for (const won of merged.serverWon) ledger[won._id] = pageStamp(won);
  assert.deepEqual(publishes(merged.pages, ledger), [], "the stale body must not publish");

  const fetched = resolveFetchedPage(merged.pages[0], page({ updatedAt: T2, content: body("C2") }), ledger, true);
  assert.ok(fetched);
  assert.deepEqual(fetched.page.content, body("C2"));
  assert.equal(fetched.recordSynced, true);
  ledger[P] = pageStamp(fetched.page);
  assert.deepEqual(publishes([fetched.page], ledger), [], "the server's own body must not echo back");
});

test("F1: a page edited on B before the merge keeps its body and still publishes", () => {
  const cached = page({ content: body("C1") });
  const ledger = synced(cached);
  const edited = { ...cached, content: body("C1 + typed"), updatedAt: T1 };
  const merged = mergeServerPages([edited], [page({ updatedAt: T2 })], {
    authoritative: false,
    isClean: (entry) => isPageClean(entry, ledger, true),
  });
  assert.equal(merged.pages[0], edited);
  assert.deepEqual(publishes(merged.pages, ledger), [P]);
});

test("F1: a read-only viewer drops its stale body without any ledger entry", () => {
  const cached = page({ content: body("C1") });
  const merged = mergeServerPages([cached], [page({ updatedAt: T2 })], {
    authoritative: true,
    isClean: (entry) => isPageClean(entry, {}, false),
  });
  assert.equal(merged.pages[0].content, undefined);
});

test("resolveFetchedPage: fills an unloaded body and records it as synced", () => {
  const unloaded = page({ updatedAt: T2 });
  const result = resolveFetchedPage(unloaded, page({ updatedAt: T2, content: body("C2") }), synced(unloaded), true);
  assert.ok(result);
  assert.deepEqual(result.page.content, body("C2"));
  assert.equal(result.recordSynced, true);
});

test("resolveFetchedPage: nothing to apply when the server copy is what the page holds", () => {
  const loaded = page({ content: body("C1"), updatedAt: T2 });
  assert.equal(resolveFetchedPage(loaded, page({ updatedAt: T2, content: body("C1") }), synced(loaded), true), null);
});

test("resolveFetchedPage: heals a cache that kept an old body under a newer updatedAt", () => {
  // What the previous hydrate left behind: A's T2 on B's old body C1, recorded as synced.
  const poisoned = page({ content: body("C1"), updatedAt: T2 });
  const ledger = synced(poisoned);
  const result = resolveFetchedPage(poisoned, page({ updatedAt: T2, content: body("C2") }), ledger, true);
  assert.ok(result);
  assert.deepEqual(result.page.content, body("C2"));
  assert.equal(result.recordSynced, true);
  ledger[P] = pageStamp(result.page);
  assert.deepEqual(publishes([result.page], ledger), []);
});

test("resolveFetchedPage: an unpublished change keeps its body unless the server is newer", () => {
  const before = page({ content: body("C1") });
  const ledger = synced(before);
  const typedDuringRequest = { ...before, content: body("C1 + typed"), updatedAt: T3 };
  assert.equal(resolveFetchedPage(typedDuringRequest, page({ updatedAt: T2, content: body("C2") }), ledger, true), null);
  assert.deepEqual(publishes([typedDuringRequest], ledger), [P], "the edit still publishes");

  const olderEdit = { ...before, title: "Renamed while loading", updatedAt: T1 };
  const result = resolveFetchedPage(olderEdit, page({ updatedAt: T2, content: body("C2") }), ledger, true);
  assert.ok(result);
  assert.equal(result.recordSynced, false, "an unclean page is never recorded as the server's copy");
});

test("resolveFetchedPage: a viewer who cannot publish never records the ledger", () => {
  const unloaded = page({ updatedAt: T2 });
  const result = resolveFetchedPage(unloaded, page({ updatedAt: T2, content: body("C2") }), {}, false);
  assert.equal(result?.recordSynced, false);
});

test("canEditBody: an editor may not write the body of a saved page that has not loaded", () => {
  assert.equal(canEditBody(page({ ownerId: USER, content: [] }), CONTEXT), true);
  assert.equal(canEditBody(page({ ownerId: USER }), CONTEXT), false);
  assert.equal(canEditBody(page({ _id: "local-tmp-1", ownerId: USER }), CONTEXT), true, "an unsaved page never waits");
  assert.equal(canEditBody(page({ ownerId: "someone-else", content: [] }), CONTEXT), false);
  assert.equal(canEditBody(undefined, CONTEXT), false);
});

test("applyServerPages: records the pages the server copy won, and only the edited page publishes", () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() { return storage.size; },
    },
  });
  (globalThis as Record<string, unknown>).__playgroundUserStore = {
    getState: () => ({ activeSession: () => ({ userId: USER, privateWorkspaces: [{ _id: "ws-1" }], sharedWorkspaces: [] }) }),
    subscribe: () => () => undefined,
  };
  const clean = page({ ownerId: USER, content: body("C1") });
  const edited = page({ _id: Q, ownerId: USER, content: body("q typed"), updatedAt: T1 });
  saveLedger(PAGE_OUTBOX_KEY, { ...synced(clean), [Q]: pageStamp({ ...edited, content: body("q") }) });
  let state = { pages: { "ws-1": [clean, edited] } } as unknown as PageStore;
  const setState = (update: (current: PageStore) => Partial<PageStore>) => { state = { ...state, ...update(state) }; };

  const taken = applyServerPages(setState, "ws-1", [page({ ownerId: USER, updatedAt: T2 }), page({ _id: Q, ownerId: USER, updatedAt: T2 })], true);

  const [merged, keptEdit] = state.pages["ws-1"];
  assert.equal(taken, 1);
  assert.equal(merged.content, undefined);
  assert.equal(keptEdit, edited);
  const ledger = loadLedger(PAGE_OUTBOX_KEY);
  assert.equal(ledger[P], pageStamp(merged));
  assert.deepEqual(publishes(state.pages["ws-1"], ledger), [Q]);
});
