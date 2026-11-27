// WCAG 2.x A + AA, as axe-core checks it, on the surfaces the sidebar-rail stack added:
// Settings' AI sections, the assistant's sidebar panel, the welcome's Start/Recent, and
// an auto-hidden title bar revealed at the top edge (devil WP-5, 2026-11-27).
// Caveat: axe finds machine-checkable failures only; keyboard order and reading order
// still need a human pass, so a green run here is not an AA claim.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { closeAllTabs, openFreshPage } from "../../browser/core/app.mjs";
import { openSettings } from "../support/settingsHelpers.mjs";
import { chooseViewAppearance } from "../support/viewMenu.mjs";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const AI_SECTIONS = ["osionos AI", "AI agents", "AI skills", "AI memory", "AI connections"];

async function violations(page) {
  const { violations: found } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  return found.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(" ")), count: v.nodes.length }));
}

for (const theme of ["light", "dark"]) {
  test.describe(`new surfaces, WCAG AA, ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((mode) => localStorage.setItem("osionos:theme-mode", mode), theme);
    });

    test("each AI section of Settings has no AA violation", async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      for (const label of AI_SECTIONS) {
        await openSettings(page, label);
        expect(await violations(page), label).toEqual([]);
      }
    });

    test("the assistant's sidebar panel has no AA violation", async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      await page.getByRole("tab", { name: "Assistant", exact: true }).click();
      await expect(page.locator('[data-sidebar-panel="assistant"]')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("the welcome's Start and Recent have no AA violation", async ({ page, baseURL }) => {
      await openFreshPage(page, baseURL);
      await closeAllTabs(page);
      await expect(page.getByTestId("empty-workspace")).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("an auto-hidden title bar revealed at the top edge has no AA violation", async ({ page, baseURL }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openFreshPage(page, baseURL);
      await chooseViewAppearance(page, "Auto-hide title bar", "menuitemcheckbox");
      await page.mouse.move(720, 2);
      await expect.poll(async () => {
        const box = await page.getByTestId("app-topbar").boundingBox();
        return box.y + box.height;
      }).toBeGreaterThan(30);
      expect(await violations(page)).toEqual([]);
    });
  });
}
