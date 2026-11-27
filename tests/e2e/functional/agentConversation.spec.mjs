/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   agentConversation.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// The Claude agent page an `agent` page shows when no AI service is configured: the chat
// family's look and behaviour, against a stubbed Claude stream. No UI creates an `agent`
// page, so the page is seeded and opened from the rail's Conversations panel, as the person does.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { seedPages } from "../support/embedSeed.mjs";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const STREAM = "**/api/agent/claude/stream";
const REPLY = "Hello from the stub.";

const SSE_BODY = [
  ["delta", { text: REPLY }],
  ["tool", { id: "tool-1", name: "osionos_search", input: { query: "plans" } }],
  ["tool_result", { toolUseId: "tool-1", text: "Found 2 pages" }],
].map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");

/** Answers the stream once `release()` is called; every other non-GET request is aborted. */
async function stubClaude(page) {
  let release = () => {};
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/*", (route) => (route.request().method() === "GET" ? route.fallback() : route.abort()));
  await page.route(STREAM, async (route) => {
    await gate;
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: SSE_BODY });
  });
  return release;
}

async function openAgentPage(page) {
  await seedPages(page, [{ _id: "agent-page-1", title: "Research agent", surface: "agent", content: [] }]);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: /^Conversations/ }).click();
  await page.locator('[data-sidebar-panel="conversations"]').getByRole("button", { name: "Research agent" }).click();
  const region = page.getByRole("region", { name: "Agent conversation" });
  await expect(region).toBeVisible({ timeout: 15_000 });
  return region;
}

async function violationsIn(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).include('[aria-label="Agent conversation"]').analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

test("the draft starts empty, the prompt is the placeholder, and Shift+Enter writes a new line", async ({ page }) => {
  const region = await openAgentPage(page);
  const composer = region.getByRole("textbox", { name: "Message Claude" });
  await expect(composer).toHaveValue("");
  await expect(composer).toHaveAttribute("placeholder", /Ask Claude anything/);
  await composer.fill("one");
  await composer.press("Shift+Enter");
  await composer.pressSequentially("two");
  await expect(composer).toHaveValue("one\ntwo");
});

test("Enter sends: a right-aligned bubble, a typing status, then the answer and one tool row", async ({ page }) => {
  const release = await stubClaude(page);
  const region = await openAgentPage(page);
  const composer = region.getByRole("textbox", { name: "Message Claude" });
  await composer.fill("Find my plans");
  await composer.press("Enter");

  const bubble = region.locator('[data-role="user"]');
  await expect(bubble).toContainText("Find my plans");
  const [box, column] = await Promise.all([bubble.boundingBox(), region.locator("article").first().boundingBox()]);
  expect(box.x + box.width / 2).toBeGreaterThan(column.x + column.width / 2);
  await expect(composer).toHaveValue("");

  await expect(region.getByRole("status")).toContainText("Claude is writing");
  release();
  await expect(region.getByRole("status")).toHaveCount(0);
  await expect(region.getByText(REPLY)).toBeVisible();
  const rows = region.locator("[data-agent-tool]");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("osionos_search");
  await expect(rows.first()).toContainText("complete");
  await rows.first().locator("summary").click();
  await expect(rows.first()).toContainText("Found 2 pages");
});

test("Enter during a run sends nothing, and the thread survives a reload", async ({ page }) => {
  const release = await stubClaude(page);
  const region = await openAgentPage(page);
  const composer = region.getByRole("textbox", { name: "Message Claude" });
  await composer.fill("Find my plans");
  await composer.press("Enter");
  await expect(region.getByRole("status")).toContainText("Claude is writing");
  await composer.fill("Second question");
  await composer.press("Enter");
  await expect(region.locator('[data-role="user"]')).toHaveCount(1);
  await expect(composer).toHaveValue("Second question");
  release();
  await expect(region.getByText(REPLY)).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  const reloaded = page.getByRole("region", { name: "Agent conversation" });
  await expect(reloaded).toBeVisible({ timeout: 15_000 });
  await expect(reloaded.locator('[data-role="user"]')).toContainText("Find my plans");
  await expect(reloaded.getByText(REPLY)).toBeVisible();
});

test("the Tools disclosure and a tool chip report their state", async ({ page }) => {
  const region = await openAgentPage(page);
  const disclosure = region.getByRole("button", { name: /^Tools · 8 of 9/ });
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  const archive = region.locator('[data-agent-tool-toggle="archive"]');
  await expect(archive).toHaveAttribute("aria-pressed", "false");
  await archive.click();
  await expect(archive).toHaveAttribute("aria-pressed", "true");
  await expect(region.getByRole("button", { name: /^Tools · 9 of 9/ })).toBeVisible();
});

for (const theme of ["light", "dark"]) {
  test(`axe finds nothing on the conversation in ${theme}`, async ({ page }) => {
    const release = await stubClaude(page);
    const region = await openAgentPage(page);
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await region.getByRole("button", { name: /^Tools · / }).click();
    const composer = region.getByRole("textbox", { name: "Message Claude" });
    await composer.fill("Find my plans");
    await composer.press("Enter");
    release();
    await expect(region.locator("[data-agent-tool]")).toHaveCount(1);
    expect(await violationsIn(page)).toEqual([]);
  });
}
