/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   phoneShell.spec.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The phone shell at 390x844 with a touch screen: nothing scrolls the page sideways, the
// sidebar drawer takes focus, keeps Tab inside and gives focus back, a finger-sized control
// is 44px (tab close, search toggles and menu rows included), a tab closes with a tap, the Customize
// layout menu fits the screen, a split stacks, a field is 16px, and the drawer and that menu pass
// WCAG 2.2 AA in both themes. A desktop pointer keeps its small rows and its hover-only close.
// Ponytail: the 44px check reads the control box or its ::before hit box, so it cannot see a
// neighbour's hit box covering part of it; Playwright's touch emulation is not a real iOS.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { createNewWorkspacePage } from "../../browser/core/app.mjs";
import { seedPages } from "../support/embedSeed.mjs";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const CONTROLS_SHELL = [
  '[data-testid="app-topbar"] button',
  'aside[aria-label="Sidebar"] [role="tab"]',
  '[data-testid="workbench-statusbar"] button',
  '[role="tablist"][aria-label="Panel tabs"] [role="tab"]',
].join(",");

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const sidebar = (page) => page.locator('aside[aria-label="Sidebar"]');
const explorerTab = (page) => page.getByRole("tab", { name: /^Explorer/ }).first();
const focusIn = (page, selector) => page.evaluate((sel) => document.querySelector(sel)?.contains(document.activeElement) ?? false, selector);

async function openPhone(page, baseURL) {
  await page.route("**/*", (route) => (route.request().method() === "GET" ? route.fallback() : route.abort()));
  await seedPages(page, [{ _id: "agent-page-1", title: "Research agent", surface: "agent", content: [] }]);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.getByTestId("app-topbar").waitFor();
}

async function openAgent(page) {
  await page.getByRole("tab", { name: /^Conversations/ }).click();
  await page.locator('[data-sidebar-panel="conversations"]').getByRole("button", { name: "Research agent" }).click();
  await expect(page.getByRole("region", { name: "Agent conversation" })).toBeVisible({ timeout: 15_000 });
}

const closeButton = (page) => page.locator("[data-osio-tabstrip] [data-tab-id] button[aria-label^='Close ']").first();
const openCustomizeMenu = async (page) => {
  await page.getByTestId("customize-layout").tap();
  const menu = page.getByRole("menu");
  await menu.first().waitFor();
  return menu.first();
};
const smallControls = (page, selector) => page.evaluate((sel) => {
  const failures = [];
  for (const el of document.querySelectorAll(sel)) {
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    const pseudo = getComputedStyle(el, "::before");
    const hit = pseudo.content === "none" ? { w: 0, h: 0 } : { w: parseFloat(pseudo.width), h: parseFloat(pseudo.height) };
    const [w, h] = [Math.max(box.width, hit.w), Math.max(box.height, hit.h)];
    if (w < 43.5 || h < 43.5) failures.push(`${el.getAttribute("aria-label") ?? el.textContent?.trim()} ${Math.round(w)}x${Math.round(h)}`);
  }
  return failures;
}, selector);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

