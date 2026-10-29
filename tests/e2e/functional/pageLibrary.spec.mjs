/* ************************************************************************** */
/*                                                                            */
/*   pageLibrary.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur         #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// The Library full view: reachable from the rail, its five tabs, creating a page
// that lands first in Recents with a hover OPEN pill, a parent/child tree that
// expands to reveal the child plus an "Add new" row, and the tab-row icons
// (search, created-by filter, sort).

import { expect, test } from "@playwright/test";

import {
  clearAndTypePageTitle,
  createNewWorkspacePage,
  explorerRow,
} from "../../browser/core/app.mjs";

const railLibrary = (page) => page.getByRole("tab", { name: "Library", exact: true });
const libraryRegion = (page) => page.getByRole("region", { name: "Library", exact: true });

test.describe("the Library", () => {
  test("opens from the rail, shows its tabs, and a new page lands first in Recents", async ({ page, baseURL }) => {
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await railLibrary(page).click();

    const library = libraryRegion(page);
    await expect(library).toBeVisible();
    for (const label of ["Recents", "Favorites", "Shared", "Private", "Skills"]) {
      await expect(library.getByRole("tab", { name: label, exact: true })).toBeVisible();
    }

    await library.getByRole("button", { name: "New page", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Page title" })).toBeVisible();
    const title = `Library page ${Date.now()}`;
    await clearAndTypePageTitle(page, title);

    await railLibrary(page).click();
    await expect(library).toBeVisible();
    await expect(library.getByRole("tab", { name: "Recents", exact: true })).toHaveAttribute("aria-selected", "true");

    const firstRow = library.getByTestId("library-row").first();
    await expect(firstRow).toContainText(title, { timeout: 15_000 });
    await firstRow.hover();
    await expect(firstRow.getByTestId("library-open")).toBeVisible();
  });

  test("a parent with a child shows a chevron and expanding reveals the child and Add new", async ({ page, baseURL }) => {
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
    const library = libraryRegion(page);
    await expect(library).toBeVisible();

    const row = library.getByTestId("library-row").filter({ hasText: parent }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    const chevron = row.getByTestId("library-chevron");
    await expect(chevron).toHaveAttribute("aria-expanded", "false");
    await chevron.click();
    await expect(chevron).toHaveAttribute("aria-expanded", "true");

    const childRow = library.getByTestId("library-row").filter({ hasText: child }).first();
    await expect(childRow).toBeVisible();
    // Source names the parent the child lives under.
    await expect(childRow).toContainText(parent);
    await expect(library.getByTestId("library-add-new").first()).toBeVisible();

    await library.getByRole("button", { name: "Search", exact: true }).click();
    const search = library.getByRole("searchbox", { name: "Search pages" });
    await expect(search).toBeFocused();
    await search.fill(child);
    await expect(library.getByTestId("library-row")).toHaveCount(1);
    await search.press("Escape");
    await expect(search).toHaveCount(0);
    await expect(library.getByRole("button", { name: "Search", exact: true })).toBeVisible();

    await library.getByRole("button", { name: "Filter", exact: true }).click();
    const createdBy = page.getByRole("menu", { name: "Created by" });
    await expect(createdBy.getByRole("menuitemradio", { name: "Anyone" })).toHaveAttribute("aria-checked", "true");
    await createdBy.getByRole("menuitemradio", { name: "Me" }).click();
    await expect(createdBy).toHaveCount(0);
    await expect(row).toBeVisible();

    await library.getByRole("button", { name: "Sort", exact: true }).click();
    const sortBy = page.getByRole("menu", { name: "Sort by" });
    for (const label of ["Last visited", "Last edited", "Title"]) {
      await expect(sortBy.getByRole("menuitemradio", { name: label })).toBeVisible();
    }
    await sortBy.getByRole("menuitemradio", { name: "Title" }).click();
    await expect(sortBy).toHaveCount(0);
  });
});
