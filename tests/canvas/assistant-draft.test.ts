/** The assistant's shared draft: one account's agent and pages never reach another's chat. */

import assert from "node:assert/strict";
import test from "node:test";

import "./support/memory-local-storage.ts";

import { useAssistantDraft } from "@/features/chat/model/assistantDraft";

const PAGE = { id: "p1", kind: "page" as const, label: "Roadmap", pageId: "p1" };

test("claiming for the same account keeps the agent and pages; another account starts from none", () => {
  const draft = useAssistantDraft.getState();
  draft.claim("alice");
  draft.setAgentId("agent-1");
  draft.setChips([PAGE]);
  const model = useAssistantDraft.getState().selection;

  useAssistantDraft.getState().claim("alice");
  assert.equal(useAssistantDraft.getState().agentId, "agent-1");
  assert.deepEqual(useAssistantDraft.getState().chips, [PAGE]);

  useAssistantDraft.getState().claim("bob");
  assert.equal(useAssistantDraft.getState().agentId, null);
  assert.deepEqual(useAssistantDraft.getState().chips, []);
  assert.deepEqual(useAssistantDraft.getState().selection, model, "the model choice is the browser's");

  useAssistantDraft.getState().claim(null);
  assert.equal(useAssistantDraft.getState().ownerId, null, "signing out drops the owner too");
});
