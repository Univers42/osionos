/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-approval-decision.test.ts                      :+:      :+:    :+:   */
/*                                                    +#+#+#+         +#+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +#+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The decision of the user: one click, one POST, and what comes of it.
 *
 * The card is the only door to a write, and this file holds the rules of
 * that door:
 *
 * - ONE CLICK, ONE POST. A decision that is on its way refuses a second
 *   one, whatever the buttons say.
 * - THE BODY IS THE DECISION, and nothing else.
 * - A 409 IS NOT A FAILURE: the approval was already decided, and the card
 *   is fetched again instead of showing an error.
 * - The follow-up of the write — the answer of the assistant after it — is a
 *   run of its own, and the client attaches to it.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { decideApprovalCard } from "@/features/chat/model/approvalCard";
import { setApprovalTransport, type ApprovalDescription } from "@/features/chat/model/approvals";

/* -------------------------------------------------------------------------- */
/* The service, and the calls that reach it                                   */
/* -------------------------------------------------------------------------- */

/** One call of the client. */
interface Call {
  method: string;
  url: string;
  body: string;
}

/** A JSON answer of the service. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** The card of a write, as the service describes it. */
function approval(overrides: Partial<ApprovalDescription> = {}): ApprovalDescription {
  return {
    approvalId: "approval-1",
    tool: "create_page",
    verb: "Create a page",
    status: "pending",
    target: { title: "The report", workspaceId: "workspace-1", workspaceName: "Marketing" },
    args: { title: "The report" },
    preview: { unit: "blocks", count: 2 },
    approvedInRun: 0,
    expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * The service, and every call that reaches it.
 *
 * The answer of the service is the one the handler gives: the POST and the
 * GET may answer differently.
 */
function service(
  handler: (call: Call) => Response,
): { calls: Call[] } {
  const calls: Call[] = [];
  setApprovalTransport(async (input, init) => {
    const call: Call = {
      method: init?.method ?? "GET",
      url: String(input),
      body: String(init?.body ?? ""),
    };
    calls.push(call);
    return handler(call);
  });
  return { calls };
}

/** The answer of a decision that went through. */
function decided(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse({
    ok: true,
    approvalId: "approval-1",
    status: "executed",
    result: { pageId: "page-1" },
    error: null,
    continuationRunId: null,
    ...overrides,
  });
}

/* -------------------------------------------------------------------------- */
/* The decision                                                                */
/* -------------------------------------------------------------------------- */

test("approving sends one decision, and the body is the decision", async () => {
  const { calls } = service(() => decided());
  const outcome = await decideApprovalCard("approval-1", "approve");
  assert.equal(outcome.kind, "decided");
  const posts = calls.filter((call) => call.method === "POST");
  assert.equal(posts.length, 1, "one click, one POST");
  assert.equal(posts[0].body, '{"decision":"approve"}', "the body is the decision, and nothing else");
  assert.match(posts[0].url, /\/approvals\/approval-1$/);
});

test("declining sends one decision, too", async () => {
  const { calls } = service(() => decided({ status: "declined" }));
  const outcome = await decideApprovalCard("approval-1", "decline");
  assert.equal(outcome.kind, "decided");
  const posts = calls.filter((call) => call.method === "POST");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body, '{"decision":"decline"}');
});

test("a second click while the decision is on its way does nothing", async () => {
  const { calls } = service(() => decided());
  const first = decideApprovalCard("approval-1", "approve");
  const second = await decideApprovalCard("approval-1", "approve");
  assert.equal(second.kind, "busy", "the second click is refused");
  const answer = await first;
  assert.equal(answer.kind, "decided");
  assert.equal(calls.filter((call) => call.method === "POST").length, 1, "one POST, not two");
});

test("a decision of another approval is not refused", async () => {
  const { calls } = service(() => decided());
  const first = decideApprovalCard("approval-1", "approve");
  const other = await decideApprovalCard("approval-2", "approve");
  assert.equal(other.kind, "decided", "the guard is per approval");
  await first;
  assert.equal(calls.filter((call) => call.method === "POST").length, 2);
});

test("a 409 fetches the card again, and it is not a failure", async () => {
  const { calls } = service((call) =>
    call.method === "POST"
      ? jsonResponse({ ok: false, code: "already_decided" }, 409)
      : jsonResponse(approval({ status: "executed" })),
  );
  const outcome = await decideApprovalCard("approval-1", "approve");
  assert.equal(outcome.kind, "conflict");
  if (outcome.kind !== "conflict") return;
  assert.equal(outcome.approval.status, "executed", "the card shows what really happened");
  assert.equal(calls.filter((call) => call.method === "GET").length, 1, "the card is fetched again");
});

test("a refusal is a refusal, and it says so in words", async () => {
  const { calls } = service(() => jsonResponse({ ok: false, code: "rate_limited" }, 429));
  const outcome = await decideApprovalCard("approval-1", "approve");
  assert.equal(outcome.kind, "failed");
  if (outcome.kind !== "failed") return;
  assert.equal(outcome.code, "rate_limited");
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
});

test("the decision carries the run the assistant continues in", async () => {
  service(() => decided({ continuationRunId: "run-2" }));
  const outcome = await decideApprovalCard("approval-1", "approve");
  assert.equal(outcome.kind, "decided");
  if (outcome.kind !== "decided") return;
  assert.equal(outcome.continuationRunId, "run-2");
});

/* -------------------------------------------------------------------------- */
/* The follow-up of the write                                                  */
/* -------------------------------------------------------------------------- */

test("the follow-up of an approved write streams into the conversation", async () => {
  const store = await import("@/features/chat/model/useChatStore");
  const attached: string[] = [];
  store.setInferencePort({
    async complete() {
      return { content: "" };
    },
    async stream(_request: unknown, onEvent: (event: string, data: Record<string, unknown>) => void) {
      onEvent("text.delta", { text: "The page is on its way." });
      onEvent("done", {});
    },
    async attach(runId: string, onEvent: (event: string, data: Record<string, unknown>) => void) {
      attached.push(runId);
      onEvent("text.delta", { text: "The page is created." });
      onEvent("done", {});
    },
  });
  const conversation = store.useChatStore.getState().createConversation(null);
  await store.useChatStore.getState().send(conversation.id, "make me a page");
  await store.useChatStore.getState().followUp(conversation.id, "run-2");

  assert.deepEqual(attached, ["run-2"], "the client attaches to the run of the follow-up");
  const messages = store.useChatStore.getState().messagesFor(conversation.id);
  assert.equal(messages.length, 3, "the follow-up is a turn of its own");
  assert.equal(messages[2].role, "assistant");
  assert.equal(messages[2].content, "The page is created.");
});
