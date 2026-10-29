/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageOutlineRail.spec.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The "On this page" rail never rendered: it returned null until it had found
// two headings, but it searched for them from its own (unrendered) root, so the
// scan bailed on mount and never ran again. Once it did, it still hid in any
// pane under 1100px. These tests type real headings.

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";

const SECTIONS = [
  ["# ", "Overview"],
  ["## ", "Getting started"],
  ["### ", "Deep dive"],
];

async function writeLongPage(page, baseURL) {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  for (const [prefix, title] of SECTIONS) {
    await page.keyboard.type(`${prefix}${title}`);
    await page.keyboard.press("Enter");
    for (let i = 0; i < 18; i++) {
      await page.keyboard.type(`Line ${i} of ${title}.`);
      await page.keyboard.press("Enter");
    }
  }
}

const rail = (page) => page.locator("[data-osio-toc]").first();
const ticksButton = (page) => rail(page).getByRole("button", { name: "On this page" });
// A switch in Appearance & layout leaves the menu and its panel open, so open
// them only when they are shut.
const pageMenu = async (page, item) => {
  const panel = page.getByTestId("page-menu-appearance-panel");
  if (!(await panel.isVisible())) {
    if (!(await page.getByTestId("page-config-menu").isVisible())) {
      await page.getByRole("button", { name: "Open page configuration" }).click();
    }
    await page.getByTestId("page-menu-appearance").click();
  }
  await panel.getByRole("button", { name: item, exact: true }).click();
};

// Where the text column's content ends, and where the rail's ticks begin.
const railClearance = (page) => page.evaluate(() => {
  const body = document.querySelector(".osionos-page-body");
  const ticks = document.querySelector("[data-osio-toc] button");
  const textRight = body.getBoundingClientRect().right - parseFloat(getComputedStyle(body).paddingRight);
  return ticks.getBoundingClientRect().left - textRight;
});

const panelLink = (page, name) => rail(page).getByRole("navigation", { name: "On this page" }).getByRole("button", { name });

