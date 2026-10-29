/* ************************************************************************** */
/*                                                                            */
/*   pageLibrary.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur         #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// The Library is the real database view: every workspace item is a row with a
// Category, the old tabs are database views (plus Templates and Skills), a new
// page lands first in Recents, and a parent expands to its child as a sub-item.

import { expect, test } from "@playwright/test";

import {
  clearAndTypePageTitle,
  createNewWorkspacePage,
  explorerRow,
} from "../../browser/core/app.mjs";

const railLibrary = (page) => page.getByRole("tab", { name: "Library", exact: true });
const libraryRegion = (page) => page.getByRole("region", { name: "Library", exact: true });
const viewTab = (library, name) => library.locator(`[data-view-tab][aria-label="${name}"]`);
const libraryRow = (library, text) => library.locator("tr[data-page-id]").filter({ hasText: text }).first();

test.describe("the Library", () => {
  test("is the database view: its views, the Minimal table, and a new page first in Recents", async ({ page, baseURL }) => {
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await railLibrary(page).click();

    const library = libraryRegion(page);
    await expect(library.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
    for (const name of ["All files", "Recents", "Favorites", "Shared", "Private", "Templates", "Skills"]) {
      await expect(viewTab(library, name)).toBeVisible({ timeout: 15_000 });
    }
    await expect(library.locator('table[data-table-style="minimal"]')).toBeVisible();
    await expect(library.locator("thead")).toContainText("Category");

    await library.getByRole("button", { name: "New page", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Page title" })).toBeVisible();
    const title = `Library page ${Date.now()}`;
    await clearAndTypePageTitle(page, title);

    await railLibrary(page).click();
    await viewTab(library, "Recents").click();
    const row = library.locator("tr[data-page-id]").first();
    await expect(row).toContainText(title, { timeout: 15_000 });
    await expect(row).toContainText("Page");
  });

  test("templates are files too: the Templates view lists them", async ({ page, baseURL }) => {
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await railLibrary(page).click();
    const library = libraryRegion(page);
    await viewTab(library, "Templates").click();
    const rows = library.locator("tr[data-page-id]");
    await expect(rows.first()).toContainText("Template", { timeout: 15_000 });
  });

  test("a parent expands to its child page as a sub-item, and a row opens its page", async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await createNewWorkspacePage(page);

    const parent = `Library parent ${Date.now()}`;
    await clearAndTypePageTitle(page, parent);
    const parentRow = explorerRow(page, parent);
    await expect(parentRow).toBeVisible({ timeout: 15_000 });
    await parentRow.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Add child page", exact: true }).click();

    await expect(page.getByRole("textbox", { name: "Page title" })).toBeVisible();
    const child = `Library child ${Date.now()}`;
    await clearAndTypePageTitle(page, child);

    await railLibrary(page).click();
    // All files is the default view; clicking the active tab would open its menu.
    const library = libraryRegion(page);
    const row = libraryRow(library, parent);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.hover();
    await row.getByRole("button", { name: "Expand sub-items" }).click();
    // A sub-item shows its cells as the column does: the option's label, not its id.
    const childRow = library.locator("tr").filter({ hasText: child }).first();
    await expect(childRow).toContainText("Page");
    await expect(childRow).not.toContainText("opt-page");

    await row.hover();
    await row.getByRole("button", { name: "OPEN", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Page title" })).toHaveValue(parent);
  });
});
