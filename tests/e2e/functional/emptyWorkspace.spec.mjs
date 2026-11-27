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
    // The tab's own close button, never another "Close …" control in the shell.
    await tabs(page).first().getByTitle("Close tab").click({ force: true });
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

  test("the welcome is chromeless and transparent, and Binocle opens a keyboard menu of actions", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await closeAllTabs(page);

    const pane = page.locator("[data-osio-pane][data-osio-pane-welcome]");
    await expect(pane).toHaveCount(1);
    await expect(page.locator("[data-osio-tabstrip]")).toHaveCount(0);
    await expect(pane.locator('button[title="Split right"]')).toHaveCount(0);
    await expect(pane.locator('button[title="Close pane"]')).toHaveCount(0);
    await expect(emptyWorkspace(page)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    const mascot = page.getByRole("button", { name: /Binocle/ });
    await expect(mascot).toHaveAttribute("aria-haspopup", "menu");
    await mascot.click();
    const menu = page.getByRole("menu", { name: "Binocle" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveCount(5);
    await expect(menu.getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem").nth(1)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(mascot).toBeFocused();

    await mascot.click();
    await page.getByRole("menuitem", { name: "Ask the assistant" }).click();
    await expect(tabs(page)).toHaveCount(1);
  });
});
