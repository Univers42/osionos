/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   templateUse.spec.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

function railHome(page) {
  return page.locator('[role="tab"][aria-label="Home"]');
}

async function openHome(page) {
  await railHome(page).click();
  await page.getByRole("menuitem", { name: "Dashboard" }).click();
  await expect(page.getByText("Featured templates")).toBeVisible();
}

async function databaseIds(page) {
  await page.waitForFunction(() => Array.from(document.querySelectorAll("[data-database-id]")).some((el) => el.getClientRects().length > 0));
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-database-id]"))
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => el.getAttribute("data-database-id")),
  );
}

async function closeHomeTab(page) {
  const close = page.getByRole("button", { name: "Close Home" });
  if (await close.isVisible().catch(() => false)) {
    await close.click();
  }
}

async function useStudentDashboard(page) {
  await openHome(page);
  await page.getByText("Featured templates").scrollIntoViewIfNeeded();
  const templatesBlock = page.locator('[data-database-id="home-templates"]');
  await templatesBlock.getByText("Student Dashboard").first().click();
  await page.getByRole("button", { name: "Use template" }).click();
  await expect(page.getByRole("textbox", { name: "Page title" })).toHaveValue("Student Dashboard");
  await closeHomeTab(page);
}

test.describe("template use from Home", () => {
  test("uses Student Dashboard with its own databases that persist", async ({ page, baseURL }) => {
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await useStudentDashboard(page);

    const firstIds = await databaseIds(page);
    expect(firstIds.length).toBeGreaterThan(0);
    for (const id of firstIds) {
      expect(id).toMatch(/^db-/);
      expect(id).not.toBe("db-tasks");
      expect(id).not.toBe("db-events");
    }
    await expect(page.getByText("Write Integration Tests")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("textbox", { name: "Page title" })).toHaveValue("Student Dashboard");
    await closeHomeTab(page);
    const reloadedIds = await databaseIds(page);
    expect(reloadedIds).toEqual(firstIds);

    await useStudentDashboard(page);
    const secondIds = await databaseIds(page);
    expect(secondIds).not.toEqual(firstIds);
  });
});