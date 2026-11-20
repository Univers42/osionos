/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   galleryUseTemplate.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor, openFreshPage, openSlashMenuFromEditor, slashCommandEntry,
} from "../../browser/core/app.mjs";

function railHome(page) {
  return page.locator('[role="tab"][aria-label="Home"]');
}

async function openHome(page) {
  await railHome(page).click();
  await page.getByRole("menuitem", { name: "Dashboard" }).click();
  await expect(page.getByText("Featured templates")).toBeVisible();
}

// Kept tabs stay mounted under `inert`: only the active tab's blocks count.
async function visibleDatabaseIds(page) {
  const visible = () => Array.from(document.querySelectorAll("[data-database-id]"))
    .filter((el) => !el.closest("[inert]") && el.checkVisibility())
    .map((el) => el.getAttribute("data-database-id"));
  await page.waitForFunction(() => Array.from(document.querySelectorAll("[data-database-id]"))
    .some((el) => !el.closest("[inert]") && el.checkVisibility()));
  return page.evaluate(visible);
}

const visibleTemplates = (page) => page.locator('[data-database-id="home-templates"]:visible');

async function blockIdOf(block) {
  return block.evaluate((el) => el.closest("[data-draggable-block-id]")?.getAttribute("data-draggable-block-id"));
}

async function insertInlineGallery(page, baseURL) {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await openSlashMenuFromEditor(editor, "/database");
  await slashCommandEntry(page, "Database - Inline").click();
  const block = page.locator(".osionos-database-block--inline").first();
  await block.waitFor({ timeout: 15_000 });
  await block.hover();
  await block.locator('[aria-label="Add view"]').click();
  await page.getByTestId("add-view-panel").getByRole("button", { name: "Gallery", exact: true }).click();
  await expect(block.getByTestId("gallery-new-page")).toBeVisible();
  return block;
}

test.describe("gallery card click", () => {
  test("a Templates card creates a page without changing the Home page", async ({ page, baseURL }) => {
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await openHome(page);
    const templatesBlock = visibleTemplates(page);
    const beforeIds = await visibleDatabaseIds(page);
    const beforeBlockId = await blockIdOf(templatesBlock);
    const card = templatesBlock.getByText("Student Dashboard").first();
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await expect(page.getByRole("button", { name: "Create page", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use template" })).toHaveCount(0);
    await page.getByRole("button", { name: "Create page", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Page title" })).toHaveValue("Student Dashboard");

    await openHome(page);
    await expect(visibleTemplates(page)).toBeVisible();
    expect(await blockIdOf(visibleTemplates(page))).toBe(beforeBlockId);
    expect(await visibleDatabaseIds(page)).toEqual(beforeIds);
  });

  test("a workspace gallery without cardClick still opens the record", async ({ page, baseURL }) => {
    const block = await insertInlineGallery(page, baseURL);
    const title = "Plain gallery row";
    await block.hover();
    await block.locator(".odb-topbar-actions").getByRole("button", { name: "New", exact: true }).click();
    const peek = page.locator("aside[data-open-in]").first();
    await peek.waitFor({ timeout: 10_000 });
    const titleBox = peek.getByRole("textbox", { name: "Page title" });
    await titleBox.waitFor({ state: "visible", timeout: 10_000 });
    await titleBox.fill(title);
    await peek.locator("button").filter({ hasText: /^Close$/ }).first().click();

    const card = block.getByRole("button", { name: title, exact: true });
    await expect(card).toBeVisible();
    await card.click();
    const opened = page.locator("aside[data-open-in]").first();
    await expect(opened.getByRole("textbox", { name: "Page title" })).toHaveValue(title);
    await expect(page.getByRole("button", { name: "Create page", exact: true })).toHaveCount(0);
  });
});
