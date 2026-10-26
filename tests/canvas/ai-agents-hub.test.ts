/* ************************************************************************** */
/*  ai-agents-hub.test.ts — the AI Hub creates, edits and picks custom       */
/*  agents (D3 B2): the list never shows instructions (C300), create sends   */
/*  the strict body, PATCH carries expectedVersion and a conflict keeps the  */
/*  draft, a 404 hides the part, the switches read the server (C335), the    */
/*  approval card names the agent (C304).                                    */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AiError,
  archiveAgent,
  createAgent,
  getAgent,
  getAgentSettings,
  putAgentSettings,
  setAiTransport,
  updateAgent,
  type AiAgent,
  type AiCustomAgent,
} from "../../src/features/ai/api/aiClient";
import {
  AGENT_REFUSALS,
  EMPTY_AGENT_DRAFT,
  agentFailureMessage,
  createBodyOf,
  isAgentsOff,
  isVersionConflict,
  patchBodyOf,
  validateAgentDraft,
  type AgentDraft,
} from "../../src/features/ai/model/agentForm";
import type { ApprovalDescription } from "../../src/features/chat/model/approvals";
import { ApprovalCard } from "../../src/features/chat/ui/ApprovalCard";
import { AgentForm } from "../../src/features/settings/ai/AgentForm";
import { AgentList } from "../../src/features/settings/ai/AgentRows";
import { AgentSwitchRowsView, type AgentSettingsView } from "../../src/features/settings/ai/AgentSwitchRows";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Call {
  method: string;
  url: string;
  body: unknown;
}

