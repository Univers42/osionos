/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   emptyWorkspace.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 05:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 05:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Every tab can be closed, Home included. What is left is an empty workspace
// with ways to start, like VS Code with no editor open: nothing reopens by itself.

import { expect, test } from "@playwright/test";

import { openFreshPage, waitForRenderStability } from "../../browser/core/app.mjs";

const emptyWorkspace = (page) => page.getByTestId("empty-workspace");
const tabs = (page) => page.locator("[data-tab-id]");

async function closeAllTabs(page) {
  for (let guard = 0; guard < 10 && (await tabs(page).count()) > 0; guard += 1) {
    await page.getByRole("button", { name: /^Close / }).first().click({ force: true });
    await waitForRenderStability(page);
  }
  await expect(tabs(page)).toHaveCount(0);
}

test.describe("empty workspace", () => {
  test("closing every tab, Home included, leaves an empty workspace that stays empty after a reload", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await closeAllTabs(page);

    await expect(emptyWorkspace(page)).toBeVisible();
    await expect(emptyWorkspace(page).getByRole("button", { name: /New page/ })).toContainText("Ctrl");
    await page.reload();
    await waitForRenderStability(page);
    await expect(emptyWorkspace(page)).toBeVisible();
    await expect(tabs(page)).toHaveCount(0);
  });

  test("New page and Ctrl+Alt+N start a page; Open Home brings Home back", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await closeAllTabs(page);

    await emptyWorkspace(page).getByRole("button", { name: /New page/ }).click();
    await expect(page.locator(".osionos-page")).toBeVisible();
    await expect(tabs(page)).toHaveCount(1);

    await closeAllTabs(page);
    await page.keyboard.press("Control+Alt+n");
    await expect(page.locator(".osionos-page")).toBeVisible();

    await closeAllTabs(page);
    await emptyWorkspace(page).getByRole("button", { name: "Open Home" }).click();
    await expect(tabs(page)).toHaveCount(1);
    await expect(tabs(page).first()).toContainText("Home");
  });
});
