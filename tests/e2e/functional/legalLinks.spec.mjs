// #294: the subject (III.2) requires the Privacy Policy and the Terms of Service to be reachable
// from inside osionos. They live on the public site; the test build's site is the dev default
// (https://localhost:4322 under make all, http://localhost:4322 under vite), so only the path
// is asserted.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const PAGES = [["Privacy Policy", /\/legal\/privacy-policy\/$/], ["Terms of Service", /\/legal\/terms\/$/]];

test.describe("Legal links", () => {
  test("the sidebar links both pages, each in a new tab", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const legal = page.getByRole("navigation", { name: "Legal" });
    for (const [label, path] of PAGES) {
      const link = legal.getByRole("link", { name: label, exact: true });
      await expect(link).toHaveAttribute("href", path);
      await expect(link).toHaveAttribute("target", "_blank");
    }
  });

  test("the Help menu opens each page", async ({ page, baseURL }) => {
    // The public site is not running here: its pages answer from the test.
    await page.context().route("**/legal/**", (route) => route.fulfill({ contentType: "text/html", body: "<title>legal</title>" }));
    await openFreshPage(page, baseURL);
    for (const [label, path] of PAGES) {
      await page.getByRole("navigation", { name: "Application menu" }).getByRole("button", { name: "Help", exact: true }).click();
      const opened = page.waitForEvent("popup");
      await page.getByRole("menuitem", { name: label, exact: true }).click();
      const popup = await opened;
      await popup.waitForURL(path);
      await popup.close();
    }
  });
});
