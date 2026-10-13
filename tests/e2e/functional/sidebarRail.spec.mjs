/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sidebarRail.spec.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The left sidebar: the activity rail is always there when docked, with the
// panel beside it; one click switches panel; the active icon folds the panel.
// Ctrl+Alt+B hides it fully, and then nothing floats over the content: resting
// the pointer on the left edge slides it in, the pin docks it again.

import { test, expect } from "@playwright/test";

const rail = (page) => page.getByRole("tablist", { name: "Activity bar" });
const explorer = (page) => page.getByText("Explorer", { exact: true });
const peek = (page) => page.locator("[data-sidebar-peek]");

async function gotoDocked(page, baseURL) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await explorer(page).waitFor();
}

async function dragHandleTo(page, toX) {
  const handle = page.getByRole("separator", { name: "Resize sidebar" });
  const box = await handle.boundingBox();
  if (!box) throw new Error("resize handle not found");
  const y = box.y + Math.min(80, box.height / 2);
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(toX, y, { steps: 12 });
  await page.mouse.up();
}

async function hideSidebar(page) {
  await page.locator("main").click({ position: { x: 400, y: 300 } });
  await page.keyboard.press("Control+Alt+b");
  await expect(page.locator('aside[data-sidebar-mode]:not([data-sidebar-mode="peek"])')).toHaveCount(0);
}

test.describe("activity rail sidebar", () => {
  test("the rail sits beside the panel, and one click switches panel", async ({ page, baseURL }) => {
    await gotoDocked(page, baseURL);
    await expect(rail(page)).toBeVisible();
    await page.getByRole("tab", { name: /^Search/ }).click();
    await expect(page.getByLabel("Search query")).toBeVisible();
    await expect(rail(page)).toBeVisible();
    await page.getByRole("tab", { name: /^Explorer/ }).click();
    await expect(explorer(page)).toBeVisible();
  });

  test("clicking the active icon folds the panel to the rail; the fold survives a reload", async ({ page, baseURL }) => {
    await gotoDocked(page, baseURL);
    await page.getByRole("tab", { name: /^Explorer/, selected: true }).click();
    await expect(explorer(page)).toBeHidden();
    await expect(rail(page)).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await rail(page).waitFor();
    await expect(explorer(page)).toBeHidden();
  });

  test("dragging the edge narrow folds to the rail; dragging the rail edge left hides it", async ({ page, baseURL }) => {
    await gotoDocked(page, baseURL);
    await dragHandleTo(page, 70);
    await expect(explorer(page)).toBeHidden();
    await expect(rail(page)).toBeVisible();
    await dragHandleTo(page, 3);
    // Only the (closed) edge peek is left, no docked sidebar.
    await expect(page.locator('aside[data-sidebar-mode]:not([data-sidebar-mode="peek"])')).toHaveCount(0);
    await expect(peek(page)).not.toHaveAttribute("data-open", "");
  });

  test("Ctrl+Alt+B hides and restores; nothing floats over the content, and the top bar has no toggle", async ({ page, baseURL }) => {
    await gotoDocked(page, baseURL);
    await expect(page.getByTestId("app-topbar").getByRole("button", { name: "Toggle sidebar" })).toHaveCount(0);
    await hideSidebar(page);
    await expect(page.getByRole("button", { name: "Open sidebar" })).toHaveCount(0);
    await page.keyboard.press("Control+Alt+b");
    await expect(explorer(page)).toBeVisible();
  });

  test("resting on the left edge peeks the sidebar in; passing by does not; the pin docks it", async ({ page, baseURL }) => {
    await gotoDocked(page, baseURL);
    await hideSidebar(page);
    const y = 400;

    // Passing through the edge quickly, or hovering 40px in, reveals nothing.
    await page.mouse.move(3, y);
    await page.mouse.move(300, y);
    await page.waitForTimeout(400);
    await expect(peek(page)).not.toHaveAttribute("data-open", "");
    await page.mouse.move(40, y);
    await page.waitForTimeout(400);
    await expect(peek(page)).not.toHaveAttribute("data-open", "");

    // Resting on it does.
    await page.mouse.move(3, y);
    await expect(peek(page)).toHaveAttribute("data-open", "");
    await expect(peek(page).getByText("Explorer", { exact: true })).toBeVisible();

    // Leaving it slides it away.
    await page.mouse.move(900, y);
    await expect(peek(page)).not.toHaveAttribute("data-open", "");

    // The pin docks it again.
    await page.mouse.move(3, y);
    await expect(peek(page)).toHaveAttribute("data-open", "");
    await peek(page).getByRole("button", { name: "Keep the sidebar open" }).click();
    await expect(peek(page)).toHaveCount(0);
    await expect(explorer(page)).toBeVisible();
  });
});
