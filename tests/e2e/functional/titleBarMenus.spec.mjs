/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   titleBarMenus.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The title-bar menus: WAI-ARIA menubar keyboard, real submenus, disabled and
// checkable rows, focus that returns to where it came from, the agent split
// button, the phone sheet at 390x844, and the block-selection focus policy.

import { expect, test } from "@playwright/test";
import { createParagraphs, openFreshPage } from "../../browser/core/app.mjs";

const bar = (page) => page.getByTestId("app-topbar");
const trigger = (page, name) => bar(page).getByRole("button", { name, exact: true });
const blocks = (page) => page.getByTestId("draggable-block");
const selected = (page) => page.locator('[data-testid="draggable-block"][data-selected="true"]');
const menus = (page) => page.getByRole("menu");
const composer = (page) => page.locator('[data-dictation-composer="assistant"] textarea');

async function openPage(page, baseURL, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await openFreshPage(page, baseURL);
}

async function openMenu(page, name) {
  await trigger(page, name).click();
  await expect(trigger(page, name)).toHaveAttribute("aria-expanded", "true");
}

async function marqueeSelectTwoBlocks(page) {
  await createParagraphs(page, ["one", "two"]);
  await expect(blocks(page)).toHaveCount(2);
  const first = await blocks(page).nth(0).boundingBox();
  const last = await blocks(page).nth(1).boundingBox();
  await page.mouse.move(first.x - 24, last.y + last.height + 6);
  await page.mouse.down();
  await page.mouse.move(first.x - 24, first.y + 2, { steps: 8 });
  await page.mouse.move(first.x + first.width / 2, first.y - 2, { steps: 8 });
  await page.mouse.up();
  await expect(selected(page)).toHaveCount(2);
}

