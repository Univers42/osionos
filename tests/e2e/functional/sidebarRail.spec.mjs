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

import { test, expect } from "@playwright/test";

const rail = (page) => page.getByRole("tablist", { name: "Activity bar" });
const explorer = (page) => page.getByText("Explorer", { exact: true });

async function gotoExpanded(page, baseURL) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await explorer(page).waitFor(); // expanded panel, no icon column
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

test.describe("activity rail sidebar", () => {
  test.describe.configure({ mode: "serial" });

  test("expanded has no icon column; dragging narrow collapses to the icon rail", async ({ page, baseURL }) => {
    await gotoExpanded(page, baseURL);
    await expect(explorer(page)).toBeVisible();
    await expect(rail(page)).toHaveCount(0); // icons only appear when collapsed

    await dragHandleTo(page, 6);
    await expect(rail(page)).toBeVisible();
    await expect(explorer(page)).toHaveCount(0);

    // Clicking a rail icon expands to that panel.
    await page.getByRole("tab", { name: "Search" }).click();
    await expect(page.getByLabel("Search query")).toBeVisible();
    await expect(rail(page)).toHaveCount(0);
  });

  test("collapsed (rail) state persists across reload", async ({ page, baseURL }) => {
    await gotoExpanded(page, baseURL);
    await dragHandleTo(page, 6);
    await expect(rail(page)).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await rail(page).waitFor();
    await expect(explorer(page)).toHaveCount(0); // still rail-only
  });

  test("dragging the rail edge fully left hides the sidebar; the trigger reopens it", async ({ page, baseURL }) => {
    await gotoExpanded(page, baseURL);
    await dragHandleTo(page, 6); // -> rail
    await expect(rail(page)).toBeVisible();

    await dragHandleTo(page, 3); // rail edge left -> hidden
    await expect(rail(page)).toHaveCount(0);
    const trigger = page.getByRole("button", { name: "Open sidebar" });
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(explorer(page)).toBeVisible();
  });
});
