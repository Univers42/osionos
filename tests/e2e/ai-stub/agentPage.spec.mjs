/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   agentPage.spec.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// An agent page, with the AI service configured, is the assistant: it talks to the service, never
// to the bridge's Claude CLI route. It lives in ai-stub/ because the service URL is a build switch
// (PLAYWRIGHT_AI_STUB), and the service is the stub host answered here.

import { expect, test } from "@playwright/test";

import { seedPages } from "../support/embedSeed.mjs";

test.use({ serviceWorkers: "block" });

const SERVER_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const AGENT_PAGE = { _id: "agent-page-1", title: "Research agent", surface: "agent", content: [] };
const AT = "2026-11-27T10:00:00.000Z";

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const ANSWER = [
  frame("run.started", { runId: RUN_ID }),
  frame("text.delta", { text: "Hello from " }),
  frame("text.delta", { text: "the service." }),
  frame("done", {}),
].join("");

/** Answers the AI host; `runs` decides what POST /runs does. Returns every URL the page asked for. */
async function stubPlatform(page, runs) {
  const seen = [];
  await page.route("**/api/agent/claude/stream", (route) => {
    seen.push("BRIDGE /api/agent/claude/stream");
    return route.fulfill({ status: 404, body: "" });
  });
  await page.route("https://ai.invalid/**", (route) => {
    const request = route.request();
    const call = `${request.method()} ${new URL(request.url()).pathname.replace("/api/ai", "")}`;
    seen.push(call);
    if (call === "POST /runs") return runs(route);
    if (call === "GET /agents") return route.fulfill({ json: [{ id: "analyst", version: 1, name: "Analyst", description: "Reads data" }] });
    if (call === "GET /conversations") return route.fulfill({ json: { conversations: [] } });
    if (call === "POST /conversations") {
      return route.fulfill({ json: { id: SERVER_ID, workspace_id: "mock-ws-private-0", title: null, model: null, created_at: AT, updated_at: AT } });
    }
    if (call === "GET /capabilities") return route.fulfill({ json: {} });
    return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
  });
  return seen;
}

async function openAgentPage(page, baseURL) {
  await seedPages(page, [AGENT_PAGE]);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  const tab = page.getByRole("tab", { name: /^Conversations/ });
  await tab.waitFor({ timeout: 20_000 });
  await tab.click();
  await page.locator('[data-sidebar-panel="conversations"]').getByRole("button", { name: "Research agent" }).click();
  const composer = page.getByPlaceholder("Ask osionos AI…");
  await expect(composer).toBeVisible({ timeout: 15_000 });
  return composer;
}

test("an agent page is the assistant: the answer streams from the service, not the bridge", async ({ page, baseURL }) => {
  const seen = await stubPlatform(page, (route) => route.fulfill({ contentType: "text/event-stream", body: ANSWER }));
  const composer = await openAgentPage(page, baseURL);

  await composer.fill("Say hello");
  await composer.press("Enter");

  await expect(page.locator('[data-role="assistant"]')).toContainText("Hello from the service.");
  expect(seen).toContain("POST /runs");
  expect(seen.filter((call) => call.startsWith("BRIDGE"))).toEqual([]);
});

test("a service that is down says what to do, and the composer stays usable", async ({ page, baseURL }) => {
  await stubPlatform(page, (route) => route.fulfill({ status: 503, contentType: "text/plain", body: "Bad Gateway" }));
  const composer = await openAgentPage(page, baseURL);

  await composer.fill("Say hello");
  await composer.press("Enter");

  const notice = page.getByTestId("run-error-text");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(/try again/i);
  await expect(notice).not.toContainText(/unknown|503/i);
  await expect(composer).toBeEnabled();
  await composer.fill("Another try");
  await expect(composer).toHaveValue("Another try");
});
