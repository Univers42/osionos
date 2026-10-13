/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-outbox-refused.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { ignoredFrom, publishResultFor } from "../../src/store/sync/publishResult.ts";
import { recoverRefusedEdit, type RecoveryDeps } from "../../src/store/sync/refusedEditRecovery.ts";

type Call = [string, unknown];
type Fetched = PageEntry | "unreadable" | "failed";

const block = (id: string, text: string) => ({ id, type: "paragraph", content: text });
// The refused edit (local) and what the server still holds differ in every copied field.
const local = {
  _id: "p1", title: "Plan", workspaceId: "shared", icon: "✏️",
  content: [block("b1", "my unsaved edit")], properties: [{ id: "prop-local" }],
} as unknown as PageEntry;
const server = {
  _id: "p1", title: "Plan (server)", workspaceId: "shared", icon: "📄",
  content: [block("b1", "server text")], properties: [],
} as unknown as PageEntry;
const copy = { _id: "c1", title: "Plan (copy)", workspaceId: "private" } as unknown as PageEntry;

function fakes(fetched: Fetched, created: PageEntry | null): { calls: Call[]; deps: RecoveryDeps } {
  const calls: Call[] = [];
  const deps: RecoveryDeps = {
    fetchServerPage: async (id) => { calls.push(["fetchServerPage", id]); return fetched; },
    createCopy: async (input) => { calls.push(["createCopy", input]); return created; },
    replaceLocalPage: (entry) => { calls.push(["replaceLocalPage", entry]); },
    evictLocalPage: (id) => { calls.push(["evictLocalPage", id]); },
    notify: (toast) => { calls.push(["notify", toast]); },
  };
  return { calls, deps };
}

test("publishResultFor: 403 refused, 404 gone, every other status failed", () => {
  const table: Array<[number, string]> = [[403, "refused"], [404, "gone"], [500, "failed"], [401, "failed"], [429, "failed"]];
  for (const [status, want] of table) assert.equal(publishResultFor(status), want, `status ${status}`);
});

test("ignoredFrom keeps string items of an array, anything else is []", () => {
  assert.deepEqual(ignoredFrom({ ignored: ["title", 3, null, "icon"] }), ["title", "icon"]);
  for (const body of [null, "ignored", [], { ignored: "title" }, {}]) assert.deepEqual(ignoredFrom(body), []);
});

test("no private workspace: failed, no dependency called", async () => {
  const { calls, deps } = fakes(server, copy);
  assert.equal(await recoverRefusedEdit(local, null, deps), "failed");
  assert.deepEqual(calls, []);
});

test("server fetch failed: failed, nothing but the fetch", async () => {
  const { calls, deps } = fakes("failed", copy);
  assert.equal(await recoverRefusedEdit(local, "private", deps), "failed");
  assert.deepEqual(calls, [["fetchServerPage", "p1"]]);
});

test("unreadable: the local page is evicted and the loss is reported", async () => {
  const { calls, deps } = fakes("unreadable", copy);
  assert.equal(await recoverRefusedEdit(local, "private", deps), "evicted");
  assert.deepEqual(calls, [
    ["fetchServerPage", "p1"],
    ["evictLocalPage", "p1"],
    ["notify", { kind: "error", title: "Changes to “Plan” were not saved", description: "This page was deleted or is no longer shared with you." }],
  ]);
});

test("copy refused: failed, the local edit is neither replaced nor reported", async () => {
  const { calls, deps } = fakes(server, null);
  assert.equal(await recoverRefusedEdit(local, "private", deps), "failed");
  assert.deepEqual(calls.map(([name]) => name), ["fetchServerPage", "createCopy"]);
});

test("recovered: the copy holds the LOCAL edit, the original returns to the server version", async () => {
  const { calls, deps } = fakes(server, copy);
  assert.equal(await recoverRefusedEdit(local, "private", deps), "recovered");
  assert.deepEqual(calls, [
    ["fetchServerPage", "p1"],
    ["createCopy", { workspaceId: "private", title: "Plan (copy)", content: local.content, icon: "✏️", properties: local.properties }],
    ["replaceLocalPage", server],
    ["notify", { kind: "warning", title: "You can no longer edit “Plan”", description: "Your changes were saved to “Plan (copy)” in your private workspace." }],
  ]);
});

test("an untitled page is named Untitled in the copy and the toasts", async () => {
  const { calls, deps } = fakes(server, copy);
  await recoverRefusedEdit({ ...local, title: "" }, "private", deps);
  assert.equal((calls[1][1] as { title: string }).title, "Untitled (copy)");
  assert.equal((calls[3][1] as { title: string }).title, "You can no longer edit “Untitled”");
});
