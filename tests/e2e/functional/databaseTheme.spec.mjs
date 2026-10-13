/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseTheme.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The vendored database ships its own colours; the bridge stylesheet points
// every one of them at the app's tokens. These specs prove it on the real
// screens: the table follows the palette and the mode, portalled menus get the
// same variables, and a chart's series draw in the palette's chart colours.

import { expect, test } from "@playwright/test";

import { insertInlineDatabase } from "../support/databaseHelpers.mjs";

async function bootWith(page, { palette = "warm", mode = "light" } = {}) {
  await page.addInitScript(([storedPalette, storedMode]) => {
    localStorage.setItem("osionos:palette", storedPalette);
    localStorage.setItem("osionos:theme-mode", storedMode);
  }, [palette, mode]);
}

async function openInlineTable(page, options) {
  await bootWith(page, options);
  const block = await insertInlineDatabase(page);
  await block.locator('[aria-label="Add property"]').waitFor();
  return block;
}

/** The colour a token paints, resolved the way the browser resolves it. */
const paintOf = (page, token) =>
  page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  }, token);

const headerBackground = (block) =>
  block.locator("thead tr").first().evaluate((row) => getComputedStyle(row).backgroundColor);

test.describe("database theme bridge", () => {
  test("the table header paints --osio-table-header-bg", async ({ page }) => {
    const block = await openInlineTable(page);
    expect(await headerBackground(block)).toBe(await paintOf(page, "--osio-table-header-bg"));
  });

  test("another palette recolours the table", async ({ page }) => {
    const block = await openInlineTable(page, { palette: "nord" });
    const inNord = await headerBackground(block);
    expect(inNord).toBe(await paintOf(page, "--osio-table-header-bg"));
    await page.evaluate(() => { document.documentElement.dataset.palette = "warm"; });
    expect(await headerBackground(block)).not.toBe(inNord);
  });

  test("dark mode recolours the table", async ({ page }) => {
    const block = await openInlineTable(page, { mode: "dark" });
    const inDark = await headerBackground(block);
    expect(inDark).toBe(await paintOf(page, "--osio-table-header-bg"));
    await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
    expect(await headerBackground(block)).not.toBe(inDark);
  });

  test("the table's own surface is the page surface", async ({ page }) => {
    const block = await openInlineTable(page, { palette: "nord", mode: "dark" });
    const scroller = block.locator("table").locator("xpath=ancestor::div[contains(@class,'bg-surface-primary')][1]");
    expect(await scroller.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await paintOf(page, "--osio-bg-page"));
  });

  test("a portalled menu receives the same variables as the table", async ({ page }) => {
    const block = await openInlineTable(page, { palette: "nord" });
    await block.locator('[aria-label="Add property"]').click();
    await expect(page.getByText("Text", { exact: true })).toBeVisible();
    const inBody = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--color-line-medium").trim());
    const wanted = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--osio-border-default").trim());
    expect(inBody).not.toBe("");
    expect(inBody).toBe(wanted);
  });

  test("a chart's first series is --osio-chart-1", async ({ page }) => {
    await bootWith(page, { palette: "nord", mode: "dark" });
    await page.goto("/?home=database");
    await page.locator('[aria-label="Add view"]').first().waitFor({ timeout: 20_000 });
    await page.locator('[aria-label="Add view"]').first().click();
    await page.getByRole("button", { name: "Chart", exact: true }).first().click();
    await page.getByRole("button", { name: "Chart", exact: true }).first().click();
    await page.getByText("Edit view", { exact: true }).click();
    await page.getByText("What to show").first().click();
    await page.getByRole("button", { name: /Theme/ }).first().click();
    const bar = page.locator(".recharts-bar-rectangle path").first();
    await expect(bar).toBeVisible({ timeout: 20_000 });
    expect(await bar.evaluate((el) => getComputedStyle(el).fill)).toBe(await paintOf(page, "--osio-chart-1"));
  });

  test("the vendored stock shadow and radius classes read the app's tokens", async ({ page }) => {
    await openInlineTable(page, { palette: "nord", mode: "dark" });
    const painted = await page.evaluate(() => {
      const root = document.querySelector(".notion-object-database");
      const style = (className, token, property) => {
        const stock = document.createElement("div");
        stock.className = className;
        const wanted = document.createElement("div");
        wanted.style.setProperty(property, `var(${token})`);
        root.append(stock, wanted);
        const result = [getComputedStyle(stock), getComputedStyle(wanted)].map((s) => s.getPropertyValue(property === "box-shadow" ? "box-shadow" : "border-radius"));
        stock.remove();
        wanted.remove();
        return result;
      };
      return {
        large: style("shadow-lg", "--osio-e3", "box-shadow"),
        huge: style("shadow-2xl", "--osio-e5", "box-shadow"),
        card: style("rounded-2xl", "--osio-radius-card", "border-radius"),
      };
    });
    expect(painted.large[0]).toContain(painted.large[1]);
    expect(painted.huge[0]).toContain(painted.huge[1]);
    expect(painted.card[0]).toBe(painted.card[1]);
  });
});
