/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   agentConversation.perf.spec.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// One key typed in the composer of the Claude agent page (shown when no AI service is configured),
// input -> painted. It is in the default project: the page needs no AI service build switch.
// Target: p95 <= floor + 16 ms, the floor being the method's own cost on an unhandled key.

import { expect, test } from "@playwright/test";

import { seedPages } from "../support/embedSeed.mjs";
import { PERF_USE, assertBudget, bootApp, measureFloor, measureToPaint } from "./perfHarness.mjs";

test.use({ ...PERF_USE, serviceWorkers: "block" });

const SPEC = "agentConversation";
const OVER_FLOOR_MS = 16;

async function openAgentComposer(page) {
  await seedPages(page, [{ _id: "agent-page-1", title: "Research agent", surface: "agent", content: [] }]);
  await bootApp(page);
  await page.getByRole("tab", { name: /^Conversations/ }).click();
  await page.locator('[data-sidebar-panel="conversations"]').getByRole("button", { name: "Research agent" }).click();
  const composer = page.getByRole("textbox", { name: "Message Claude" });
  await composer.waitFor({ timeout: 15_000 });
  await composer.click();
  return composer;
}

test("typing one key in the agent conversation composer", async ({ page }) => {
  const composer = await openAgentComposer(page);
  const floor = await measureFloor(page);
  await composer.click();
  const stats = await measureToPaint(page, () => page.keyboard.press("a"));
  expect((await composer.inputValue()).length).toBeGreaterThan(0);
  assertBudget(SPEC, "composer key", stats, { target: floor.p95 + OVER_FLOOR_MS, budget: floor.p95 + OVER_FLOOR_MS }, { floor });
});
