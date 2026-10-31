/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiPlanProgress.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The build-plan approval card follows the build item by item (#79), in a browser: while the
// decision request is held the card reads the approval again and counts the items created;
// when the request answers it reads once more and marks each item. The service is the stub
// host of PLAYWRIGHT_AI_STUB, answered here.

import { expect, test } from "@playwright/test";

const APPROVAL_ID = "approval-1";
const CHAT_KEY = "osionos.chat.v1";
const CONVERSATION_ID = "conv-plan-progress";
const TITLE = "Plan progress chat";

const ITEMS = [
  { kind: "page", key: "home", title: "Home", children: [{ kind: "page", key: "notes", title: "Notes" }] },
  { kind: "database", key: "deals", title: "Deals" },
];

const progressOf = (home, notes, deals) => [
  { key: "home", kind: "page", status: home },
  { key: "notes", kind: "page", status: notes },
  { key: "deals", kind: "database", status: deals },
];

// What the card reads, in order: before the decision, while it builds, after it answered.
const WHILE_BUILDING = [
  progressOf("done", "pending", "pending"),
  progressOf("done", "done", "pending"),
];
const AFTER = progressOf("done", "done", "failed");

const description = (status, progress) => ({
  approvalId: APPROVAL_ID,
  tool: "build_plan",
  verb: "Build a workspace plan",
  status,
  target: { title: "Plan", workspaceId: "ws-1", workspaceName: "Workspace" },
  args: { items: ITEMS },
  preview: { unit: "none", count: 0 },
  approvedInRun: 0,
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  createdAt: new Date().toISOString(),
  ...(progress ? { progress } : {}),
});

/** The stored chat: one conversation whose assistant message carries the plan's permission part. */
function seedChat() {
  const at = new Date().toISOString();
  return {
    conversations: [{ id: CONVERSATION_ID, projectId: null, title: TITLE, createdAt: at, updatedAt: at }],
    messages: [
      { id: "m-user", conversationId: CONVERSATION_ID, role: "user", content: "Plan my workspace", createdAt: at, status: "done" },
      {
        id: "m-assistant", conversationId: CONVERSATION_ID, role: "assistant", content: "Here is the plan.", createdAt: at, status: "done",
        parts: [{ type: "permission", approvalId: APPROVAL_ID, tool: "build_plan" }],
      },
    ],
  };
}

/** Answers the AI host: the approval (progress advancing per read while the POST is held) and the POST itself. */
async function stubService(page) {
  let decided = false;
  let building = 0;
  let released = false;
  let open;
  const held = new Promise((resolve) => { open = resolve; });
  const release = { now: () => { released = true; open(); } };
  await page.route("https://ai.invalid/**", async (route) => {
    const request = route.request();
    if (!new URL(request.url()).pathname.endsWith(`/approvals/${APPROVAL_ID}`)) {
      return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
    }
    if (request.method() === "POST") {
      decided = true;
      await held;
      return route.fulfill({
        json: { ok: true, approvalId: APPROVAL_ID, status: "partial", result: { counts: { pages: 2, databases: 0 } }, error: null, continuationRunId: null },
      });
    }
    if (!decided) return route.fulfill({ json: description("pending") });
    if (released) return route.fulfill({ json: description("partial", AFTER) });
    const progress = WHILE_BUILDING[Math.min(building, WHILE_BUILDING.length - 1)];
    building += 1;
    return route.fulfill({ json: description("executing", progress) });
  });
  return release;
}

async function openSeededChat(page) {
  await page.getByRole("tab", { name: /^Conversations/ }).click();
  await page.locator('[data-sidebar-panel="conversations"]').getByRole("button", { name: TITLE }).first().click();
}

test("the plan card counts the items created while the decision runs, then marks each one", async ({ page, baseURL }, testInfo) => {
  await page.addInitScript(([key, chat]) => localStorage.setItem(key, JSON.stringify(chat)), [CHAT_KEY, seedChat()]);
  const release = await stubService(page);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await openSeededChat(page);

  const card = page.getByTestId("chat-approval-card");
  await expect(card).toHaveAttribute("data-status", "pending");
  await expect(card.locator("li[data-plan-item]")).toHaveCount(3);

  await card.getByRole("button", { name: "Approve this write" }).click();
  // The decision request is still held: these words can only come from the polling.
  await expect(card.getByTestId("approval-state")).toHaveText(/Building: [12] of 3 created/);
  await card.screenshot({ path: testInfo.outputPath("plan-building.png") });

  release.now();
  await expect(card).toHaveAttribute("data-status", "partial");
  await expect(card.locator('li[data-plan-item="home"]')).toHaveAttribute("data-item-state", "done");
  await expect(card.locator('li[data-plan-item="deals"]')).toHaveAttribute("data-item-state", "failed");
  await expect(card.locator('li[data-plan-item="home"]')).toContainText("created");
  await expect(card.locator('li[data-plan-item="deals"]')).toContainText("failed");
  await card.screenshot({ path: testInfo.outputPath("plan-built.png") });
});
