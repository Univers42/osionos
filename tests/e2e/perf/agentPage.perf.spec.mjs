/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   agentPage.perf.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// One key typed in the composer of an agent page (the assistant), input -> painted. It needs the
// AI service build switch, so it runs only with PLAYWRIGHT_AI_STUB=1 (playwright.config.ts).
// Target: p95 <= floor + 16 ms, the floor being the method's own cost on an unhandled key.

import { expect, test } from "@playwright/test";

import { seedPages } from "../support/embedSeed.mjs";
import { PERF_USE, assertBudget, bootApp, measureFloor, measureToPaint } from "./perfHarness.mjs";

test.use({ ...PERF_USE, serviceWorkers: "block" });

const SPEC = "agentPage";
const OVER_FLOOR_MS = 16;

async function openAgentComposer(page) {
  await page.route("https://ai.invalid/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/ai", "");
    if (path === "/agents") return route.fulfill({ json: [] });
    if (path === "/conversations") return route.fulfill({ json: { conversations: [] } });
    return route.fulfill({ json: {} });
  });
  await seedPages(page, [{ _id: "agent-page-1", title: "Research agent", surface: "agent", content: [] }]);
  await bootApp(page);
  await page.getByRole("tab", { name: /^Conversations/ }).click();
  await page.locator('[data-sidebar-panel="conversations"]').getByRole("button", { name: "Research agent" }).click();
  const composer = page.getByPlaceholder("Ask osionos AI…");
  await composer.waitFor({ timeout: 15_000 });
  await composer.click();
  return composer;
}

test("typing one key in the agent page composer", async ({ page }) => {
  const composer = await openAgentComposer(page);
  const floor = await measureFloor(page);
  await composer.click();
  const stats = await measureToPaint(page, () => page.keyboard.press("a"));
  expect((await composer.inputValue()).length).toBeGreaterThan(0);
  assertBudget(SPEC, "composer key", stats, { target: floor.p95 + OVER_FLOOR_MS, budget: floor.p95 + OVER_FLOOR_MS }, { floor });
});