test.describe("phone shell 390x844", () => {
  test("no page scrolls sideways: home, a page, an agent page", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    await page.waitForTimeout(1500);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await createNewWorkspacePage(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await openAgent(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test("the drawer takes focus, keeps Tab inside, Esc returns focus, the backdrop closes it", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    await explorerTab(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-sidebar-mode", "panel");
    await expect.poll(() => focusIn(page, "[data-osio-sidebar-card]")).toBe(true);
    for (const key of ["Tab", "Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab"]) {
      await page.keyboard.press(key);
      expect(await focusIn(page, 'aside[aria-label="Sidebar"]')).toBe(true);
    }
    for (let step = 0; step < 80; step += 1) await page.keyboard.press("Tab");
    expect(await focusIn(page, 'aside[aria-label="Sidebar"]')).toBe(true);
    for (let step = 0; step < 80; step += 1) await page.keyboard.press("Shift+Tab");
    expect(await focusIn(page, 'aside[aria-label="Sidebar"]')).toBe(true);

    await page.keyboard.press("Escape");
    await expect(sidebar(page)).toHaveAttribute("data-sidebar-mode", "rail");
    await expect(explorerTab(page)).toBeFocused();

    await explorerTab(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-sidebar-mode", "panel");
    await page.touchscreen.tap(375, 420);
    await expect(sidebar(page)).toHaveAttribute("data-sidebar-mode", "rail");
  });

  test("a split stacks the panes instead of squeezing them side by side", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    await createNewWorkspacePage(page);
    await page.keyboard.press("Control+\\");
    const panes = page.locator("[data-osio-pane]");
    await expect(panes).toHaveCount(2);
    const [first, second] = await panes.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
    expect(first.width).toBeGreaterThanOrEqual(280);
    expect(second.width).toBeGreaterThanOrEqual(280);
    expect(second.top).toBeGreaterThanOrEqual(first.bottom - 1);
  });

  test("a field is 16px so iOS does not zoom, and every shell control has a 44px hit area", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    await page.keyboard.press("Control+j");
    await page.getByRole("tab", { name: /^Conversations/ }).click();
    const filter = page.getByLabel("Filter conversations");
    expect(await filter.evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");
    await page.keyboard.press("Escape");
    expect(await smallControls(page, CONTROLS_SHELL)).toEqual([]);
  });

  for (const theme of ["light", "dark"]) {
    test(`the open drawer has no WCAG 2.2 AA violation in the ${theme} theme`, async ({ page, baseURL }) => {
      await page.addInitScript((mode) => localStorage.setItem("osionos:theme-mode", mode), theme);
      await openPhone(page, baseURL);
      await explorerTab(page).click();
      await expect(sidebar(page)).toHaveAttribute("data-sidebar-mode", "panel");
      await page.waitForTimeout(800);
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    });
  }

  test("a tab's close button shows without hover, has a 44px hit area and closes the tab on tap", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    await createNewWorkspacePage(page);
    const close = closeButton(page);
    await expect(close).toBeVisible();
    expect(await close.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    expect(await smallControls(page, "[data-osio-tabstrip] [data-tab-id] button")).toEqual([]);
    const tabs = page.locator("[data-osio-tabstrip] [data-tab-id]");
    const before = await tabs.count();
    await close.tap();
    await expect(tabs).toHaveCount(before - 1);
  });

  test("the search panel toggles have a 44px hit area", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    await page.getByRole("tab", { name: /^Search/ }).click();
    await expect(page.getByLabel("Search query")).toBeVisible();
    await expect(page.getByLabel("Search query")).toHaveAttribute("placeholder", "Search all pages");
    await expect(page.locator("[data-touch-hit]").first()).toBeVisible();
    expect(await smallControls(page, "[data-touch-hit]")).toEqual([]);
  });
});

// The Customize layout button is hidden under 640px (the phone has its own menu), so its menu is
// measured at the narrowest touch width that shows it.
test.describe("Customize layout menu at 640x844 with a touch screen", () => {
  test.use({ viewport: { width: 640, height: 844 }, hasTouch: true, isMobile: true });

  test("the Customize layout menu fits the screen and every row is 44px tall", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    const menu = await openCustomizeMenu(page);
    const box = await menu.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height);
    expect(await smallControls(page, '[role="menu"] .osio-menu-item')).toEqual([]);
    const rows = await menu.locator(".osio-menu-item").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    expect(rows.length).toBeGreaterThan(0);
    expect(Math.min(...rows)).toBeGreaterThanOrEqual(43.5);
  });

  for (const theme of ["light", "dark"]) {
    test(`the open Customize layout menu has no WCAG 2.2 AA violation in the ${theme} theme`, async ({ page, baseURL }) => {
      await page.addInitScript((mode) => localStorage.setItem("osionos:theme-mode", mode), theme);
      await openPhone(page, baseURL);
      await openCustomizeMenu(page);
      await page.waitForTimeout(800);
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    });
  }
});

test.describe("desktop pointer 1280x800", () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test("nothing grew: a menu row is under 40px and the tab close shows only on hover", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    await createNewWorkspacePage(page);
    const close = closeButton(page);
    expect(await close.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
    await page.locator("[data-osio-tabstrip] [data-tab-id]").first().hover();
    await expect.poll(() => close.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    await page.getByTestId("customize-layout").click();
    const row = page.getByRole("menu").first().locator(".osio-menu-item").first();
    await row.waitFor();
    expect((await row.boundingBox()).height).toBeLessThan(40);
  });
});
