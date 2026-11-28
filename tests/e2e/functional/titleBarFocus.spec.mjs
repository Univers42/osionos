/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   titleBarFocus.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Title-bar focus contracts: the phone sheet routes rows through the focus-return
// protocol and traps Tab, the agent split button closes on Escape from either
// part and returns focus to the caret, submenu rows open on Enter, and a lone
// trigger ignores sideways arrows.

import { expect, test } from "@playwright/test";
import { createParagraphs, openFreshPage } from "../../browser/core/app.mjs";

const bar = (page) => page.getByTestId("app-topbar");
const menus = (page) => page.getByRole("menu");
const ask = (page) => bar(page).getByRole("button", { name: "Ask an agent" });
const caret = (page) => bar(page).getByRole("button", { name: "Choose an agent" });

async function openPage(page, baseURL, viewport) {
  await page.setViewportSize(viewport);
  await openFreshPage(page, baseURL);
}

test.describe("title-bar focus", () => {
  test("agent: Escape on the main button closes the menu and focuses the caret", async ({ page, baseURL }) => {
    await openPage(page, baseURL, { width: 1440, height: 900 });
    await caret(page).click();
    await expect(menus(page)).toHaveCount(1);
    await ask(page).focus();
    await page.keyboard.press("Escape");
    await expect(menus(page)).toHaveCount(0);
    await expect(caret(page)).toBeFocused();
  });

  test("agent: a row that leaves the composer unfocused lands focus on the caret, not the body", async ({ page, baseURL }) => {
    await openPage(page, baseURL, { width: 1440, height: 900 });
    await caret(page).click();
    await page.getByRole("menuitem", { name: "AI settings" }).click();
    await expect(menus(page)).toHaveCount(0);
    await expect(caret(page)).toBeFocused();
  });

  test("agent: ArrowRight and ArrowLeft on a row change nothing", async ({ page, baseURL }) => {
    await openPage(page, baseURL, { width: 1440, height: 900 });
    await caret(page).focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    const row = page.locator('[role="menuitem"]:focus');
    const label = await row.getAttribute("data-menu-label");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");
    await expect(menus(page)).toHaveCount(1);
    await expect(row).toHaveAttribute("data-menu-label", label);
  });

  test("a submenu row opens on Enter onto its first item, and a second Enter keeps it open", async ({ page, baseURL }) => {
    await openPage(page, baseURL, { width: 1440, height: 900 });
    await bar(page).getByRole("button", { name: "File", exact: true }).focus();
    await page.keyboard.press("ArrowDown");
    const prefs = page.getByRole("menuitem", { name: "Preferences" });
    await prefs.focus();
    await page.keyboard.press("Enter");
    await expect(menus(page)).toHaveCount(2);
    await expect(page.locator('[data-menu-level="1"] [role^="menuitem"]').first()).toBeFocused();
    await prefs.focus();
    await page.keyboard.press("Enter");
    await expect(menus(page)).toHaveCount(2);
    await expect(page.locator('[data-menu-level="1"] [role^="menuitem"]').first()).toBeFocused();
  });
});
