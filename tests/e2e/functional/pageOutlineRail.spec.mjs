/* ************************************************************************** */
/*                                                                            */
/*   pageOutlineRail.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur         #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// The table of contents rail shows on a laptop-width pane with the sidebar open
// (it used to hide below a 1100 px pane), lists the headings on hover, still
// steps aside on a phone, and goes away (with the page properties) when the
// person turns it off in Settings > Preferences > Page layout.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const HEADINGS = [
  { id: "toc-h1", type: "heading_1", content: "Overview" },
  { id: "toc-p1", type: "paragraph", content: "Intro text" },
  { id: "toc-h2", type: "heading_2", content: "Details" },
  { id: "toc-h3", type: "heading_3", content: "Edge cases" },
];

async function seedHeadings(page) {
  // Wait and write in one step: the fresh page can drop back to no active page
  // between a separate wait and the write.
  await page.waitForFunction(async (blocks) => {
    const { usePageStore } = await import("/src/store/usePageStore.ts");
    const store = usePageStore.getState();
    if (!store.activePage) return false;
    store.updatePageContent(store.activePage.id, blocks);
    return true;
  }, HEADINGS);
  await page.locator('[data-block-id="toc-h3"]').waitFor();
}

const outline = (page) => page.getByRole("navigation", { name: "On this page" });
const ticks = (page) => page.getByRole("button", { name: /table of contents|on this page/i });

test.describe("the page outline rail", () => {
  test("shows on a 1280 px window with the sidebar open and lists the headings", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openFreshPage(page, baseURL);
    await seedHeadings(page);

    await expect(ticks(page)).toBeVisible();
    await ticks(page).hover();
    for (const text of ["Overview", "Details", "Edge cases"]) {
      await expect(outline(page).getByRole("button", { name: text })).toBeVisible();
    }
  });

  test("steps aside on a phone", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openFreshPage(page, baseURL);
    await seedHeadings(page);
    await expect(ticks(page)).toBeHidden();
  });

  test("Page layout switches hide the rail and the properties, and survive a reload", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openFreshPage(page, baseURL);
    await seedHeadings(page);
    await expect(ticks(page)).toBeVisible();

    await page.getByRole("button", { name: "Settings", exact: true }).first().click();
    await page.getByRole("region", { name: "Settings", exact: true }).waitFor();
    await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Preferences" }).click();
    await page.getByRole("switch", { name: "Table of contents" }).click();
    await page.getByRole("switch", { name: "Page properties" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-page-outline", "hide");
    await expect(page.locator("html")).toHaveAttribute("data-page-properties", "hide");
    await page.keyboard.press("Escape");

    await expect(ticks(page)).toBeHidden();
    // A fresh page has no properties, so a probe with the real class stands in.
    const probeDisplay = () => page.evaluate(() => {
      const probe = document.createElement("div");
      probe.className = "osionos-page-properties";
      document.querySelector(".osionos-page")?.append(probe);
      const display = getComputedStyle(probe).display;
      probe.remove();
      return display;
    });
    expect(await probeDisplay()).toBe("none");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-page-outline", "hide");
    await expect(page.locator("html")).toHaveAttribute("data-page-properties", "hide");
  });
});
