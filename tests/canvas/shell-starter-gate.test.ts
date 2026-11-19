// ADR 0064 PS19 (F12): the empty-page starter is offered only on a page whose body
// is a LOADED [] and whose server copy is empty too, and only to the page's owner. An
// empty page the server has not answered for asks the server first; a server copy with
// blocks is never written over, even while the local copy still reads as empty.

import assert from "node:assert/strict";
import test from "node:test";

import type { PageEntry } from "@/entities/page/model/types";
import type { PageAccessContext } from "@/shared/lib/auth/pageAccess";
import { shellStarterState } from "@/features/page-shells/model/shellStarterGate";
import { markServerCopy, serverBodyOf, subscribeServerCopies } from "@/store/sync/serverFetchedPages";

const ID = "0123456789abcdef01234567";
const owner = { userId: "u1" } as PageAccessContext;
const page = (extra: Partial<PageEntry>): PageEntry => ({ _id: ID, title: "", workspaceId: "ws", ownerId: "u1", content: [], ...extra }) as PageEntry;
const para = { id: "b", type: "paragraph" as const, content: "x" };

test("an empty body whose server copy is empty is offered to its owner", () => {
  assert.equal(shellStarterState({ page: page({}), context: owner, serverBody: "empty", locked: false }), "offer");
});

test("an empty local body over a server copy with blocks is never offered (F12)", () => {
  assert.equal(shellStarterState({ page: page({}), context: owner, serverBody: "filled", locked: false }), "none");
});

test("a body not loaded yet is never treated as empty (F12)", () => {
  assert.equal(shellStarterState({ page: page({ content: undefined }), context: owner, serverBody: "empty", locked: false }), "none");
});

test("an empty body the server has not answered for is fetched first, never offered", () => {
  assert.equal(shellStarterState({ page: page({}), context: owner, serverBody: null, locked: false }), "fetch");
});

test("a page that only lives here (no server id) is never offered", () => {
  assert.equal(shellStarterState({ page: page({ _id: "local-page-1" }), context: owner, serverBody: null, locked: false }), "none");
});

test("a page with blocks, a locked page, or someone else's page gets no starter", () => {
  assert.equal(shellStarterState({ page: page({ content: [para] }), context: owner, serverBody: "empty", locked: false }), "none");
  assert.equal(shellStarterState({ page: page({}), context: owner, serverBody: "empty", locked: true }), "none");
  assert.equal(shellStarterState({ page: page({ ownerId: "u2" }), context: owner, serverBody: "empty", locked: false }), "none");
  assert.equal(shellStarterState({ page: page({}), context: null, serverBody: "empty", locked: false }), "none");
});

test("the register keeps the latest server answer per page, and tells listeners of a change", () => {
  let heard = 0;
  const stop = subscribeServerCopies(() => { heard += 1; });
  assert.equal(serverBodyOf("p-fetched"), null);
  markServerCopy("p-fetched", []);
  assert.equal(serverBodyOf("p-fetched"), "empty");
  markServerCopy("p-fetched", []);
  markServerCopy("p-fetched", [para]);
  assert.equal(serverBodyOf("p-fetched"), "filled");
  stop();
  markServerCopy("p-other", []);
  assert.equal(heard, 2, "a repeat answer and an answer after unsubscribing are not heard");
});

test("a server answer without a body array counts as filled: nothing is written over it", () => {
  markServerCopy("p-no-body", null);
  assert.equal(serverBodyOf("p-no-body"), "filled");
});
