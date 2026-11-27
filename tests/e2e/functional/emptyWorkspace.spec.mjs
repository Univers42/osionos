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

import { closeAllTabs, openFreshPage, waitForRenderStability } from "../../browser/core/app.mjs";

const emptyWorkspace = (page) => page.getByTestId("empty-workspace");
const tabs = (page) => page.locator("[data-tab-id]");

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

  test("the welcome is chromeless and transparent, and its Ask Binocle opens the top bar in ask mode", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await closeAllTabs(page);

    const pane = page.locator("[data-osio-pane][data-osio-pane-welcome]");
    await expect(pane).toHaveCount(1);
    await expect(page.locator("[data-osio-tabstrip]")).toHaveCount(0);
    await expect(pane.locator('button[title="Split right"]')).toHaveCount(0);
    await expect(pane.locator('button[title="Close pane"]')).toHaveCount(0);
    await expect(emptyWorkspace(page)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    await expect(emptyWorkspace(page).getByRole("textbox")).toHaveCount(0);
    await emptyWorkspace(page).getByRole("button", { name: /^Ask Binocle/ }).click();
    const bar = page.getByRole("combobox", { name: "Search pages or run a command" });
    await expect(bar).toBeFocused();
    await expect(bar).toHaveValue("/");
  });

  test("Recent lists the page just visited and reopens it", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await closeAllTabs(page);
    await emptyWorkspace(page).getByRole("button", { name: /New page/ }).click();
    await expect(page.locator(".osionos-page")).toBeVisible();
    await closeAllTabs(page);

    const recent = emptyWorkspace(page).getByRole("region", { name: "Recent" });
    await expect(recent.getByRole("button")).not.toHaveCount(0);
    await recent.getByRole("button").first().click();
    await expect(tabs(page)).toHaveCount(1);
    await expect(page.locator(".osionos-page")).toBeVisible();
  });
});
