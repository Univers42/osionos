// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   libraryOpen.spec.mjs                               :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// Library tab first open: click on the rail's Library icon -> the Library heading painted.
// The pointer rests on the icon first (as it does on the way to a click), which starts the
// chunk download; the measured click then finds the view loaded. Each load is fresh, so every
// sample is a first open of the session (cold for React, warm in the HTTP cache).

import { test } from "@playwright/test";

import { PERF_USE, assertBudget, bootApp, measureToPaint, summarize } from "./perfHarness.mjs";

test.use(PERF_USE);

const SPEC = "libraryOpen";
const LOADS = 6;
// Caveat: the 400ms dwell stands in for the user's pointer travel; a keyboard user who tabs
// to the icon and presses Enter at once still pays the download (focus starts the same prefetch).
const DWELL_MS = 400;
const BUDGET = { target: 20, budget: 50 };
const RAIL = { name: "Activity bar" };

test("library first open after the rail hover", async ({ page }) => {
  test.setTimeout(300_000);
  const samples = [];
  for (let load = 0; load < LOADS; load += 1) {
    await bootApp(page);
    await page.locator("[data-osio-workbench]").waitFor({ state: "visible", timeout: 60_000 });
    const tab = page.getByRole("tablist", RAIL).getByRole("tab", { name: "Library", exact: true });
    await tab.hover();
    await page.waitForTimeout(DWELL_MS);
    const stats = await measureToPaint(page, () => tab.click(), {
      runs: 1,
      warmups: 0,
      startEvent: "click",
      until: { selector: "h1", text: "Library" },
    });
    samples.push(stats.median);
    // Persisted layout would reopen the tab on the next load; close it so each sample is a first open.
    await page.getByRole("button", { name: "Close Library", exact: true }).click();
  }
  assertBudget(SPEC, "firstOpen", summarize(samples), BUDGET);
});
