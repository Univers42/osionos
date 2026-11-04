// #290: an uppercase theme rewrote content shown in raw buttons (page titles in Recents, settings
// sections), and the theme's selection colour never applied (an unlayered ::selection won).

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { openSettings } from "../support/settingsHelpers.mjs";

test("a theme's button case reaches action buttons only, and its selection colour applies", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  await openSettings(page);
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--osio-button-transform", "uppercase");
    document.documentElement.style.setProperty("--osio-selection-bg", "rgb(46, 89, 125)");
  });
  const style = (locator, property, pseudo) => locator.evaluate((el, [p, ps]) => getComputedStyle(el, ps ?? null)[p], [property, pseudo]);
  const atom = page.locator("[data-osio-button]").first();
  const raw = page.getByRole("navigation", { name: "Settings sections" }).locator("button:not([data-osio-button])").first();
  await expect(atom).toBeVisible();
  await expect(raw).toBeVisible();
  expect(await style(atom, "textTransform")).toBe("uppercase");
  expect(await style(raw, "textTransform")).toBe("none");
  expect(await style(page.locator("body"), "backgroundColor", "::selection")).toBe("rgb(46, 89, 125)");
});
