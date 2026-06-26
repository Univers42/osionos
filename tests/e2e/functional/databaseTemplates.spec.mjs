/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseTemplates.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Database templates: split "New" button, templates dropdown, template-edit mode
// (amber banner + recurrence), `/placeholder` gating, and the end-to-end author →
// instantiate → fill flow driven through the single-pane database *tab*.

import { test, expect } from "@playwright/test";

import {
  activateFirstEditor,
  clearAndTypePageTitle,
  openFreshPage,
  openSlashMenuFromEditor,
  slashCommandEntry,
  slashMenu,
  waitForRenderStability,
} from "../../browser/core/app.mjs";

/** The database as a HOME variant (?home=database). Used for the chrome assertions. */
async function openDatabaseHome(page) {
  await page.goto("/?home=database");
  await page.locator('[aria-label="Add view"]').first().waitFor({ timeout: 20_000 });
}

/** The database as a single full-screen TAB (Files Gallery) — stable for editing flows. */
async function openDatabaseTab(page) {
  await page.goto("/?home=workspace");
  await page.getByRole("button", { name: /Open as page/ }).first().click();
  await page.locator('[aria-label="Add view"]').first().waitFor({ timeout: 20_000 });
}

const chevron = (page) => page.getByRole("button", { name: "New from template" });

async function openTemplatesDropdown(page) {
  await chevron(page).click();
  await expect(page.getByText(/Templates for/)).toBeVisible();
}

/** A body-block editor on the open page surface (never the page title). */
async function pageSurfaceEditor(page) {
  const surface = page.locator(".osionos-page").first();
  const start = surface.getByRole("button", { name: /Click here to start writing/i });
  if (await start.count()) await start.first().click();
  const editor = surface
    .locator('[role="textbox"][aria-multiline="true"]:not([aria-label="Page title"])')
    .first();
  await editor.waitFor();
  return editor;
}

async function clickToFocus(editor) {
  await editor.click(); // a real click places a caret (slash detection needs it)
  await expect(editor).toBeFocused();
}

async function insertPlaceholder(page) {
  const editor = await pageSurfaceEditor(page);
  // Type "/" first to open the menu (proven pattern), then filter — typing the
  // whole "/placeholder" at once can race the menu mount.
  await openSlashMenuFromEditor(editor, "/");
  await expect(slashMenu(page)).toBeVisible();
  await page.keyboard.type("placeholder");
  await expect(slashCommandEntry(page, "Placeholder")).toBeVisible();
  await page.keyboard.press("Enter"); // select the highlighted (only) entry
  const block = page.locator(".osionos-page [data-placeholder-block]").first();
  await expect(block).toBeVisible();
  return block;
}

test.describe("database-templates", () => {
  test("split New button opens the templates dropdown", async ({ page }) => {
    await openDatabaseHome(page);
    await expect(page.getByRole("button", { name: "New", exact: true }).first()).toBeVisible();
    await expect(chevron(page)).toBeVisible();

    await openTemplatesDropdown(page);
    await expect(page.getByRole("button", { name: "Empty", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "New template" })).toBeVisible();
  });

  test("creating a template opens template-edit mode with the recurrence banner", async ({ page }) => {
    await openDatabaseHome(page);
    await openTemplatesDropdown(page);
    await page.getByRole("button", { name: "New template" }).click();

    await expect(page.getByText(/editing a template/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Template recurrence")).toBeVisible();
  });

  test("/placeholder is hidden on ordinary (non-template) pages", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await openSlashMenuFromEditor(editor, "/");
    await expect(slashMenu(page)).toBeVisible();
    await expect(slashCommandEntry(page, "Placeholder")).toHaveCount(0);
  });

  test("author a placeholder in a template, instantiate it, and fill it in", async ({ page }) => {
    await openDatabaseTab(page);

    // Author a template carrying a prompted placeholder.
    await openTemplatesDropdown(page);
    await page.getByRole("button", { name: "New template" }).click();
    await expect(page.getByText(/editing a template/i)).toBeVisible({ timeout: 15_000 });
    await clearAndTypePageTitle(page, "Weekly Report");

    const ph = await insertPlaceholder(page);
    // Double-click → edit the placeholder's own prompt (template-author mode).
    await ph.dblclick();
    const promptEditor = ph.locator('[role="textbox"]').first();
    await clickToFocus(promptEditor);
    await page.keyboard.type("Project name");
    await page.locator(".osionos-page").first().click({ position: { x: 5, y: 5 } }); // blur → preview
    await waitForRenderStability(page);

    // Back to the database tab → instantiate from the template's dropdown row.
    await page.locator("[data-tab-id]").filter({ hasText: "Files Gallery" }).first().click();
    await page.locator('[aria-label="Add view"]').first().waitFor({ timeout: 20_000 });
    await openTemplatesDropdown(page);
    await page.getByRole("button", { name: "Weekly Report" }).first().click();

    // The instance shows the placeholder prompt as a ghost; single-click fills it.
    const fillBlock = page.locator(".osionos-page [data-placeholder-block]").first();
    await expect(fillBlock).toBeVisible({ timeout: 15_000 });
    await expect(fillBlock).toContainText("Project name");

    const fillEditor = fillBlock.locator('[role="textbox"]').first();
    await clickToFocus(fillEditor);
    await page.keyboard.type("ACME Corp");
    await waitForRenderStability(page);
    await expect(fillEditor).toHaveText("ACME Corp");
  });
});
