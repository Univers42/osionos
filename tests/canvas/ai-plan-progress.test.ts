import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { setApprovalTransport, type ApprovalDescription, type PlanItemProgress } from "@/features/chat/model/approvals";
import { followPlanProgress, planProgressWords } from "@/features/chat/model/planProgress";
import { ApprovalCard } from "@/features/chat/ui/ApprovalCard";

// #79: while the decision request builds a plan, the card reads each item's state.

const item = (key: string, kind: string, status: string): PlanItemProgress => ({ key, kind, status });

test("planProgressWords counts what is created, and says what failed", () => {
  assert.equal(planProgressWords(undefined), "");
  assert.equal(planProgressWords([item("a", "page", "pending"), item("b", "page", "pending")]), "Building: 0 of 2 created");
  assert.equal(planProgressWords([item("a", "page", "done"), item("b", "database", "pending")]), "Building: 1 of 2 created");
  assert.equal(
    planProgressWords([item("a", "page", "done"), item("b", "page", "failed"), item("c", "page", "skipped")]),
    "Building: 1 of 3 created, 1 failed",
  );
});

test("followPlanProgress hands each read to the card until it is stopped", async () => {
  const reads = [
    [item("home", "page", "done"), item("deals", "database", "pending")],
    [item("home", "page", "done"), item("deals", "database", "done")],
  ];
  let served = 0;
  setApprovalTransport(async (input, init) => {
    assert.equal(init?.method, "GET");
    assert.match(String(input), /\/approvals\/approval-1$/);
    const progress = reads[Math.min(served++, reads.length - 1)];
    return new Response(JSON.stringify({ approvalId: "approval-1", progress }), { status: 200 });
  });
  const seen: (PlanItemProgress[] | undefined)[] = [];
  const stop = followPlanProgress("approval-1", (progress) => seen.push(progress), 5);
  // Waits for the reads, not for a fixed time: a slow CI runner fit one 5 ms poll into 60 ms.
  for (let waited = 0; seen.length < reads.length && waited < 2000; waited += 5) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  stop();
  const after = seen.length;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(seen.slice(0, 2), reads);
  assert.equal(seen.length, after, "nothing is handed over once stopped");
});

test("followPlanProgress keeps going past a failed read", async () => {
  let served = 0;
  setApprovalTransport(async () => {
    served += 1;
    if (served === 1) return new Response("{}", { status: 503 });
    return new Response(JSON.stringify({ progress: [item("home", "page", "done")] }), { status: 200 });
  });
  const seen: unknown[] = [];
  const stop = followPlanProgress("approval-1", (progress) => seen.push(progress), 5);
  for (let waited = 0; seen.length === 0 && waited < 2000; waited += 5) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  stop();
  assert.ok(seen.length > 0, "a 503 does not end the follow");
});

test("the plan card marks each item with its recorded state", () => {
  const approval: ApprovalDescription = {
    approvalId: "approval-1",
    tool: "build_plan",
    verb: "Build a plan",
    status: "partial",
    target: { title: "Plan", workspaceId: "workspace-1", workspaceName: "Marketing" },
    args: { items: [{ kind: "page", key: "home", title: "Home" }, { kind: "database", key: "deals", title: "Deals" }] },
    preview: { unit: "none", count: 0 },
    approvedInRun: 0,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    progress: [item("home", "page", "done"), item("deals", "database", "failed")],
  };
  const html = renderToStaticMarkup(React.createElement(ApprovalCard, { approvalId: "approval-1", approval }));
  assert.match(html, /data-plan-item="home"[^>]*data-item-state="done"/);
  assert.match(html, /data-plan-item="deals"[^>]*data-item-state="failed"/);
  assert.match(html, /Home[\s\S]*created[\s\S]*Deals[\s\S]*failed/);
});
