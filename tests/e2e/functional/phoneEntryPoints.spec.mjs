// Everything the desktop chrome offers must stay reachable on a phone: the account sheet (Settings,
// theme, sign out), the New page button, the palette on the Search tab, and the active tab's
// re-tap returning to its root. Each is 44px, closes with Escape or the Android back button using
// one history entry, and the sheet passes WCAG 2.2 AA.
// Ponytail: the sheet's Workspace group shows only with two or more workspaces and the seeded
// session has one, so that group is covered by tests/canvas, not here; touch emulation is not a real Android back.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { openSettingsOnPhone, phoneBack } from "../support/phoneNav.mjs";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const tabBar = (page) => page.getByRole("navigation", { name: "Primary" });
const accountButton = (page) => page.getByRole("button", { name: "Account and settings" });
const sheet = (page) => page.getByRole("dialog", { name: "Account and settings" });

async function openPhone(page, baseURL) {
  await page.route("**/*", (route) => (route.request().method() === "GET" ? route.fallback() : route.abort()));
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await tabBar(page).waitFor();
}

async function expectTouchSized(locator) {
  const box = await locator.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
}

test.describe("phone entry points", () => {
  test("the account sheet offers Settings, Theme and Sign out at 44px and passes axe", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    await expectTouchSized(accountButton(page));
    await accountButton(page).tap();
    await expect(sheet(page)).toBeVisible();
    for (const name of ["Settings", "Light", "Dark", "System", "Sign out"]) {
      await expectTouchSized(sheet(page).getByRole("button", { name, exact: true }));
    }
    const { violations } = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(WCAG_AA).analyze();
    expect(violations.map((violation) => violation.id)).toEqual([]);
  });

  test("Theme switches the theme and Settings opens as a page with its back arrow", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    await accountButton(page).tap();
    await sheet(page).getByRole("button", { name: "Dark", exact: true }).tap();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(sheet(page).getByRole("button", { name: "Dark", exact: true })).toHaveAttribute("aria-pressed", "true");
    await sheet(page).getByRole("button", { name: "Settings", exact: true }).tap();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Settings", exact: true })).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await phoneBack(page);
  });

  test("Escape, the backdrop and the Android back button each close the sheet and stay on Home", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    await accountButton(page).tap();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await accountButton(page).tap();
    await page.getByTestId("bottom-sheet-backdrop").tap({ position: { x: 195, y: 20 } });
    await expect(sheet(page)).toHaveCount(0);
    await accountButton(page).tap();
    await page.goBack();
    await expect(sheet(page)).toHaveCount(0);
    await expect(tabBar(page)).toBeVisible();
    await expect(page.getByTestId("phone-page")).toHaveCount(0);
  });

  test("New page makes a page and shows it full screen; the arrow returns to Home", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    const fab = page.getByRole("button", { name: "New page", exact: true });
    await expectTouchSized(fab);
    await fab.tap();
    await expect(page.getByTestId("phone-page").last()).toBeVisible({ timeout: 15_000 });
    await phoneBack(page);
    await expect(fab).toBeVisible();
  });

  test("the Search tab carries the palette: a 44px box that finds a page", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    await tabBar(page).getByRole("button", { name: "Search" }).tap();
    const box = page.getByRole("combobox", { name: "Search pages or run a command" });
    await expectTouchSized(box);
    await box.fill("Meeting");
    await page.getByRole("option").filter({ hasText: "Meeting" }).first().tap();
    await expect(page.getByTestId("phone-page").last()).toBeVisible({ timeout: 15_000 });
  });

  test("tapping the tab already shown returns it to its root", async ({ page, baseURL }) => {
    await openPhone(page, baseURL);
    await openSettingsOnPhone(page);
    await tabBar(page).getByRole("button", { name: "Home" }).tap();
    await expect(page.getByTestId("phone-page")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New page", exact: true })).toBeVisible();
  });
});
