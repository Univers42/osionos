// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   railPanels.spec.mjs                                :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// Rail panel switch (Explorer <-> Source Control <-> Problems): click -> panel title painted.
// First open pays the lazy chunk; it can only be sampled once per page load, so it is
// FIRST_OPEN_LOADS fresh loads per panel (each sample cold for the chunk, warm in the HTTP cache).

import { test } from "@playwright/test";

import { PERF_USE, assertBudget, bootApp, measureFloor, measureToPaint, summarize } from "./perfHarness.mjs";

test.use(PERF_USE);

const SPEC = "railPanels";
const PANELS = ["Source Control", "Problems"];
const FIRST_OPEN_LOADS = 8;
// Measured 2026-10-13 (p95): first open 29.8-31.9 ms over 8 loads (target 50 -> PASS, budget =
// target as 2x would exceed it); re-open 22.7-24.1 ms vs target 16 (floor median 21 ms).
// Re-measured 2026-10-14 (production build, one worker): re-open p95 31.3 ms, median 30.8 ms =
// the floor median 30.8 ms, i.e. no work above the frame floor (an opened panel stays mounted and
// a re-open only unhides it). 29 sat below this host's floor; budget = 31.3 x 1.2 = 38, the
// method codeTyping and dockToggle use for floor-bound cases.
const BUDGET = { firstOpen: 50, reopen: 38 };
const RAIL = { name: "Activity bar" };

async function collapseToRail(page) {
  const collapse = page.getByRole("button", { name: "Collapse to rail" });
  if (await collapse.count()) await collapse.click();
  await page.getByRole("tablist", RAIL).waitFor({ state: "visible" });
}

async function openOnce(page, name) {
  const tab = page.getByRole("tablist", RAIL).getByRole("tab", { name, exact: true });
  return measureToPaint(page, () => tab.click(), {
    runs: 1,
    warmups: 0,
    startEvent: "click",
    until: { selector: "span.uppercase", text: name },
  });
}

test("rail first open (lazy chunk) per panel", async ({ page }) => {
  test.setTimeout(300_000);
  const samples = Object.fromEntries(PANELS.map((name) => [name, []]));
  for (let load = 0; load < FIRST_OPEN_LOADS; load += 1) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("ui-storage", JSON.stringify({ state: { activePanel: "explorer" }, version: 1 }));
      } catch { /* ignore */ }
    });
    await bootApp(page);
    await page.locator("[data-osio-workbench]").waitFor({ state: "visible", timeout: 60_000 });
    await collapseToRail(page);
    for (const name of PANELS) {
      samples[name].push((await openOnce(page, name)).median);
      await collapseToRail(page);
    }
  }
  for (const name of PANELS) {
    assertBudget(SPEC, `firstOpen.${name}`, summarize(samples[name]), { target: 50, budget: BUDGET.firstOpen });
  }
});

test("rail re-open (chunk loaded) per panel", async ({ page }) => {
  test.setTimeout(180_000);
  await bootApp(page);
  await page.locator("[data-osio-workbench]").waitFor({ state: "visible", timeout: 60_000 });
  const floor = await measureFloor(page);
  await collapseToRail(page);
  for (const name of PANELS) {
    await collapseToRail(page);
    await openOnce(page, name); // loads the chunk
    await collapseToRail(page);
    const tab = page.getByRole("tablist", RAIL).getByRole("tab", { name, exact: true });
    const stats = await measureToPaint(page, () => tab.click(), {
      startEvent: "click",
      until: { selector: "span.uppercase", text: name },
      before: async () => collapseToRail(page),
    });
    assertBudget(SPEC, `reopen.${name}`, stats, { target: 16, budget: BUDGET.reopen }, { floor });
  }
});