function stub(answer: (call: Call) => Response): Call[] {
  const calls: Call[] = [];
  setAiTransport(async (input, init) => {
    const call = { method: String(init?.method), url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    return answer(call);
  });
  return calls;
}

const failure = (status: number, code: string): Response => json({ ok: false, code, error: { code } }, status);

const SECRET = "SECRET-INSTRUCTION-TEXT-DO-NOT-SHOW";

const BUILTIN: AiAgent = { id: "writer", name: "Writer", description: "Writes pages", tools: [], skills: [] } as unknown as AiAgent;

const CUSTOM: AiCustomAgent = {
  kind: "custom",
  id: "11111111-1111-4111-8111-111111111111",
  scope: "workspace",
  workspaceId: "ws-1",
  name: "Reviewer",
  description: "Reviews schemas",
  tools: ["read_page"],
  skills: ["acid-review"],
  version: 3,
  archived: false,
  needsReview: false,
  instructions: SECRET,
};

const REVIEW: AiCustomAgent = { ...CUSTOM, id: "22222222-2222-4222-8222-222222222222", name: "Stale", scope: "user", workspaceId: null, needsReview: true };

const NO_ACTIONS = { onTry: () => {}, onEdit: () => {}, onAskArchive: () => {}, onArchive: () => {} };

const DRAFT: AgentDraft = {
  ...EMPTY_AGENT_DRAFT,
  scope: "user",
  name: " Reviewer ",
  description: "Reviews schemas",
  instructions: "Check every migration.",
  tools: ["read_page"],
  skills: ["acid-review"],
};

test("the list never renders an instruction, even when a fixture carries one (C300)", () => {
  const html = renderToStaticMarkup(
    React.createElement(AgentList, { agents: [BUILTIN, CUSTOM, REVIEW], state: { busy: "", confirming: null }, actions: NO_ACTIONS }),
  );
  assert.doesNotMatch(html, new RegExp(SECRET), "the instruction text is not in the list");
  assert.match(html, /Built-in/);
  assert.match(html, /Workspace/);
  assert.match(html, /Only you/);
  assert.match(html, /Needs review/);
});

test("create sends exactly the strict body, workspaceId only for workspace scope", async () => {
  const calls = stub(() => json({ ok: true, agent: CUSTOM }, 201));
  await createAgent(createBodyOf(DRAFT));
  await createAgent(createBodyOf({ ...DRAFT, scope: "workspace", workspaceId: "ws-1" }));
  const [user, workspace] = calls.map((call) => call.body as Record<string, unknown>);
  assert.deepEqual(Object.keys(user).sort(), ["description", "instructions", "name", "scope", "skills", "tools"]);
  assert.equal(user.name, "Reviewer", "the name is trimmed");
  assert.deepEqual(Object.keys(workspace).sort(), ["description", "instructions", "name", "scope", "skills", "tools", "workspaceId"]);
  for (const forbidden of ["model", "effort", "knowledge", "connection_id"]) {
    assert.ok(!(forbidden in user) && !(forbidden in workspace), `${forbidden} is never sent`);
  }
  assert.equal(calls[0].method, "POST");
});

test("PATCH sends expectedVersion; archive is a DELETE", async () => {
  const calls = stub((call) => (call.method === "DELETE" ? new Response(null, { status: 204 }) : json({ ok: true, agent: { ...CUSTOM, version: 4 } })));
  await updateAgent(CUSTOM.id, patchBodyOf(DRAFT, 3));
  await archiveAgent(CUSTOM.id);
  assert.equal(calls[0].method, "PATCH");
  assert.equal((calls[0].body as { expectedVersion: number }).expectedVersion, 3);
  assert.equal(calls[1].method, "DELETE");
});

test("a 409 version_conflict is told as a sentence and the form keeps the draft", async () => {
  stub(() => failure(409, "version_conflict"));
  let caught: unknown;
  try {
    await updateAgent(CUSTOM.id, patchBodyOf(DRAFT, 3));
  } catch (error) {
    caught = error;
  }
  assert.ok(isVersionConflict(caught));
  const sentence = agentFailureMessage(caught);
  assert.equal(sentence, AGENT_REFUSALS.version_conflict);
  const edited = { ...CUSTOM, instructions: "The text the user typed" };
  const html = renderToStaticMarkup(
    React.createElement(AgentForm, { agent: edited, workspaces: [{ id: "ws-1", name: "Team" }], busy: false, error: sentence, onSubmit: () => {}, onCancel: () => {} }),
  );
  assert.match(html, /The text the user typed/, "the draft is still in the form");
  assert.match(html, /Somebody saved this agent first/, "the sentence is shown");
});

test("each error code becomes its sentence", () => {
  for (const [code, sentence] of Object.entries(AGENT_REFUSALS)) {
    assert.equal(agentFailureMessage(new AiError(422, code, code)), sentence, code);
  }
  for (const code of ["prefix_too_large", "unknown_tool", "invalid_skills", "invalid_request", "forbidden", "agent_limit", "agent_archived", "rate_limited"]) {
    assert.ok(AGENT_REFUSALS[code], `${code} has a sentence`);
  }
});

test("a viewer's agent (no instructions) opens read-only", () => {
  const { instructions: _omit, ...viewer } = CUSTOM;
  void _omit;
  const html = renderToStaticMarkup(
    React.createElement(AgentForm, { agent: viewer, workspaces: [], busy: false, error: "", onSubmit: () => {}, onCancel: () => {} }),
  );
  assert.match(html, /data-testid="agent-readonly"/);
});

test("the form validates before it sends", () => {
  assert.ok(validateAgentDraft({ ...DRAFT, name: "" }, true).name);
  assert.ok(validateAgentDraft({ ...DRAFT, instructions: "" }, true).instructions);
  assert.ok(validateAgentDraft({ ...DRAFT, instructions: "x".repeat(1501) }, true).instructions);
  assert.ok(validateAgentDraft({ ...DRAFT, scope: "workspace", workspaceId: "" }, true).workspaceId);
  assert.deepEqual(validateAgentDraft(DRAFT, true), {});
});

test("a settings 404 means the part is off: no switches", async () => {
  stub(() => failure(404, "not_found"));
  let caught: unknown;
  try {
    await getAgentSettings("ws-1");
  } catch (error) {
    caught = error;
  }
  assert.ok(isAgentsOff(caught));
  const html = renderToStaticMarkup(React.createElement(AgentSwitchRowsView, { view: { status: "off" }, onChange: () => {} }));
  assert.equal(html, "");
});

test("the settings read and write the server, both keys", async () => {
  const calls = stub(() => json({ ok: true, settings: { agents_enabled: true, custom_agents_allowed: false } }));
  await getAgentSettings("ws-1");
  await putAgentSettings("ws-1", { agents_enabled: true, custom_agents_allowed: true });
  assert.match(calls[0].url, /\/workspaces\/ws-1\/agents\/settings$/);
  assert.equal(calls[1].method, "PUT");
  assert.deepEqual(calls[1].body, { agents_enabled: true, custom_agents_allowed: true });
  void getAgent;
});

test("C335: the labels, and a failed read is disabled and never checked", () => {
  const html = (view: AgentSettingsView) => renderToStaticMarkup(React.createElement(AgentSwitchRowsView, { view, onChange: () => {} }));
  const ready = html({ status: "ready", settings: { agents_enabled: true, custom_agents_allowed: true }, locked: false, saveFailed: false });
  assert.match(ready, /Let this workspace run agents/);
  assert.match(ready, /Allow members to run their own custom agents in this workspace/);
  assert.match(ready, /checked/);
  const failed = html({ status: "failed" });
  assert.match(failed, /Could not load/);
  assert.doesNotMatch(failed, /checked=""|aria-checked="true"/, "unknown is never on");
  assert.match(failed, /disabled/);
  const locked = html({ status: "ready", settings: { agents_enabled: true, custom_agents_allowed: false }, locked: true, saveFailed: false });
  assert.match(locked, /Only an admin can change this/);
  assert.match(locked, /disabled/);
});

test("C335: a run request body carries neither switch", () => {
  const source = readFileSync("src/features/ai/model/aiInferencePort.ts", "utf8");
  assert.ok(!source.includes("agentsEnabled"));
  assert.ok(!source.includes("customAgentsAllowed"));
});

test("C304: the approval card names the agent and version, and says nothing for null", () => {
  const card = (agent: ApprovalDescription["agent"]): ApprovalDescription => ({
    approvalId: "approval-1",
    tool: "create_page",
    verb: "Create a page",
    status: "pending",
    target: { title: "The report", workspaceId: "ws-1", workspaceName: "Team" },
    args: { title: "The report" },
    preview: { unit: "blocks", count: 1 },
    approvedInRun: 0,
    expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    agent,
  });
  const render = (agent: ApprovalDescription["agent"]) =>
    renderToStaticMarkup(React.createElement(ApprovalCard, { approvalId: "approval-1", approval: card(agent) }));
  assert.match(render({ kind: "custom", id: CUSTOM.id, name: "Reviewer", version: 3, scope: "workspace" }), /Asked by Reviewer · v3/);
  assert.doesNotMatch(render(null), /Asked by/);
});
