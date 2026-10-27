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

    // Add a row that belongs only to this page's Assignments database.
    const uniqueTitle = `Private assignment ${Date.now()}`;
    const assignmentsBlock = page.locator(`[data-database-id="${firstIds[0]}"]`).first();
    await assignmentsBlock.getByRole("button", { name: "New", exact: true }).first().click({ force: true });
    const titleBox = page.locator("aside[data-open-in]").getByRole("textbox", { name: "Page title" });
    await titleBox.waitFor({ state: "visible", timeout: 10_000 });
    await titleBox.fill(uniqueTitle);
    await page.locator('aside[data-open-in] button').filter({ hasText: /^Close$/ }).first().click();
    await expect(assignmentsBlock.getByText(uniqueTitle)).toBeVisible();

    await page.reload();
    await expect(page.getByRole("textbox", { name: "Page title" })).toHaveValue("Student Dashboard");
    await closeHomeTab(page);
    const reloadedIds = await databaseIds(page);
    expect(reloadedIds).toEqual(firstIds);
    await expect(assignmentsBlock.getByText(uniqueTitle)).toBeVisible();

    const closeFirstPage = page.getByRole("button", { name: /Close Student Dashboard/ });
    if (await closeFirstPage.count()) await closeFirstPage.first().click();
    await useStudentDashboard(page);
    const secondIds = await databaseIds(page);
    for (const id of secondIds) {
      expect(firstIds).not.toContain(id);
    }
    await expect(page.getByText(uniqueTitle)).toHaveCount(0);
  });
});