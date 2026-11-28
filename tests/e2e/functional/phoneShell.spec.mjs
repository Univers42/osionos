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

// The phone shell at 390x844 with a touch screen: a bottom tab bar and none of the desktop chrome,
// a tapped page opens full screen with a back arrow, the browser back (the Android back button)
// returns to the tree without leaving the app, each tab keeps its own stack, every shell control is
// 44px, nothing scrolls the page sideways, and both views pass WCAG 2.2 AA in both themes. The
// Customize layout menu (768px, the narrowest width that still has the desktop shell) and a desktop pointer keep their rules.
// Ponytail: the 44px check reads the control box or its ::before hit box, so it cannot see a
// neighbour's hit box covering part of it; Playwright's touch emulation is not a real Android back.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { createNewWorkspacePage } from "../../browser/core/app.mjs";
import { seedPages } from "../support/embedSeed.mjs";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const DESKTOP_CHROME = [
  '[data-testid="app-topbar"]',
  'aside[aria-label="Sidebar"]',
  '[data-testid="workbench-statusbar"]',
  "[data-osio-tabstrip]",
];
const PAGE_NAME = "Meeting Notes";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const tabBar = (page) => page.getByRole("navigation", { name: "Primary" });
const backArrow = (page) => page.getByRole("button", { name: "Back" });

async function openPhone(page, baseURL) {
  await page.route("**/*", (route) => (route.request().method() === "GET" ? route.fallback() : route.abort()));
  await seedPages(page, [{ _id: "agent-page-1", title: "Research agent", surface: "agent", content: [] }]);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await tabBar(page).waitFor();
}

async function openPage(page) {
  await page.locator("main").getByText(PAGE_NAME, { exact: true }).first().tap();
  await expect(backArrow(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("phone-page")).toBeVisible();
}

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
const overflowing = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const axeViolations = async (page) => {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
};

test.describe("phone shell 390x844", () => {
  test("the signed-in home shows the bottom nav and none of the desktop chrome", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    for (const name of ["Home", "Search", "Inbox", "Agent"]) await expect(tabBar(page).getByRole("button", { name })).toBeVisible();
    await expect(tabBar(page).getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
    for (const selector of DESKTOP_CHROME) await expect(page.locator(selector)).toHaveCount(0);
  });

  test("a tapped page opens full screen with a back arrow and the browser back returns to the tree", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    const url = page.url();
    await openPage(page);
    expect(page.url()).toBe(url);
    await page.goBack();
    await expect(page.getByTestId("phone-page")).toHaveCount(0);
    await expect(backArrow(page)).toHaveCount(0);
    expect(page.url()).toBe(url);
    await expect(page.locator("main").getByText(PAGE_NAME, { exact: true }).first()).toBeVisible();
  });

  test("the back arrow pops the page like the browser back", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    await openPage(page);
    await backArrow(page).tap();
    await expect(page.getByTestId("phone-page")).toHaveCount(0);
  });

  test("switching to Search and back keeps the Home stack", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    await openPage(page);
    await tabBar(page).getByRole("button", { name: "Search" }).tap();
    await expect(page.getByLabel("Search query")).toBeVisible();
    await expect(page.getByTestId("phone-page")).toHaveCount(0);
    await tabBar(page).getByRole("button", { name: "Home" }).tap();
    await expect(page.getByTestId("phone-page")).toBeVisible();
    await expect(backArrow(page)).toBeVisible();
  });

  test("the bottom nav and the back arrow are 44px, and nothing scrolls sideways", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    expect(await smallControls(page, '[aria-label="Primary"] button')).toEqual([]);
    expect(await overflowing(page)).toBe(false);
    await openPage(page);
    expect(await smallControls(page, '[aria-label="Primary"] button, button[aria-label="Back"]')).toEqual([]);
    expect(await overflowing(page)).toBe(false);
  });

  test("the search panel toggles have a 44px hit area", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    await tabBar(page).getByRole("button", { name: "Search" }).tap();
    await expect(page.getByLabel("Search query")).toBeVisible();
    await expect(page.locator("[data-touch-hit]").first()).toBeVisible();
    expect(await smallControls(page, "[data-touch-hit]")).toEqual([]);
  });

  for (const theme of ["light", "dark"]) {
    test(`the home tab and an open page have no WCAG 2.2 AA violation in the ${theme} theme`, async ({ page, baseURL }) => {
      await page.addInitScript((mode) => localStorage.setItem("osionos:theme-mode", mode), theme);
      await openPhone(page, baseURL);
      await page.waitForTimeout(800);
      expect(await axeViolations(page)).toEqual([]);
      await openPage(page);
      await page.waitForTimeout(800);
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});

async function openDesktop(page, baseURL) {
  await page.route("**/*", (route) => (route.request().method() === "GET" ? route.fallback() : route.abort()));
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.getByTestId("app-topbar").waitFor();
}
const openCustomizeMenu = async (page) => {
  await page.getByTestId("customize-layout").tap();
  const menu = page.getByRole("menu");
  await menu.first().waitFor();
  return menu.first();
};
const closeButton = (page) => page.locator("[data-osio-tabstrip] [data-tab-id] button[aria-label^='Close ']").first();

// The Customize layout button is hidden on the phone shell, so its menu is
// measured at the narrowest touch width that shows it.
test.describe("Customize layout menu at 768x844 with a touch screen", () => {
  test.use({ viewport: { width: 768, height: 844 }, hasTouch: true, isMobile: true });

  test("the Customize layout menu fits the screen and every row is 44px tall", async ({ page, baseURL }) => {
    await openDesktop(page, baseURL);
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
      await openDesktop(page, baseURL);
      await openCustomizeMenu(page);
      await page.waitForTimeout(800);
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    });
  }
});

test.describe("desktop pointer 1280x800", () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test("still the IDE shell: rail, top bar and status bar, no bottom nav", async ({ page, baseURL }) => {
    await page.route("**/*", (route) => (route.request().method() === "GET" ? route.fallback() : route.abort()));
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await page.getByTestId("app-topbar").waitFor();
    await expect(page.locator('aside[aria-label="Sidebar"]')).toBeVisible();
    await expect(page.getByTestId("workbench-statusbar")).toBeVisible();
    await expect(tabBar(page)).toHaveCount(0);
  });

  test("nothing grew: a menu row is under 40px and the tab close shows only on hover", async ({ page, baseURL }) => {
    await openDesktop(page, baseURL);
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
