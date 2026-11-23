// A content fetch on a page whose base has no version at all: a cache written before content
// versions, or a bridge without the column. Nothing orders the two copies but updatedAt, so
// the timestamp rule decides, as before AM15. Inputs mirror tests/e2e/bridge-stub/
// pageShells.spec.mjs: an empty local body never published (no ledger stamp), a server copy
// with blocks at contentVersion 1.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { PageEntry } from "@/entities/page";
import { settleFetchedPage } from "@/store/sync/mergeServerPages";

const ID = "65a0000000000000000000a1";
const FILLED = [{ id: "srv", type: "paragraph", content: "From the server" }] as PageEntry["content"];
const local: PageEntry = { _id: ID, title: "Shell host", workspaceId: "ws", content: [] };
const server = (updatedAt?: string): PageEntry => ({ ...local, content: FILLED, contentVersion: 1, ...(updatedAt ? { updatedAt } : {}) });

test("a newer server copy with blocks replaces an unpublished empty body when no version orders them", () => {
  const fetched = settleFetchedPage(local, server("2026-11-19T00:00:00.000Z"), {}, true);
  assert.deepEqual(fetched.resolved?.page.content, FILLED);
  assert.deepEqual(fetched.base, { version: 1, content: FILLED }, "the base learns the copy the body now holds");
});

test("F12: a server copy that is not newer leaves the unpublished empty body alone", () => {
  const fetched = settleFetchedPage(local, server(), {}, true);
  assert.deepEqual(fetched.resolved?.page.content ?? local.content, []);
  assert.equal(fetched.base, null);
});
