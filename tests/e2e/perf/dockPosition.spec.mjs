// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   dockPosition.spec.mjs                              :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// The movable panel: open the position menu, choose Right, and take one splitter step on the
// side. Each case is timed to the painted frame and judged against the method's own floor.

import { expect, test } from "@playwright/test";

import { PERF_USE, assertBudget, bootApp, measureFloor, measureToPaint } from "./perfHarness.mjs";

test.use(PERF_USE);

const SPEC = "dockPosition";
const MENU = '[role="menu"][aria-label="Panel position"]';
// Over the floor, the app may add at most this much: p95 against floor p95 and median against floor median.
const OVER_FLOOR_MS = 20;

async function bootWithDock(page) {
  await bootApp(page);
  await page.locator("[data-osio-workbench]").waitFor({ state: "visible", timeout: 60_000 });
  const floor = await measureFloor(page);
  await page.keyboard.press("Control+j");
  await page.getByTestId("workbench-dock").waitFor();
  return floor;
}

function judge(caseName, stats, floor) {
  assertBudget(SPEC, caseName, stats, { target: 16, budget: floor.p95 + OVER_FLOOR_MS }, { floor });
  expect(stats.median - floor.median, `${SPEC} / ${caseName}: median ${stats.median.toFixed(1)} ms over floor median ${floor.median.toFixed(1)} ms`).toBeLessThanOrEqual(OVER_FLOOR_MS);
}

const buttonOf = (page) => page.getByTestId("workbench-dock").getByRole("button", { name: "Panel position" });
const bodyOf = (page) => page.getByTestId("workbench-body");

async function closeMenu(page) {
  if (await page.locator(MENU).count()) {
    await page.keyboard.press("Escape");
    await page.locator(MENU).waitFor({ state: "detached" });
  }
}

async function openMenu(page) {
  await buttonOf(page).click();
  await page.locator(MENU).waitFor();
}

async function placeAt(page, label) {
  if ((await bodyOf(page).getAttribute("data-dock-position")) === label.toLowerCase()) return;
  await closeMenu(page);
  await openMenu(page);
  await page.getByRole("menuitemradio", { name: label, exact: true }).click();
  await expect(bodyOf(page)).toHaveAttribute("data-dock-position", label.toLowerCase());
}

test("position menu opens", async ({ page }) => {
  test.setTimeout(180_000);
  const floor = await bootWithDock(page);
  const stats = await measureToPaint(page, () => buttonOf(page).click(), {
    startEvent: "click",
    until: { selector: MENU },
    before: async () => closeMenu(page),
  });
  judge("menu.open", stats, floor);
});

test("choosing Right moves the dock", async ({ page }) => {
  test.setTimeout(180_000);
  const floor = await bootWithDock(page);
  const right = page.getByRole("menuitemradio", { name: "Right", exact: true });
  const stats = await measureToPaint(page, () => right.click(), {
    startEvent: "click",
    until: { selector: '[data-dock-position="right"]' },
    before: async () => {
      await placeAt(page, "Bottom");
      await openMenu(page);
    },
  });
  judge("choose.right", stats, floor);
});

test("one splitter step on the right", async ({ page }) => {
  test.setTimeout(180_000);
  const floor = await bootWithDock(page);
  await placeAt(page, "Right");
  const bar = page.getByTestId("dock-splitter");
  await bar.focus();
  const stats = await measureToPaint(page, () => page.keyboard.press("ArrowLeft"), {
    until: { selector: '[data-testid="dock-splitter"][aria-valuenow="256"]' },
    before: async () => {
      await page.keyboard.press("Home");
      await expect(bar).toHaveAttribute("aria-valuenow", "240");
    },
  });
  judge("splitter.step", stats, floor);
});
