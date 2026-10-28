// The Whiteboard rail icon of the built-in app: one static icon in the Apps group while the
// feature is on, for every account, whatever the installed map holds. An installed
// `osionos.whiteboard` (or the retired `osionos.draw`) entry must not add a second one.
// Hydrawn (https://localhost:3008) is mocked.

import { expect, test } from "@playwright/test";

import { HYDRAWN_ORIGIN, mockHydrawn, mockInstalled, skipWhenOffline, WHITEBOARD_INSTALLED } from "../support/whiteboardMocks.mjs";

const rail = (page) => page.getByRole("tablist", { name: "Activity bar" });
const whiteboardIcons = (page) => rail(page).getByRole("tab", { name: "Whiteboard", exact: true });

async function openApp(page, baseURL) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await rail(page).waitFor({ state: "visible" });
}

test.describe("whiteboard rail icon", () => {
  test("is shown exactly once with an empty installed map and opens the whiteboard", async ({ page, baseURL }) => {
    await mockInstalled(page, {});
    await mockHydrawn(page, { slug: "abc123def456" });
    await openApp(page, baseURL);
    await expect(whiteboardIcons(page)).toHaveCount(1);

    await whiteboardIcons(page).click();
    await expect(page.locator(`iframe[src^="${HYDRAWN_ORIGIN}"]`)).toBeVisible();
  });

  test("an installed osionos.whiteboard or osionos.draw adds no second icon", async ({ page, baseURL }) => {
    const installed = {
      ...WHITEBOARD_INSTALLED,
      "osionos.draw": { ...WHITEBOARD_INSTALLED["osionos.whiteboard"], identifier: "osionos.draw", title: "Draw" },
    };
    const probe = await mockInstalled(page, installed);
    await mockHydrawn(page, { slug: "abc123def456" });
    await openApp(page, baseURL);
    await skipWhenOffline(page, probe);
    await expect(whiteboardIcons(page)).toHaveCount(1);
    await expect(rail(page).getByRole("tab", { name: "Draw", exact: true })).toHaveCount(0);
  });

  test("the osio.whiteboard kill-switch hides it", async ({ page, baseURL }) => {
    await page.addInitScript(() => window.localStorage.setItem("osio.whiteboard", "0"));
    await openApp(page, baseURL);
    await expect(rail(page).getByRole("tab", { name: "Marketplace", exact: true })).toHaveCount(1);
    await expect(whiteboardIcons(page)).toHaveCount(0);
  });
});