test.describe("title-bar menus", () => {
  test("a menu is in the DOM only while open: 0 at rest, 1 open, 2 with a submenu", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    await expect(menus(page)).toHaveCount(0);
    await openMenu(page, "File");
    await expect(menus(page)).toHaveCount(1);
    await page.getByRole("menuitem", { name: "Preferences" }).hover();
    await expect(menus(page)).toHaveCount(2);
    await page.getByRole("menuitem", { name: "New page" }).hover();
    await expect(menus(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(menus(page)).toHaveCount(0);
  });

  test("keyboard: arrows move real focus, Escape closes a submenu then the menu and returns focus", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    await trigger(page, "File").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "New page" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "New folder" })).toBeFocused();
    await page.getByRole("menuitem", { name: "Preferences" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(menus(page)).toHaveCount(2);
    await expect(page.getByRole("menuitem", { name: "Settings", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menus(page)).toHaveCount(1);
    await expect(page.getByRole("menuitem", { name: "Preferences" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menus(page)).toHaveCount(0);
    await expect(trigger(page, "File")).toBeFocused();
  });

  test("keyboard only: Tab to File, ArrowRight through all 7 menus, open one, Escape", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    for (let step = 0; step < 12 && !(await trigger(page, "File").evaluate((el) => el === document.activeElement)); step += 1) await page.keyboard.press("Tab");
    await expect(trigger(page, "File")).toBeFocused();
    for (const name of ["Edit", "Selection", "View", "Go", "Terminal", "Help"]) {
      await page.keyboard.press("ArrowRight");
      await expect(trigger(page, name)).toBeFocused();
    }
    await page.keyboard.press("ArrowRight");
    await expect(trigger(page, "File")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menus(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(trigger(page, "File")).toBeFocused();
    await expect(page.getByRole("menuitem", { name: "New page" })).toHaveCount(0);
  });

  test("hovering to another menu moves focus with it, so Escape closes it and returns to that trigger", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    await openMenu(page, "File");
    await trigger(page, "Edit").hover();
    await expect(trigger(page, "Edit")).toHaveAttribute("aria-expanded", "true");
    await expect(trigger(page, "Edit")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menus(page)).toHaveCount(0);
    await expect(trigger(page, "Edit")).toBeFocused();
  });

  test("a disabled row is aria-disabled and does not run", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    await openMenu(page, "Edit");
    const duplicate = page.getByRole("menuitem", { name: "Duplicate" });
    await expect(duplicate).toHaveAttribute("aria-disabled", "true");
    const before = await blocks(page).count();
    await duplicate.click({ force: true });
    await expect(menus(page)).toHaveCount(1);
    await expect(blocks(page)).toHaveCount(before);
  });

  test("Undo from the menu hands focus back to the editor it came from", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    const [editor] = [(await createParagraphs(page, ["abc"])).first()];
    await editor.click();
    await page.keyboard.type("def");
    await openMenu(page, "Edit");
    await page.getByRole("menuitem", { name: "Undo" }).click();
    await expect(editor).toBeFocused();
  });

  test("View > Appearance > Panel is a checkbox row that matches the Panel toggle", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    const toggle = bar(page).getByRole("button", { name: "Panel", exact: true });
    const before = await toggle.getAttribute("aria-pressed");
    await openMenu(page, "View");
    await page.getByRole("menuitem", { name: "Appearance" }).hover();
    const row = page.getByRole("menuitemcheckbox", { name: /^Panel\b/ });
    await expect(row).toHaveAttribute("aria-checked", before);
    await row.click();
    await expect(toggle).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
  });

  // Pointing at a submenu row opens it, so the click that follows must not toggle it shut.
  test("clicking a submenu row the pointer already opened keeps it open", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    await openMenu(page, "View");
    const appearance = page.getByRole("menuitem", { name: "Appearance" });
    await appearance.hover();
    await expect(appearance).toHaveAttribute("aria-expanded", "true");
    await appearance.click();
    await expect(appearance).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("menuitemcheckbox", { name: /^Panel\b/ })).toBeVisible();
  });

  test("the Primary side bar toggle hides and restores the sidebar", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    const toggle = bar(page).getByRole("button", { name: "Primary side bar", exact: true });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  test("agent button: Ask an agent opens the assistant composer; the caret lists agents, AI settings and Manage agents", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    const ask = bar(page).getByRole("button", { name: "Ask an agent" });
    const caret = bar(page).getByRole("button", { name: "Choose an agent" });
    await expect(ask).toBeVisible();
    expect((await ask.boundingBox()).x).toBeGreaterThan((await trigger(page, "Help").boundingBox()).x);
    await ask.click();
    await expect(composer(page)).toBeFocused();
    await caret.click();
    await expect(menus(page)).toHaveCount(1);
    await expect(page.getByRole("menuitem", { name: "AI settings" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Manage agents…" }).click();
    await expect(page.locator('[data-osio-tabstrip] [data-tab-id][title="Settings"]')).toHaveCount(1);
  });

  test("agent menu closes on Escape and returns focus to the caret", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    const caret = bar(page).getByRole("button", { name: "Choose an agent" });
    await caret.focus();
    await page.keyboard.press("ArrowDown");
    await expect(menus(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(menus(page)).toHaveCount(0);
    await expect(caret).toBeFocused();
  });

  test("a marquee selection survives Edit > Duplicate by mouse: 2 blocks become 4, selection kept", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    await marqueeSelectTwoBlocks(page);
    await openMenu(page, "Edit");
    await expect(selected(page)).toHaveCount(2);
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    await expect(blocks(page)).toHaveCount(4);
    await expect(selected(page).first()).toBeVisible();
  });

  test("Escape in an open menu closes the menu and leaves the block selection alone", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    await marqueeSelectTwoBlocks(page);
    await openMenu(page, "Edit");
    await page.keyboard.press("Escape");
    await expect(menus(page)).toHaveCount(0);
    await expect(selected(page)).toHaveCount(2);
  });

  test("phone 390x844: the phone shell replaces the title bar, so no Open menu sheet exists", async ({ page, baseURL }) => {
    await openPage(page, baseURL, { width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Account and settings" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("the bar names no sidebar toggle verb and no brand", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    await expect(bar(page).getByRole("button", { name: /Toggle sidebar|Open sidebar/ })).toHaveCount(0);
    await expect(bar(page)).not.toContainText("osionos");
    await expect(menus(page)).toHaveCount(0);
    const first = bar(page).getByRole("navigation", { name: "Application menu" }).getByRole("button").first();
    await expect(first).toHaveText("File");
  });
});
