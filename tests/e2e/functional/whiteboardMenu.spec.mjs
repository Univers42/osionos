// View > New whiteboard: creates an Untitled board and opens it in its own tab, or says why
// it could not. The drawnosaurus service (https://localhost:3007) is mocked, so no real
// board is created.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { mockWhiteboardService } from "../support/whiteboardMocks.mjs";

const SLUG = "abc123def456";

async function clickNewWhiteboard(page) {
  await page.getByRole("navigation", { name: "Application menu" }).getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: "New whiteboard", exact: true }).click();
}

test.describe("View > New whiteboard", () => {
  test("creates an Untitled board and opens a tab on its slug", async ({ page, baseURL }) => {
    const created = [];
    await mockWhiteboardService(page, { slug: SLUG, title: "Untitled", onCreate: (body) => created.push(body) });
    await openFreshPage(page, baseURL);

    await clickNewWhiteboard(page);

    await expect(page.locator(`iframe[src$="/boards/${SLUG}"]`)).toBeVisible();
    expect(created).toEqual([{ title: "Untitled" }]);
  });

  test("a failed creation shows an error toast and opens no tab", async ({ page, baseURL }) => {
    let posts = 0;
    await page.route("https://localhost:3007/**", (route) => {
      posts += 1;
      return route.fulfill({ status: 500, json: { error: { code: "internal", message: "Board service is down." } } });
    });
    await openFreshPage(page, baseURL);
    const tabs = page.locator("[data-tab-id]");
    const tabsBefore = await tabs.count();

    await clickNewWhiteboard(page);

    const toast = page.getByRole("status").filter({ hasText: "Could not create the whiteboard" });
    await expect(toast).toContainText("Board service is down.");
    await expect(tabs).toHaveCount(tabsBefore);
    await expect(page.locator('iframe[src*="/boards/"]')).toHaveCount(0);
    expect(posts).toBe(1);
  });
});
