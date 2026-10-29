/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-mcp-approvals.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +#+           +#+      */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The outside agents' writes: the list the user sees, and the decision.
 *
 * The list is the contract of the service: `GET /api/ai/approvals?origin=mcp`
 * answers the pending MCP rows, newest first, each with the name of the agent
 * that asked. The client parses it defensively — a row without an id or a
 * string name is not a card — and the name is untrusted text, never markup.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { decideApprovalCard, externalAgentWords } from "@/features/chat/model/approvalCard";
import {
  listMcpApprovals,
  setApprovalTransport,
  type ApprovalDescription,
  type McpApproval,
} from "@/features/chat/model/approvals";
import { ApprovalCard } from "@/features/chat/ui/ApprovalCard";

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

/** The text of the markup, with the entities React writes for a text node. */
function decodeHtmlText(html: string): string {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** The service, and every call that reaches it. */
function service(handler: (call: Call) => Response): { calls: Call[] } {
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

/** An MCP row, as the service describes it. */
function mcpApproval(overrides: Partial<McpApproval> = {}): McpApproval {
  const description: ApprovalDescription = {
    approvalId: "approval-1",
    tool: "create_page",
    verb: "Create a page",
    status: "pending",
    target: { title: "The report", workspaceId: "workspace-1", workspaceName: "Marketing" },
    args: { title: "The report" },
    preview: { unit: "blocks", count: 2 },
    approvedInRun: 0,
    expiresAt: new Date(Date.now() + 50 * 60_000).toISOString(),
    createdAt: new Date().toISOString(),
  };
  return { ...description, origin: "mcp", agentName: "Claude Desktop", ...overrides };
}

/* -------------------------------------------------------------------------- */
/* The list                                                                    */
/* -------------------------------------------------------------------------- */

test("the list asks the service for the MCP rows, exactly", async () => {
  const { calls } = service(() => jsonResponse({ approvals: [] }));
  const approvals = await listMcpApprovals();
  assert.deepEqual(approvals, []);
  assert.equal(calls.length, 1, "one GET");
  assert.equal(calls[0].method, "GET");
  assert.equal(
    calls[0].url,
    "/api/ai/approvals?origin=mcp",
    "the path and its one parameter are exact",
  );
});

test("the list keeps the valid rows and drops the ones it cannot draw", async () => {
  const valid = mcpApproval();
  const missingName = { ...valid, approvalId: "approval-2" } as Record<string, unknown>;
  delete missingName.agentName;
  const numericName = { ...valid, approvalId: "approval-3", agentName: 42 };
  const missingId = { ...valid, approvalId: undefined, agentName: "Agent without an id" };

  service(() =>
    jsonResponse({ approvals: [valid, missingName, numericName, missingId] }),
  );
  const approvals = await listMcpApprovals();
  assert.equal(approvals.length, 1, "only the row with an id and a string name survives");
  assert.equal(approvals[0].approvalId, "approval-1");
  assert.equal(approvals[0].agentName, "Claude Desktop");
  assert.equal(approvals[0].origin, "mcp");
});

/* -------------------------------------------------------------------------- */
/* The line of the agent                                                       */
/* -------------------------------------------------------------------------- */

test("the card names the external agent, and says what osionos cannot see", () => {
  assert.equal(
    externalAgentWords("Claude Desktop"),
    'Requested by external agent "Claude Desktop" — osionos cannot see what it read.',
  );
});

test("the agent's name is a text node, never an element", () => {
  const hostile = "<img src=x onerror=alert(1)>";
  const html = renderToStaticMarkup(
    React.createElement(ApprovalCard, {
      approvalId: "approval-1",
      approval: mcpApproval(),
      agentName: hostile,
    }),
  );
  assert.doesNotMatch(html, /<img/i, "the name never becomes an element");
  assert.ok(
    decodeHtmlText(html).includes(externalAgentWords(hostile)),
    "the sentence is the same characters, escaped by React as a text node",
  );
});

test("a card without an agent is unchanged", () => {
  const html = renderToStaticMarkup(
    React.createElement(ApprovalCard, {
      approvalId: "approval-1",
      approval: mcpApproval(),
    }),
  );
  assert.equal(html.includes("Requested by external agent"), false);
});

/* -------------------------------------------------------------------------- */
/* The decision from the list                                                  */
/* -------------------------------------------------------------------------- */

test("a decision from the list posts the decision, and a null continuation starts nothing", async () => {
  const { calls } = service(() =>
    jsonResponse({
      ok: true,
      approvalId: "approval-1",
      status: "executed",
      result: null,
      error: null,
      continuationRunId: null,
    }),
  );
  const store = await import("@/features/chat/model/useChatStore");
  const attached: string[] = [];
  store.setInferencePort({
    async complete() {
      return { content: "" };
    },
    async stream() {
      return undefined;
    },
    async attach(runId: string) {
      attached.push(runId);
    },
  });

  const outcome = await decideApprovalCard("approval-1", "approve");
  assert.equal(outcome.kind, "decided");
  if (outcome.kind === "decided") {
    assert.equal(outcome.continuationRunId, null, "an MCP write never continues a run");
  }
  const posts = calls.filter((call) => call.method === "POST");
  assert.equal(posts.length, 1, "one click, one POST");
  assert.equal(posts[0].url, "/api/ai/approvals/approval-1");
  assert.equal(posts[0].body, '{"decision":"approve"}', "the body is the decision, and nothing else");
  assert.deepEqual(attached, [], "nothing was started");
});
