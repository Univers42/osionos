// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   dockToggle.spec.mjs                                :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// Ctrl+J opens the workbench dock: keydown -> dock painted.

import { test } from "@playwright/test";

import { assertBudget, bootApp, measureFloor, measureToPaint } from "./perfHarness.mjs";

// Measured 2026-10-13: p95 30.5-32.2 ms, median 15-16 ms (floor median 21 ms); the frame phase
// makes p95 bimodal (1 or 2 frames). Target 16 missed -> budget = 32.2 x 1.2 = 39.
test("Ctrl+J dock open, workbench ON", async ({ page }) => {
  test.setTimeout(120_000);
  await bootApp(page, { workbench: true });
  await page.locator("[data-osio-workbench]").waitFor({ state: "visible", timeout: 60_000 });
  const floor = await measureFloor(page);
  const dock = page.getByTestId("workbench-dock");
  const stats = await measureToPaint(page, () => page.keyboard.press("Control+j"), {
    until: { selector: '[data-testid="workbench-dock"]' },
    before: async () => {
      if (await dock.count()) {
        await page.keyboard.press("Control+j");
        await dock.waitFor({ state: "detached" });
      }
    },
  });
  assertBudget("dockToggle", "ctrlJ.open", stats, { target: 16, budget: 39 }, { floor });
});
