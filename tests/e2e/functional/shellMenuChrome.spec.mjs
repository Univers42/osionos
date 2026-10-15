// Every floating panel of the shell draws the one overlay chrome, and the cards
// of the home surfaces draw the one panel chrome. Each panel is compared with a
// reference element that carries the recipe class itself, so the test fails
// when a surface keeps its own radius, shadow, background or border.

import { expect, test } from "@playwright/test";

import { clearAndTypePageTitle, explorerRow, openFreshPage } from "../../browser/core/app.mjs";
import { tokenValue } from "../support/styleguideHelpers.mjs";

const CHROME_PROPERTIES = [
  "border-top-left-radius",
  "border-top-width",
  "border-top-color",
  "background-color",
  "box-shadow",
];

// Tailwind's shadow utilities prepend four empty ring/inset layers to a box-shadow.
const withoutEmptyShadowLayers = (value) => value.replaceAll("rgba(0, 0, 0, 0) 0px 0px 0px 0px, ", "");

async function readChrome(locator) {
  const chrome = await locator.evaluate((element, properties) => Object.fromEntries(properties.map((name) => [name, getComputedStyle(element).getPropertyValue(name)])), CHROME_PROPERTIES);
  chrome["box-shadow"] = withoutEmptyShadowLayers(chrome["box-shadow"]);
  return chrome;
}

async function referenceChrome(page, recipeClass) {
  await page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.id = "chrome-reference";
    probe.className = name;
    document.body.append(probe);
  }, recipeClass);
  const chrome = await readChrome(page.locator("#chrome-reference"));
  await page.evaluate(() => document.getElementById("chrome-reference")?.remove());
  return chrome;
}

async function expectChrome(page, panel, recipeClass = "osio-surface-overlay") {
  await expect(panel.first()).toBeVisible();
  const want = await referenceChrome(page, recipeClass);
  expect(want["border-top-left-radius"]).not.toBe("0px");
  expect(await readChrome(panel.first())).toEqual(want);
}

async function expectMenuRows(page, menu) {
  const row = menu.getByRole("menuitem").first();
  await expect(row).toBeVisible();
  const box = await row.evaluate((element) => {
    const style = getComputedStyle(element);
    return { height: style.height, radius: style.borderTopLeftRadius, paddingLeft: style.paddingLeft };
  });
  expect(box.height).toBe(await tokenValue(page, "height", "--osio-control-h-sm"));
  expect(box.radius).toBe(await tokenValue(page, "border-top-left-radius", "--osio-radius-sm"));
}

async function openPage(page, baseURL) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFreshPage(page, baseURL);
  await clearAndTypePageTitle(page, "Quarterly plan");
}

