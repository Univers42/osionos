import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { planTree, keptKeys, decisionItems, type PlanNode } from "@/features/chat/model/planTree";
import { approvalCardState, stateWords, decideApprovalCard, resumeApprovalCard } from "@/features/chat/model/approvalCard";
import { decideApproval, setApprovalTransport, type ApprovalDescription } from "@/features/chat/model/approvals";
import { ApprovalCard } from "@/features/chat/ui/ApprovalCard";

function approval(overrides: Partial<ApprovalDescription> = {}): ApprovalDescription {
  return {
    approvalId: "approval-1",
    tool: "build_plan",
    verb: "Build a plan",
    status: "pending",
    target: { title: "Plan", workspaceId: "workspace-1", workspaceName: "Marketing" },
    args: {
      title: "Plan",
      items: [
        { kind: "page", key: "home", title: "Home", children: [
          { kind: "page", key: "about", title: "About" },
          { kind: "database", key: "db1", title: "DB" },
        ] },
        { kind: "database", key: "tasks", title: "Tasks" },
      ],
    },
    preview: { unit: "none", count: 0 },
    approvedInRun: 0,
    expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("planTree: 3-level plan gives walk order, depths and parentKeys", () => {
  const args = {
    items: [
      { kind: "page", key: "a", title: "A", children: [
        { kind: "page", key: "b", title: "B", children: [
          { kind: "database", key: "c", title: "C" },
        ] },
        { kind: "database", key: "d", title: "D" },
      ] },
      { kind: "database", key: "e", title: "E" },
    ],
  };
  const nodes = planTree(args);
  assert.deepEqual(nodes, [
    { key: "a", kind: "page", title: "A", depth: 1, parentKey: null },
    { key: "b", kind: "page", title: "B", depth: 2, parentKey: "a" },
    { key: "c", kind: "database", title: "C", depth: 3, parentKey: "b" },
    { key: "d", kind: "database", title: "D", depth: 2, parentKey: "a" },
    { key: "e", kind: "database", title: "E", depth: 1, parentKey: null },
  ]);
});

test("planTree: malformed args -> null", () => {
  assert.equal(planTree({}), null);
  assert.equal(planTree({ items: [{ kind: "page", title: "x" }] }), null);
  const big = { items: [] as unknown[] };
  for (let i = 0; i < 201; i++) big.items.push({ kind: "page", key: `k${i}`, title: `t${i}` });
  assert.equal(planTree(big), null);
  assert.equal(planTree({ items: [{ kind: "script", key: "x", title: "y" }] }), null);
});

test("keptKeys/decisionItems: nothing off -> undefined", () => {
  const nodes = planTree(approval().args)!;
  assert.equal(decisionItems(nodes, new Set()), undefined);
});

test("keptKeys: a page off drops it and descendants", () => {
  const nodes = planTree(approval().args)!;
  const off = new Set(["home"]);
  const kept = keptKeys(nodes, off);
  assert.ok(!kept.includes("home"));
  assert.ok(!kept.includes("about"));
  assert.ok(!kept.includes("db1"));
  assert.ok(kept.includes("tasks"));
});

test("keptKeys: a leaf off drops only that one", () => {
  const nodes = planTree(approval().args)!;
  const off = new Set(["tasks"]);
  const kept = keptKeys(nodes, off);
  assert.ok(!kept.includes("tasks"));
  assert.ok(kept.includes("home"));
  assert.ok(kept.includes("about"));
});

test("decideApproval with items: exact body", async () => {
  const calls: { method: string; body: string }[] = [];
  setApprovalTransport(async (_input, init) => {
    calls.push({ method: init?.method ?? "GET", body: String(init?.body ?? "") });
    return jsonResponse({ ok: true, approvalId: "approval-1", status: "executed", result: null, error: null, continuationRunId: null });
  });
  await decideApproval("approval-1", "approve", ["home", "tasks"]);
  const post = calls.find((c) => c.method === "POST")!;
  assert.equal(post.body, '{"decision":"approve","items":["home","tasks"]}');
  // without items
  calls.length = 0;
  await decideApproval("approval-1", "approve");
  const post2 = calls.find((c) => c.method === "POST")!;
  assert.equal(post2.body, '{"decision":"approve"}');
});

test("resumeApprovalCard: two concurrent calls -> one POST", async () => {
  const calls: string[] = [];
  setApprovalTransport(async (input, init) => {
    if (init?.method === "POST") {
      calls.push("POST");
      // delay
      await new Promise((r) => setTimeout(r, 50));
    }
    return jsonResponse({ ok: true, approvalId: "approval-1", status: "executed", result: null, error: null, continuationRunId: null });
  });
  const first = resumeApprovalCard("approval-1");
  const second = await resumeApprovalCard("approval-1");
  assert.equal(second.kind, "busy");
  await first;
  // count POSTs
  // second returned busy before POST, so only first posted
  assert.equal(calls.length, 1);
});

test("resumeApprovalCard: 409 approval_not_partial -> re-fetch, no error state", async () => {
  const calls: { method: string }[] = [];
  setApprovalTransport(async (_input, init) => {
    calls.push({ method: init?.method ?? "GET" });
    if (init?.method === "POST") {
      return jsonResponse({ ok: false, code: "approval_not_partial" }, 409);
    }
    return jsonResponse(approval({ status: "executed" }));
  });
  const outcome = await resumeApprovalCard("approval-1");
  assert.equal(outcome.kind, "conflict");
  if (outcome.kind === "conflict") assert.equal(outcome.approval.status, "executed");
  assert.equal(calls.filter((c) => c.method === "GET").length, 1);
});

test("approvalCardState('partial') -> 'partial'; unknown -> 'unknown'", () => {
  assert.equal(approvalCardState("partial"), "partial");
  assert.equal(approvalCardState("something-else"), "unknown");
});

test("stateWords('partial')", () => {
  assert.equal(stateWords("partial"), "Partly built — resume to finish");
});

test("XSS title renders as text, no img", () => {
  const hostile = "<img src=x onerror=alert(1)>";
  const a = approval({
    args: {
      title: "Plan",
      items: [{ kind: "page", key: "home", title: hostile }],
    },
  });
  const html = renderToStaticMarkup(React.createElement(ApprovalCard, { approvalId: "approval-1", approval: a }));
  assert.doesNotMatch(html, /<img/i, "no img element");
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
