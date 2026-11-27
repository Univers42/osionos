// Each Style card must visibly change the main chrome, not only menus: picked through the real
// Settings radios, the five styles leave five different canvas / topbar / sidebar card / frame
// gap readings, in light and in dark.
// Ponytail: "different" is a computed-style signature; it proves each style paints something
// of its own, not that it looks good. Screenshots are the taste check.

import { expect, test } from "@playwright/test";
import { openFreshPage } from "../../browser/core/app.mjs";
import { openSettings } from "../support/settingsHelpers.mjs";

const STYLES = ["Classic", "Paper", "Soft", "Frost", "Aurora"];

/** What the chrome around the page draws now. */
const chrome = (page) =>
  page.evaluate(() => {
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    const shell = style("[data-osio-shell]");
    const topbar = style('[data-testid="app-topbar"]');
    const card = style('aside:not([data-sidebar-mode="peek"]) [data-osio-sidebar-card]');
    const pane = document.querySelector("[data-osio-pane]").getBoundingClientRect();
    return [
      shell.backgroundColor, shell.backgroundImage, topbar.backgroundColor, topbar.boxShadow,
      card.backgroundColor, card.boxShadow, card.borderTopColor, Math.round(pane.top),
    ].join(" | ");
  });

for (const mode of ["light", "dark"]) {
  test(`every style changes the chrome in ${mode}`, async ({ page, baseURL }) => {
    await page.addInitScript((wanted) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("osionos:theme-mode", wanted);
    }, mode);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshPage(page, baseURL);
    await openSettings(page, "Preferences");
    const group = page.getByRole("group", { name: "Style" });
    const seen = new Map();
    for (const name of STYLES) {
      await group.getByRole("radio", { name: new RegExp(name) }).check({ force: true });
      await expect(group.getByRole("radio", { name: new RegExp(name) })).toBeChecked();
      await page.waitForTimeout(250);
      seen.set(name, await chrome(page));
    }
    expect(new Set(seen.values()).size, JSON.stringify(Object.fromEntries(seen), null, 1)).toBe(STYLES.length);
  });
}
