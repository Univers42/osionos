// ADR 0064 PS19 (F12): the empty-page starter is offered only on a page whose body
// is a LOADED [] that the server confirmed, and only to the page's owner. An empty
// page the server has not confirmed asks the server first.

import assert from "node:assert/strict";
import test from "node:test";

import type { PageEntry } from "@/entities/page/model/types";
import type { PageAccessContext } from "@/shared/lib/auth/pageAccess";
import { shellStarterState } from "@/features/page-shells/model/shellStarterGate";
import { hasServerCopy, markServerCopy, subscribeServerCopies } from "@/store/sync/serverFetchedPages";

const ID = "0123456789abcdef01234567";
const owner = { userId: "u1" } as PageAccessContext;
const page = (extra: Partial<PageEntry>): PageEntry => ({ _id: ID, title: "", workspaceId: "ws", ownerId: "u1", content: [], ...extra }) as PageEntry;

test("an empty body the server confirmed is offered to its owner", () => {
  assert.equal(shellStarterState({ page: page({}), context: owner, serverConfirmed: true, locked: false }), "offer");
});

test("a body not loaded yet is never treated as empty (F12)", () => {
  assert.equal(shellStarterState({ page: page({ content: undefined }), context: owner, serverConfirmed: true, locked: false }), "none");
});

test("an empty body the server has not confirmed is fetched first, never offered", () => {
  assert.equal(shellStarterState({ page: page({}), context: owner, serverConfirmed: false, locked: false }), "fetch");
});

test("a page that only lives here (no server id) is never offered", () => {
  assert.equal(shellStarterState({ page: page({ _id: "local-page-1" }), context: owner, serverConfirmed: false, locked: false }), "none");
});

test("a page with blocks, a locked page, or someone else's page gets no starter", () => {
  const filled = page({ content: [{ id: "b", type: "paragraph", content: "x" }] });
  assert.equal(shellStarterState({ page: filled, context: owner, serverConfirmed: true, locked: false }), "none");
  assert.equal(shellStarterState({ page: page({}), context: owner, serverConfirmed: true, locked: true }), "none");
  assert.equal(shellStarterState({ page: page({ ownerId: "u2" }), context: owner, serverConfirmed: true, locked: false }), "none");
  assert.equal(shellStarterState({ page: page({}), context: null, serverConfirmed: true, locked: false }), "none");
});

test("the server-copy register says which pages a fetch has answered, and tells listeners", () => {
  let heard = 0;
  const stop = subscribeServerCopies(() => { heard += 1; });
  assert.equal(hasServerCopy("p-fetched"), false);
  markServerCopy("p-fetched");
  assert.equal(hasServerCopy("p-fetched"), true);
  markServerCopy("p-fetched");
  stop();
  markServerCopy("p-other");
  assert.equal(heard, 1, "a repeat mark and a mark after unsubscribing are not heard");
});
