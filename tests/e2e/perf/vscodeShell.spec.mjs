/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   vscodeShell.spec.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// VS Code shell keybindings: Ctrl+B keydown -> side bar painted, Alt+Left keydown -> previous page painted.
// Ponytail: the budget is floor-bound (one or two frames by phase); targets are floor + 16 ms.

import { test } from "@playwright/test";

import { createNewWorkspacePage } from "../../browser/core/app.mjs";
import { PERF_USE, assertBudget, bootApp, measureFloor, measureToPaint } from "./perfHarness.mjs";

test.use(PERF_USE);

const SIDEBAR = 'aside[aria-label="Sidebar"]';
const PANEL = `${SIDEBAR}[data-sidebar-mode="panel"]`;
const activeTabId = (page) => page.locator("[data-tab-id][data-active]").first().getAttribute("data-tab-id");

test("Ctrl+B side bar open", async ({ page }) => {
  test.setTimeout(120_000);
  await bootApp(page);
  await page.locator("body").press("Escape");
  const floor = await measureFloor(page);
  const stats = await measureToPaint(page, () => page.keyboard.press("Control+b"), {
    until: { selector: PANEL, visible: true },
    before: async () => {
      if (await page.locator(PANEL).count()) {
        await page.keyboard.press("Control+b");
        await page.locator(PANEL).waitFor({ state: "detached" });
      }
    },
  });
  assertBudget("vscodeShell", "ctrlB.open", stats, { target: floor.p95 + 16, budget: floor.p95 + 16 }, { floor });
});

test("Alt+Left previous page painted", async ({ page }) => {
  test.setTimeout(120_000);
  await bootApp(page);
  const a = await activeTabId(page);
  await createNewWorkspacePage(page);
  const b = await activeTabId(page);
  await page.locator("body").press("Escape");
  const floor = await measureFloor(page);
  const stats = await measureToPaint(page, () => page.keyboard.press("Alt+ArrowLeft"), {
    until: { selector: `[data-tab-id="${a}"][data-active]`, visible: true },
    before: async () => {
      if ((await activeTabId(page)) !== b) {
        await page.keyboard.press("Alt+ArrowRight");
        await page.locator(`[data-tab-id="${b}"][data-active]`).waitFor();
      }
    },
  });
  assertBudget("vscodeShell", "altLeft.back", stats, { target: floor.p95 + 16, budget: floor.p95 + 16 }, { floor });
});

test("maximize panel painted", async ({ page }) => {
  test.setTimeout(120_000);
  await bootApp(page);
  await page.locator("[data-osio-workbench]").waitFor({ state: "visible", timeout: 60_000 });
  const floor = await measureFloor(page);
  await page.keyboard.press("Control+j");
  const dock = page.getByTestId("workbench-dock");
  await dock.waitFor();
  const stats = await measureToPaint(page, () => dock.getByRole("button", { name: "Maximize panel size" }).click(), {
    startEvent: "click",
    until: { selector: '[data-testid="workbench-body"][data-dock-maximized="true"]' },
    before: async () => {
      if (await page.locator('[data-dock-maximized="true"]').count()) {
        await dock.getByRole("button", { name: "Restore panel size" }).click();
        await page.locator('[data-dock-maximized="true"]').waitFor({ state: "detached" });
      }
    },
  });
  assertBudget("vscodeShell", "maximize.panel", stats, { target: floor.p95 + 16, budget: floor.p95 + 16 }, { floor });
});
