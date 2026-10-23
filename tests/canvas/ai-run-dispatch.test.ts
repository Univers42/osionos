/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-run-dispatch.test.ts                            :+:      :+:    :+:   */
/*                                                    +#+#+#+         +#+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +#+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The frames of a run, and what they do.
 *
 * The dispatch is the chain of the frames, out of the store: an event and its
 * data go in, the actions of the store come out. The frames the service
 * sends today are `run.started`, `citation`, `tool.called`, `tool.result`,
 * `permission.asked`, `text.delta`, `done` and `error` — and a frame nobody
 * knows is ignored.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { ChatMessage, ChatMessagePart } from "@/features/chat/model/chatTypes";
import { dispatchRunEvent, type RunEventActions } from "@/features/chat/model/runEventDispatch";
import { permissionFromEvent, permissionsFromParts, withPermission } from "@/features/chat/model/approvalParts";

/** What the dispatch did, in the order it did it. */
interface Seen {
  calls: string[];
  actions: RunEventActions;
}

/** The actions of a turn, and the trace of what they were asked to do. */
function seen(): Seen {
  const calls: string[] = [];
  const actions: RunEventActions = {
    appendText: (chunk) => void calls.push(`text:${chunk}`),
    appendCitation: (citation) => void calls.push(`citation:${citation.type}`),
    appendToolCall: (data) => void calls.push(`tool.called:${String(data.toolName)}`),
    appendToolResult: (data) => void calls.push(`tool.result:${String(data.toolName)}`),
    appendToolSource: () => void calls.push("tool.source"),
    patchAssistant: (patch) => void calls.push(`patch:${Object.keys(patch).join(",")}`),
    applyServerTitle: (title) => void calls.push(`title:${title}`),
    askPermission: (permission) => void calls.push(`permission:${permission.approvalId}`),
    proposeMemory: (proposal) => void calls.push(`memory:${proposal.memoryId}`),
  };
  return { calls, actions };
}

/* -------------------------------------------------------------------------- */
/* The frames                                                                  */
/* -------------------------------------------------------------------------- */

test("the text of the answer is appended", () => {
  const { calls, actions } = seen();
  dispatchRunEvent("text.delta", { text: "Hello" }, actions);
  assert.deepEqual(calls, ["text:Hello"]);
});

test("a frame without text changes nothing", () => {
  const { calls, actions } = seen();
  dispatchRunEvent("text.delta", { text: 42 }, actions);
  assert.deepEqual(calls, []);
});

test("a source is kept, and it is the result of the call that found it", () => {
  const { calls, actions } = seen();
  dispatchRunEvent("citation", { n: 1, pageId: "page-1", title: "Alpha" }, actions);
  assert.deepEqual(calls, ["citation:citation", "tool.source"]);
});

test("a source without a page is not a source", () => {
  const { calls, actions } = seen();
  dispatchRunEvent("citation", { n: 1, title: "Alpha" }, actions);
  assert.deepEqual(calls, []);
});

test("the calls of the tools are kept", () => {
  const { calls, actions } = seen();
  dispatchRunEvent("tool.called", { toolCallId: "c1", toolName: "read_page" }, actions);
  dispatchRunEvent("tool.result", { toolCallId: "c1", toolName: "read_page", ok: true }, actions);
  assert.deepEqual(calls, ["tool.called:read_page", "tool.result:read_page"]);
});

test("the run says which run it is, and what the conversation is called", () => {
  const { calls, actions } = seen();
  dispatchRunEvent("run.started", { runId: "run-1", conversationTitle: "The budget" }, actions);
  assert.deepEqual(calls, ["patch:runId", "title:The budget"]);
});

test("the end of a run, and its failure, are kept", () => {
  const done = seen();
  dispatchRunEvent("done", { runId: "run-1" }, done.actions);
  assert.deepEqual(done.calls, ["patch:status"]);

  const failed = seen();
  dispatchRunEvent("error", { code: "budget_exhausted" }, failed.actions);
  assert.deepEqual(failed.calls, ["patch:status,errorCode"]);

  const quiet = seen();
  dispatchRunEvent("error", {}, quiet.actions);
  assert.deepEqual(quiet.calls, ["patch:status,errorCode"]);
});

test("a frame nobody knows is ignored", () => {
  const { calls, actions } = seen();
  dispatchRunEvent("something.new", { text: "?" }, actions);
  assert.deepEqual(calls, []);
});

/* -------------------------------------------------------------------------- */
/* The card of a write                                                         */
/* -------------------------------------------------------------------------- */

test("the request of a write asks for the card", () => {
  const { calls, actions } = seen();
  dispatchRunEvent(
    "permission.asked",
    {
      approvalId: "approval-1",
      tool: "create_page",
      verb: "Create a page",
      target: { title: "The report", workspaceId: "workspace-1", workspaceName: "Marketing" },
      args: { title: "The report" },
      preview: { unit: "blocks", count: 2 },
      provenance: { pageIds: ["page-1"] },
      approvedInRun: 1,
      expiresAt: "2026-10-21T18:00:00.000Z",
    },
    actions,
  );
  assert.deepEqual(calls, ["permission:approval-1"]);
});

test("a request without an id is not a card", () => {
  const { calls, actions } = seen();
  dispatchRunEvent("permission.asked", { tool: "create_page" }, actions);
  assert.deepEqual(calls, []);
});

test("the card of a frame keeps what the client saw live", () => {
  const permission = permissionFromEvent({
    approvalId: "approval-1",
    tool: "create_page",
    verb: "Create a page",
    provenance: { pageIds: ["page-1", "page-2"] },
    expiresAt: "2026-10-21T18:00:00.000Z",
  });
  assert.ok(permission);
  assert.equal(permission.approvalId, "approval-1");
  assert.equal(permission.tool, "create_page");
  assert.equal(permission.verb, "Create a page");
  assert.deepEqual(permission.provenancePageIds, ["page-1", "page-2"]);
  assert.equal(permission.expiresAt, "2026-10-21T18:00:00.000Z");
});

test("the same card is never twice on a message", () => {
  const permission = permissionFromEvent({ approvalId: "approval-1", tool: "create_page" });
  assert.ok(permission);
  const parts: ChatMessagePart[] = [{ type: "text", text: "Writing it" }];
  const once = withPermission(parts, permission);
  const twice = withPermission(once, permission);
  assert.equal(permissionsFromParts(once).length, 1);
  assert.equal(permissionsFromParts(twice).length, 1, "the same card is never twice");
});

test("a message without a card has no card", () => {
  const message = { parts: [{ type: "text", text: "Hello" }] } as ChatMessage;
  assert.deepEqual(permissionsFromParts(message.parts), []);
});
