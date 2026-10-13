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

import { PERF_USE, assertBudget, bootApp, measureFloor, measureToPaint } from "./perfHarness.mjs";

test.use(PERF_USE);

// Measured 2026-10-13, tracing off: p95 31.3-31.9 ms, median 30.9-31.5 ms (floor median
// 31.0-31.5 ms: on the floor). Target 16 missed by method -> budget = 31.9 x 1.2 = 38.
test("code page typing (Monaco)", async ({ page }) => {
  test.setTimeout(180_000); // cold Vite compile of the Monaco chunk
  await bootApp(page);
  await page.locator("[data-osio-workbench]").waitFor({ state: "visible", timeout: 60_000 });
  const floor = await measureFloor(page);
  await page.evaluate(() => globalThis.__perfOpenCodePage());
  const input = page.locator(".monaco-editor textarea").first();
  await input.waitFor({ state: "attached", timeout: 90_000 });
  await input.focus();
  const stats = await measureToPaint(page, () => page.keyboard.press("a"));
  assertBudget("codeTyping", "monaco.keypress", stats, { target: 16, budget: 38 }, { floor });
});
