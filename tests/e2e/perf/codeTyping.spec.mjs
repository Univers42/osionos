// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   codeTyping.spec.mjs                                :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// Typing in a code page (Monaco): keydown -> painted frame.

import { test } from "@playwright/test";

import { assertBudget, bootApp, measureFloor, measureToPaint } from "./perfHarness.mjs";

// Measured 2026-10-13: p95 26 ms, median 25 ms (floor median 21 ms). Target 16 missed ->
// budget = 26 x 1.2 = 32.
test("code page typing (Monaco), workbench ON", async ({ page }) => {
  test.setTimeout(180_000); // cold Vite compile of the Monaco chunk
  await bootApp(page, { workbench: true, ide: true });
  await page.locator("[data-osio-workbench]").waitFor({ state: "visible", timeout: 60_000 });
  const floor = await measureFloor(page);
  await page.evaluate(() => globalThis.__perfOpenCodePage());
  const input = page.locator(".monaco-editor textarea").first();
  await input.waitFor({ state: "attached", timeout: 90_000 });
  await input.focus();
  const stats = await measureToPaint(page, () => page.keyboard.press("a"));
  assertBudget("codeTyping", "monaco.keypress", stats, { target: 16, budget: 32 }, { floor });
});
