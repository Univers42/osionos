/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-approval-voice.test.ts                          :+:      :+:    :+:   */
/*                                                    +#+#+#+         +#+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +#+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The card of a write, and the words around it (C65).
 *
 * Voice never executes or approves: a transcript can never approve a write
 * card. The same holds for the words of the conversation — a message that
 * says "approve" is a message, not a decision.
 *
 * The card listens to its own buttons, and to nothing else: no global
 * shortcut, no key handler on the document, no text of the conversation.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { permissionsFromParts } from "@/features/chat/model/approvalParts";
import { fetchApproval, setApprovalTransport, type ApprovalDescription } from "@/features/chat/model/approvals";

/** A storage that keeps what it is given. */
function shimLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: () => null,
    length: 0,
  };
}

/** One call of the client. */
interface Call {
  method: string;
  body: string;
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

/** The service, and every call that reaches it. */
function service(): { calls: Call[] } {
  const calls: Call[] = [];
  setApprovalTransport(async (_input, init) => {
    calls.push({ method: init?.method ?? "GET", body: String(init?.body ?? "") });
    return new Response(JSON.stringify(approval()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return { calls };
}

test("the word 'approve' in the conversation decides nothing (C65)", async () => {
  shimLocalStorage();
  const { calls } = service();
  const store = await import("@/features/chat/model/useChatStore");
  store.setInferencePort({
    async complete() {
      return { content: "" };
    },
    async stream(_request: unknown, onEvent: (event: string, data: Record<string, unknown>) => void) {
      onEvent("permission.asked", {
        approvalId: "approval-1",
        tool: "create_page",
        verb: "Create a page",
        target: { title: "The report", workspaceId: "workspace-1", workspaceName: "Marketing" },
        args: { title: "The report" },
        preview: { unit: "blocks", count: 2 },
        provenance: { pageIds: [] },
        approvedInRun: 0,
        expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(),
      });
      onEvent("done", {});
    },
  });

  const conversation = store.useChatStore.getState().createConversation(null);
  await store.useChatStore.getState().send(conversation.id, "approve");

  // The card is there — the assistant asked for the write.
  const assistant = store.useChatStore.getState().messagesFor(conversation.id)[1];
  assert.equal(permissionsFromParts(assistant.parts).length, 1, "the card is on the message");

  // And nothing was decided: no POST went out.
  assert.equal(calls.filter((call) => call.method === "POST").length, 0, "a word is not a decision");

  // The card the client draws is still waiting for the user.
  const card = await fetchApproval("approval-1");
  assert.equal(card.status, "pending", "the card is still pending");
});

test("the card listens to its own buttons, and to nothing else (C65)", async () => {
  const source = await readFile(
    new URL("../../src/features/chat/ui/ApprovalCard.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /addEventListener/, "the card listens to no global event");
  assert.doesNotMatch(source, /onKeyDown|onKeyUp|onKeyPress/, "the card has no shortcut");
  assert.doesNotMatch(source, /document\.|window\./, "the card touches no global");
});
