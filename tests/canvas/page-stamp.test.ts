/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-stamp.test.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/01 17:48:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/01 17:48:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Unit tests for the page-stamp outbox builder — the pure "desired state" layer
// of the sync engine. If hashing breaks, pages either sync unnecessarily (perf
// regression) or silently DON'T sync (data loss). Two consumers sit on top:
// usePageSync and hydratePages.

import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTENT_UNLOADED,
  PAGE_OUTBOX_KEY,
  isPersistablePage,
  pageStamp,
  buildDesiredPages,
} from "../../src/store/sync/pageStamp.ts";

import type { PageEntry } from "../../src/entities/page/model/types.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_UUID = "fcf48b5b-2fed-41d6-9c5d-0075988728d1";
const VALID_MONGO = "507f1f77bcf86cd799439011";
const LOCAL_ID = "local-tmp-1";

/** Minimal PageEntry factory. */
function mkPage(overrides: Partial<PageEntry> = {}): PageEntry {
  return {
    _id: VALID_UUID,
    title: "Test Page",
    workspaceId: "ws-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test("CONTENT_UNLOADED is the sentinel string '∅'", () => {
  assert.equal(CONTENT_UNLOADED, "∅");
});

test("PAGE_OUTBOX_KEY is the expected localStorage key", () => {
  assert.equal(PAGE_OUTBOX_KEY, "osio:pages:outbox");
});

// ---------------------------------------------------------------------------
// isPersistablePage
// ---------------------------------------------------------------------------

test("isPersistablePage: accepts a UUID-id page without archivedAt", () => {
  assert.equal(isPersistablePage(mkPage({ _id: VALID_UUID })), true);
});

test("isPersistablePage: accepts a MongoDB ObjectId page", () => {
  assert.equal(isPersistablePage(mkPage({ _id: VALID_MONGO })), true);
});

test("isPersistablePage: rejects a local (non-persisted) id", () => {
  assert.equal(isPersistablePage(mkPage({ _id: LOCAL_ID })), false);
});

test("isPersistablePage: rejects an archived page", () => {
  assert.equal(isPersistablePage(mkPage({ archivedAt: "2026-01-01T00:00:00Z" })), false);
});

test("isPersistablePage: rejects archived page even with valid id", () => {
  assert.equal(isPersistablePage(mkPage({ _id: VALID_UUID, archivedAt: "2026-01-01T00:00:00Z" })), false);
});

// ---------------------------------------------------------------------------
// pageStamp — determinism
// ---------------------------------------------------------------------------

test("pageStamp: same input produces same stamp (deterministic)", () => {
  const page = mkPage({ updatedAt: "2026-06-01T00:00:00Z", content: [{ _id: "b1", type: "paragraph", properties: { title: [["Hello"]] }, children: [] }] });
  const s1 = pageStamp(page);
  const s2 = pageStamp(page);
  assert.equal(s1, s2);
});

test("pageStamp: stamp is a pipe-delimited string with 12 segments", () => {
  const page = mkPage({ updatedAt: "2026-06-01T00:00:00Z" });
  const stamp = pageStamp(page);
  const segments = stamp.split("|");
  assert.equal(segments.length, 12, `expected 12 pipe segments, got ${segments.length}: "${stamp}"`);
});

// ---------------------------------------------------------------------------
// pageStamp — field sensitivity
// ---------------------------------------------------------------------------

test("pageStamp: changes when title changes", () => {
  const base = mkPage({ updatedAt: "2026-01-01T00:00:00Z" });
  const modified = mkPage({ updatedAt: "2026-01-01T00:00:00Z", title: "Different" });
  assert.notEqual(pageStamp(base), pageStamp(modified));
});

test("pageStamp: changes when updatedAt changes", () => {
  const base = mkPage({ updatedAt: "2026-01-01T00:00:00Z" });
  const modified = mkPage({ updatedAt: "2026-06-01T00:00:00Z" });
  assert.notEqual(pageStamp(base), pageStamp(modified));
});

test("pageStamp: changes when parentPageId changes", () => {
  const base = mkPage({ parentPageId: null });
  const modified = mkPage({ parentPageId: "abc" });
  assert.notEqual(pageStamp(base), pageStamp(modified));
});

test("pageStamp: changes when visibility changes", () => {
  const base = mkPage({ visibility: "private" });
  const modified = mkPage({ visibility: "workspace" as PageEntry["visibility"] });
  assert.notEqual(pageStamp(base), pageStamp(modified));
});

test("pageStamp: changes when icon changes", () => {
  const base = mkPage({ icon: "📝" });
  const modified = mkPage({ icon: "🔥" });
  assert.notEqual(pageStamp(base), pageStamp(modified));
});

