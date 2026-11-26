/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   topBarMenu.spec.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The title-bar menus: open File, hover-switch File to Edit, move between rows,
// open the agent menu. Budget = the method's own floor p95 + 20 ms, and the
// median may exceed the floor median by at most 20 ms.

import { expect, test } from "@playwright/test";

import { PERF_USE, assertBudget, bootApp, measureFloor, measureToPaint } from "./perfHarness.mjs";

test.use(PERF_USE);

const SPEC = "topBarMenu";
const TARGET = 16;
const OVER_FLOOR_MEDIAN_MS = 20;

const trigger = (page, name) => page.getByTestId("app-topbar").getByRole("button", { name, exact: true });

async function closeAnyMenu(page) {
  if (await page.getByRole("menu").count()) {
    await page.keyboard.press("Escape");
    await page.getByRole("menu").waitFor({ state: "detached" });
  }
}

async function centerOf(locator) {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function judge(page, caseName, stats, floor) {
  assertBudget(SPEC, caseName, stats, { target: TARGET, budget: floor.p95 + 20 }, { floor });
  expect(stats.median - floor.median, `${SPEC} / ${caseName}: median over floor`).toBeLessThanOrEqual(OVER_FLOOR_MEDIAN_MS);
}

async function boot(page) {
  await bootApp(page);
  await page.getByTestId("app-topbar").waitFor({ state: "visible", timeout: 60_000 });
  return measureFloor(page);
}

test.describe("title-bar menu latency", () => {
  test("open File with ArrowDown", async ({ page }) => {
    test.setTimeout(120_000);
    const floor = await boot(page);
    const stats = await measureToPaint(page, () => page.keyboard.press("ArrowDown"), {
      until: { selector: '[role="menu"]', text: "New page" },
      before: async () => { await closeAnyMenu(page); await trigger(page, "File").focus(); },
    });
    await judge(page, "file.open", stats, floor);
  });

  test("hover-switch File to Edit", async ({ page }) => {
    test.setTimeout(120_000);
    const floor = await boot(page);
    const file = await centerOf(trigger(page, "File"));
    const edit = await centerOf(trigger(page, "Edit"));
    const stats = await measureToPaint(page, () => page.mouse.move(edit.x, edit.y), {
      startEvent: "pointermove",
      until: { selector: '[role="menu"]', text: "Undo" },
      before: async () => {
        await closeAnyMenu(page);
        await page.mouse.move(file.x, file.y);
        await trigger(page, "File").click();
        await page.getByRole("menu").waitFor();
      },
    });
    await judge(page, "hover.file-to-edit", stats, floor);
  });

  test("ArrowDown moves between rows", async ({ page }) => {
    test.setTimeout(120_000);
    const floor = await boot(page);
    const stats = await measureToPaint(page, () => page.keyboard.press("ArrowDown"), {
      until: { selector: '[data-menu-label="New folder"]:focus' },
      before: async () => {
        await closeAnyMenu(page);
        await trigger(page, "File").focus();
        await page.keyboard.press("ArrowDown");
        await page.getByRole("menuitem", { name: "New page" }).waitFor();
      },
    });
    await judge(page, "row.arrow-down", stats, floor);
  });

  test("open the agent menu with ArrowDown", async ({ page }) => {
    test.setTimeout(120_000);
    const floor = await boot(page);
    const stats = await measureToPaint(page, () => page.keyboard.press("ArrowDown"), {
      until: { selector: '[role="menu"]', text: "AI hub" },
      before: async () => { await closeAnyMenu(page); await trigger(page, "Choose an agent").focus(); },
    });
    await judge(page, "agent.open", stats, floor);
  });
});