test.describe("page outline rail", () => {
  test("shows one tick per heading and opens the heading list on hover", async ({ page, baseURL }, testInfo) => {
    await writeLongPage(page, baseURL);
    await expect(ticksButton(page)).toBeVisible();
    await expect(rail(page).locator("[data-level]").filter({ visible: true })).toHaveCount(3);
    // A closed rail holds no copy of the headings' text: getByText finds the heading alone.
    await expect(page.getByText("Getting started", { exact: true })).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath("toc-collapsed.png") });

    await ticksButton(page).hover();
    for (const [, title] of SECTIONS) await expect(panelLink(page, title)).toBeVisible();
    await expect(ticksButton(page)).toHaveAttribute("aria-expanded", "true");
    await page.screenshot({ path: testInfo.outputPath("toc-open.png") });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.screenshot({ path: testInfo.outputPath("toc-open-dark.png") });

    await page.mouse.move(200, 200);
    await expect(panelLink(page, "Overview")).toBeHidden();
    await expect(page.getByText("Getting started", { exact: true })).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath("toc-collapsed-dark.png") });
  });

  test("a heading in the list scrolls the pane to it and becomes the current one", async ({ page, baseURL }) => {
    await writeLongPage(page, baseURL);
    await ticksButton(page).hover();
    await panelLink(page, "Deep dive").click();

    const heading = page.locator('[data-block-type="heading_3"]').first();
    await expect.poll(async () => {
      const [paneTop, headingTop] = await Promise.all([
        page.locator(".osionos-page").first().evaluate((el) => el.getBoundingClientRect().top),
        heading.evaluate((el) => el.getBoundingClientRect().top),
      ]);
      return Math.round(headingTop - paneTop);
    }).toBeLessThan(120);
    await expect(panelLink(page, "Deep dive")).toHaveAttribute("aria-current", "location");
  });

  test("works from the keyboard: focus opens, arrows move, Escape returns", async ({ page, baseURL }) => {
    await writeLongPage(page, baseURL);
    await ticksButton(page).focus();
    await expect(ticksButton(page)).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("ArrowDown");
    const focusedName = () => page.evaluate(() => document.activeElement?.textContent ?? "");
    // The link takes focus a frame after the panel opens.
    await expect.poll(focusedName).not.toBe("");
    expect(SECTIONS.map(([, title]) => title)).toContain(await focusedName());

    await page.keyboard.press("Home");
    expect(await focusedName()).toBe("Overview");
    await page.keyboard.press("ArrowDown");
    expect(await focusedName()).toBe("Getting started");

    await page.keyboard.press("Escape");
    await expect(ticksButton(page)).toBeFocused();
    await expect(ticksButton(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("the page menu turns the rail off and back on", async ({ page, baseURL }) => {
    await writeLongPage(page, baseURL);
    await expect(ticksButton(page)).toBeVisible();

    const toggle = page.getByTestId("page-menu-appearance-panel").getByRole("button", { name: "Table of contents", exact: true });
    await pageMenu(page, "Table of contents");
    await expect(page.locator("[data-osio-toc]")).toHaveCount(0);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await pageMenu(page, "Table of contents");
    await expect(ticksButton(page)).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  test("the page menu hides the page's properties and brings them back", async ({ page, baseURL }) => {
    await writeLongPage(page, baseURL);
    const properties = page.getByRole("group", { name: "Page properties" });
    await expect(properties).toBeVisible();

    const toggle = page.getByTestId("page-menu-appearance-panel").getByRole("button", { name: "Page properties", exact: true });
    await pageMenu(page, "Page properties");
    await expect(properties).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(ticksButton(page)).toBeVisible();

    await pageMenu(page, "Page properties");
    await expect(properties).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  test("Settings › Page switches turns the rail off for the open page", async ({ page, baseURL }) => {
    await writeLongPage(page, baseURL);
    const pageTab = page.locator("[data-osio-tabstrip] [data-tab-id][data-active]");
    const pageTabId = await pageTab.getAttribute("data-tab-id");
    await page.getByRole("button", { name: "Settings", exact: true }).first().click();
    const search = page.getByRole("searchbox", { name: "Search settings" });
    await search.fill("table of contents");
    await search.press("Enter");

    const toggle = page.getByRole("switch", { name: "Table of contents" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    await page.locator(`[data-osio-tabstrip] [data-tab-id="${pageTabId}"]`).click();
    await expect(page.locator(".osionos-page-header")).toBeVisible();
    await expect(page.locator("[data-osio-toc]")).toHaveCount(0);
  });

  test("shows in a pane narrower than the old 1100px cut, clear of the text, full width too", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await writeLongPage(page, baseURL);
    const paneWidth = await page.locator(".osionos-page").first().evaluate((el) => el.clientWidth);
    expect(paneWidth).toBeLessThan(1100);
    await expect(ticksButton(page)).toBeVisible();
    expect(await railClearance(page)).toBeGreaterThanOrEqual(0);

    await pageMenu(page, "Full width");
    await page.locator(".osionos-page--full-width").waitFor();
    await expect(ticksButton(page)).toBeVisible();
    // The page menu, still open, covers the rail rather than the reverse.
    expect(await page.evaluate(() => {
      const ticks = document.querySelector("[data-osio-toc] button").getBoundingClientRect();
      const hit = document.elementFromPoint(ticks.left + ticks.width / 2, ticks.top + ticks.height / 2);
      return Boolean(hit?.closest('[data-testid="page-config-menu"]'));
    })).toBe(true);
    expect(await railClearance(page)).toBeGreaterThanOrEqual(0);
  });

  test("a heading folded inside a collapsed toggle is unfolded and scrolled to", async ({ page, baseURL }) => {
    await writeLongPage(page, baseURL);
    await page.keyboard.type("# ");
    await page.keyboard.type("> ");
    await page.keyboard.type("Folded");
    await page.keyboard.press("Enter");
    await page.keyboard.type("## Inside");
    const inside = page.locator('[data-block-id][data-block-type="heading_2"]', { hasText: "Inside" });
    await expect(inside).toBeVisible();

    await page.getByRole("button", { name: "Collapse toggle" }).click();
    await expect(inside).toHaveCount(0);
    await page.locator(".osionos-page").first().evaluate((el) => el.scrollTo(0, 0));

    await ticksButton(page).hover();
    await panelLink(page, "Inside").click();
    await expect(page.getByRole("button", { name: "Collapse toggle" })).toHaveAttribute("aria-expanded", "true");
    await expect(inside).toBeInViewport();
  });
});
