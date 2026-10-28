// View > Whiteboard: opens hydrawn's board gallery in its own tab. Creating boards is the
// gallery's job and the inline block's, so the menu creates nothing. Hydrawn
// (https://localhost:3008) is mocked.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { HYDRAWN_ORIGIN, mockHydrawn } from "../support/whiteboardMocks.mjs";

test.describe("View > Whiteboard", () => {
  test("opens the board gallery in a tab and creates no board", async ({ page, baseURL }) => {
    const created = [];
    await mockHydrawn(page, { slug: "abc123def456", onCreate: (title) => created.push(title) });
    await openFreshPage(page, baseURL);

    await page.getByRole("navigation", { name: "Application menu" }).getByRole("button", { name: "View", exact: true }).click();
    await page.getByRole("menuitem", { name: "Whiteboard", exact: true }).click();

    await expect(page.locator(`iframe[src^="${HYDRAWN_ORIGIN}"]`)).toBeVisible();
    await expect(page.locator('iframe[src*="/boards/"], iframe[src*="/new"]')).toHaveCount(0);
    expect(created).toEqual([]);
  });
});