test("pageStamp: changes when content changes", () => {
  const base = mkPage({ content: [{ _id: "b1", type: "paragraph", properties: { title: [["A"]] }, children: [] }] });
  const modified = mkPage({ content: [{ _id: "b1", type: "paragraph", properties: { title: [["B"]] }, children: [] }] });
  assert.notEqual(pageStamp(base), pageStamp(modified));
});

test("pageStamp: changes when isTemplate changes", () => {
  const base = mkPage({ isTemplate: false });
  const modified = mkPage({ isTemplate: true });
  assert.notEqual(pageStamp(base), pageStamp(modified));
});

// ---------------------------------------------------------------------------
// pageStamp — CONTENT_UNLOADED sentinel (CRITICAL sync invariant)
// ---------------------------------------------------------------------------

test("pageStamp: uses CONTENT_UNLOADED sentinel when content is undefined", () => {
  const page = mkPage(); // content is undefined
  const stamp = pageStamp(page);
  assert.ok(stamp.includes(CONTENT_UNLOADED), `stamp should contain sentinel "${CONTENT_UNLOADED}": "${stamp}"`);
});

test("pageStamp: does NOT use sentinel when content is an empty array", () => {
  const page = mkPage({ content: [] });
  const stamp = pageStamp(page);
  assert.ok(!stamp.includes(CONTENT_UNLOADED), `stamp should NOT contain sentinel when content is []: "${stamp}"`);
});

test("pageStamp: content=undefined vs content=[] produce different stamps", () => {
  const unloaded = mkPage(); // undefined
  const empty = mkPage({ content: [] });
  assert.notEqual(pageStamp(unloaded), pageStamp(empty));
});

// ---------------------------------------------------------------------------
// pageStamp — content hash caching (WeakMap identity)
// ---------------------------------------------------------------------------

test("pageStamp: same content array identity hits cache (same stamp)", () => {
  const content = [{ _id: "b1", type: "paragraph", properties: { title: [["X"]] }, children: [] }];
  const page1 = mkPage({ content, updatedAt: "2026-01-01T00:00:00Z" });
  const page2 = mkPage({ content, updatedAt: "2026-01-01T00:00:00Z" }); // same ref
  assert.equal(pageStamp(page1), pageStamp(page2));
});

// ---------------------------------------------------------------------------
// buildDesiredPages
// ---------------------------------------------------------------------------

test("buildDesiredPages: includes persistable pages in desired map", () => {
  const pages = { "ws-1": [mkPage({ _id: VALID_UUID })] };
  const { desired, payloads } = buildDesiredPages(pages);
  assert.equal(desired.size, 1);
  assert.ok(desired.has(VALID_UUID));
  assert.equal(payloads.size, 1);
  assert.ok(payloads.has(VALID_UUID));
});

test("buildDesiredPages: excludes local-id pages", () => {
  const pages = { "ws-1": [mkPage({ _id: LOCAL_ID })] };
  const { desired } = buildDesiredPages(pages);
  assert.equal(desired.size, 0);
});

test("buildDesiredPages: excludes archived pages", () => {
  const pages = { "ws-1": [mkPage({ archivedAt: "2026-01-01T00:00:00Z" })] };
  const { desired } = buildDesiredPages(pages);
  assert.equal(desired.size, 0);
});

test("buildDesiredPages: respects canPublish filter", () => {
  const p1 = mkPage({ _id: VALID_UUID, title: "allowed" });
  const p2 = mkPage({ _id: VALID_MONGO, title: "blocked" });
  const pages = { "ws-1": [p1, p2] };
  const { desired } = buildDesiredPages(pages, (page) => page.title === "allowed");
  assert.equal(desired.size, 1);
  assert.ok(desired.has(VALID_UUID));
});

test("buildDesiredPages: handles multiple workspaces", () => {
  const pages = {
    "ws-1": [mkPage({ _id: VALID_UUID, workspaceId: "ws-1" })],
    "ws-2": [mkPage({ _id: VALID_MONGO, workspaceId: "ws-2" })],
  };
  const { desired } = buildDesiredPages(pages);
  assert.equal(desired.size, 2);
});

test("buildDesiredPages: stamp in desired map matches pageStamp output", () => {
  const page = mkPage({ _id: VALID_UUID, updatedAt: "2026-01-01T00:00:00Z" });
  const pages = { "ws-1": [page] };
  const { desired } = buildDesiredPages(pages);
  assert.equal(desired.get(VALID_UUID), pageStamp(page));
});

test("buildDesiredPages: default canPublish allows all", () => {
  const pages = { "ws-1": [mkPage({ _id: VALID_UUID }), mkPage({ _id: VALID_MONGO })] };
  const { desired } = buildDesiredPages(pages);
  assert.equal(desired.size, 2);
});