test.describe("shell menus draw the overlay chrome", () => {
  test("the page header menu", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    await page.getByRole("button", { name: "Open page configuration" }).click();
    await expectChrome(page, page.getByTestId("page-config-menu"));
  });

  test("the sidebar page context menu", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    await explorerRow(page, "Quarterly plan").click({ button: "right" });
    const menu = page.getByRole("menu");
    await expectChrome(page, menu);
    await expectMenuRows(page, menu);
  });

  test("the sidebar page context menu draws Delete in the danger tone, like the block menu", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    await explorerRow(page, "Quarterly plan").click({ button: "right" });
    const remove = page.getByRole("menu").getByRole("menuitem", { name: "Delete", exact: true });
    await expect(remove).toHaveCSS("color", await tokenValue(page, "color", "--osio-danger"));
  });

  test("the top bar menu", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    await page.getByRole("navigation", { name: "Application menu" }).getByRole("button").first().click();
    const menu = page.getByRole("menu");
    await expectChrome(page, menu);
    await expectMenuRows(page, menu);
  });

  test("the top bar search results", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    await page.getByRole("combobox", { name: /Search pages/ }).fill("Quarterly");
    await expectChrome(page, page.locator("#osio-topbar-results"));
  });

  test("the share popover", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    await page.getByRole("button", { name: "Share page" }).click();
    const dialog = page.getByRole("dialog", { name: "Share" });
    await expectChrome(page, dialog);

    // The recipe's padding is only 4px; the header, the people input and the
    // footer must keep an inner inset so their text is not hard on the border.
    const insets = await dialog.evaluate((root) => {
      const left = root.getBoundingClientRect().left;
      return [root.querySelector("h3"), root.querySelector("label"), root.querySelector("[data-testid=share-footer] > :first-child")].map((el) => Math.round(el.getBoundingClientRect().left - left));
    });
    for (const inset of insets) expect(inset).toBeGreaterThanOrEqual(8);
  });

  test("the share popover stays inside a phone viewport", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await page.setViewportSize({ width: 390, height: 844 });
    await clearAndTypePageTitle(page, "Quarterly plan");
    await page.getByRole("button", { name: "Share page" }).click();
    const dialog = page.getByRole("dialog", { name: "Share" });
    await expect(dialog).toBeVisible();
    const rect = await dialog.evaluate((root) => {
      const { left, right } = root.getBoundingClientRect();
      return { left, right, viewport: innerWidth };
    });
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(rect.viewport);
    await expect(dialog.getByRole("heading", { name: "Share" })).toBeInViewport();
  });

  // ShareHost has no trigger to anchor to; it once rendered below the viewport.
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    test(`Share from the sidebar menu opens inside a ${width}x${height} viewport`, async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      await page.setViewportSize({ width, height });
      await clearAndTypePageTitle(page, "Quarterly plan");
      // A phone collapses the sidebar to its rail; the Explorer tab brings the tree back.
      if (width < 768) await page.getByRole("tab", { name: "Explorer", exact: true }).click();
      await explorerRow(page, "Quarterly plan").click({ button: "right" });
      await page.getByRole("menuitem", { name: "Share", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Share" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toBeInViewport({ ratio: 1 });
      const box = await dialog.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
    });
  }

  // Centred, it reads as a modal: it takes focus (there is no trigger to keep it) and Escape closes it.
  test("the Share dialog from the sidebar menu takes focus and closes on Escape", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await clearAndTypePageTitle(page, "Quarterly plan");
    await explorerRow(page, "Quarterly plan").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Share", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Share" });
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate((root) => root.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("the anchored share popover closes on Escape", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    await page.getByRole("button", { name: "Share page" }).click();
    const dialog = page.getByRole("dialog", { name: "Share" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("the page context menu clamps above the viewport's bottom edge", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    await page.setViewportSize({ width: 1440, height: 420 });
    // The tree is virtualised and this short a sidebar mounts only the first rows, so the lowest
    // mounted row stands in for the page just created, which is scrolled out of the list.
    await page.getByRole("treeitem").last().click({ button: "right" });
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect.poll(async () => {
      const box = await menu.boundingBox();
      return box.y + box.height;
    }).toBeLessThanOrEqual(420 - 8);
  });

  test("the rail home menu", async ({ page, baseURL }) => {
    await openPage(page, baseURL);
    await page.getByRole("tab", { name: "Home", exact: true }).click();
    const menu = page.getByRole("menu");
    await expectChrome(page, menu);
    await expectMenuRows(page, menu);
    // Focus inside the menu first: closing it removes that element, so only the
    // code that hands focus back keeps the keyboard on the rail.
    await menu.getByRole("menuitem").first().focus();
    await expect(menu.getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(page.getByRole("tab", { name: "Home", exact: true })).toBeFocused();
  });
});

test.describe("home cards draw the panel chrome", () => {
  test("the panel recipe is the panel tokens", async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/?home=workspace`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Home", exact: true }).waitFor();
    const want = await referenceChrome(page, "osio-surface-panel");
    expect(want["border-top-left-radius"]).toBe(await tokenValue(page, "border-top-left-radius", "--osio-radius-panel"));
    expect(want["box-shadow"]).toBe(await tokenValue(page, "box-shadow", "--osio-e1"));
    expect(want["background-color"]).toBe(await tokenValue(page, "background-color", "--osio-bg-surface"));
    expect(want["border-top-color"]).toBe(await tokenValue(page, "border-top-color", "--osio-border-default"));
  });
});
