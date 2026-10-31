/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsPages.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P5-5-c: the "Published pages" settings panel. It replaced the public-pages
// mock, so what is proved here is that the panel reads the bridge's list
// (GET /api/account/published-pages), shows the status word of every row,
// republishes and unpublishes through the EXISTING publish routes, and treats
// a disabled publish feature as a state rather than an error.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const TOKEN_LIVE = "0123456789abcdef0123456789abcdef";
const TOKEN_STALE = "fedcba9876543210fedcba9876543210";
const PAGE_LIVE = "11111111-1111-4111-8111-111111111111";
const PAGE_STALE = "22222222-2222-4222-8222-222222222222";

const FIXTURE_PAGES = [
  {
    pageId: PAGE_LIVE,
    token: TOKEN_LIVE,
    title: "Launch notes",
    icon: "📄",
    publishedAt: "2026-10-01T09:00:00.000Z",
    status: "live",
  },
  {
    pageId: PAGE_STALE,
    token: TOKEN_STALE,
    title: "Roadmap",
    icon: "🗺️",
    publishedAt: "2026-10-02T09:00:00.000Z",
    status: "outdated",
  },
];

function region(page) {
  return page.getByRole("region", { name: "Settings", exact: true });
}

function nav(page) {
  return page.getByRole("navigation", { name: "Settings sections" });
}

/**
 * The browser logs every non-2xx response as a console error of its own. That
 * line is the network's, not the app's: what the panel must never add is a
 * console error of its own (or an unhandled rejection) for a state it knows.
 */
function appErrors(consoleErrors) {
  return consoleErrors.filter((text) => !text.startsWith("Failed to load resource"));
}

/** The publish feature is off by default in the app; the panel is behind it. */
async function enablePublishFlag(page) {
  await page.addInitScript(() => window.localStorage.setItem("osio.publish", "1"));
}

/**
 * The Playwright harness builds the app OFFLINE (VITE_API_URL=''), and the
 * shared HTTP client refuses to fetch at all without a bridge origin. The test
 * gives the app one — its own origin — by patching the SERVED module, so the
 * panel's requests leave the browser and page.route can answer them. The
 * application's own source is never touched.
 * Caveat: an online build (VITE_API_URL set) already has an origin, so the
 * patch leaves it alone.
 */
async function giveTheAppABridgeOrigin(page, origin) {
  await page.route("**/src/shared/api/client.ts", async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const patched = source.replace(/("VITE_API_URL":\s*)""/, `$1"${origin}"`);
    await route.fulfill({ response, body: patched });
  });
}

/** The panel's list and the two publish routes, over one mutable fixture; `refusal` answers every publish. */
async function stubTheBridge(page, { pages = FIXTURE_PAGES, refusal = null } = {}) {
  const state = { pages: [...pages], published: [], unpublished: [] };
  await page.route("**/api/account/published-pages", (route) =>
    route.fulfill({ json: { ok: true, pages: state.pages } }),
  );
  await page.route("**/api/pages/*/publish", (route) => {
    const request = route.request();
    const pageId = request.url().split("/api/pages/")[1]?.split("/")[0] ?? "";
    if (request.method() === "DELETE") {
      state.unpublished.push(pageId);
      state.pages = state.pages.filter((entry) => entry.pageId !== pageId);
    } else {
      state.published.push(pageId);
      if (refusal) return route.fulfill(refusal);
    }
    return route.fulfill({ json: { ok: true, token: TOKEN_LIVE } });
  });
  return state;
}

async function openPublishedPages(page) {
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await region(page).waitFor();
  await nav(page).getByRole("button", { name: "Published pages", exact: true }).click();
  await expect(region(page).locator('[data-settings-panel="public_pages"]')).toBeVisible();
}

test.describe("the published pages panel", () => {
  test("the section nav lists Published pages and the panel shows every published row", async ({ page, baseURL }) => {
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await enablePublishFlag(page);
    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    await stubTheBridge(page);

    await openFreshPage(page, baseURL);
    await openPublishedPages(page);

    await expect(nav(page).getByRole("button", { name: "Published pages", exact: true })).toBeVisible();
    await expect(region(page).getByRole("heading", { level: 1, name: "Published pages" })).toBeVisible();

    const rows = region(page).locator("table tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Launch notes");
    await expect(rows.nth(0)).toContainText("Live");
    await expect(rows.nth(1)).toContainText("Roadmap");
    await expect(rows.nth(1)).toContainText("Out of date");

    // The public link of the first row is the app origin plus /p/<token>.
    const link = rows.nth(0).getByRole("link", { name: /public page of Launch notes/i });
    await expect(link).toHaveAttribute("href", `${new URL(baseURL).origin}/p/${TOKEN_LIVE}`);
    await expect(rows.nth(0).locator("input[readonly]")).toHaveValue(
      `${new URL(baseURL).origin}/p/${TOKEN_LIVE}`,
    );

    expect(appErrors(consoleErrors), "the panel logged a console error").toEqual([]);
  });

  test("Republish calls the publish route and keeps the row's public URL", async ({ page, baseURL }) => {
    await enablePublishFlag(page);
    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    const state = await stubTheBridge(page);

    await openFreshPage(page, baseURL);
    await openPublishedPages(page);

    const row = region(page).locator("table tbody tr").nth(0);
    await row.getByRole("button", { name: "Republish" }).click();

    await expect.poll(() => state.published.length).toBe(1);
    expect(state.published[0]).toBe(PAGE_LIVE);
    await expect(row.locator("input[readonly]")).toHaveValue(
      `${new URL(baseURL).origin}/p/${TOKEN_LIVE}`,
    );
  });

  // A refused republish passed for done: publishPage answers a result object, never a falsy token.
  for (const [what, refusal, says] of [
    ["the owner check", { status: 403, json: { ok: false, message: "Only the owner can publish." } }, "Only the owner can publish."],
    ["the moderation check", {
      status: 409,
      json: { ok: false, code: "moderation_warning", message: "This may hurt someone. Edit it, or post it anyway.", details: { reasons: ["insult"], terms: [] } },
    }, "Not republished: the moderation check flagged this page. Edit it, or publish it from its Share menu."],
  ]) {
    test(`a republish refused by ${what} says so on its row`, async ({ page, baseURL }) => {
      await enablePublishFlag(page);
      await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
      const state = await stubTheBridge(page, { refusal });

      await openFreshPage(page, baseURL);
      await openPublishedPages(page);

      const row = region(page).locator("table tbody tr").nth(0);
      await row.getByRole("button", { name: "Republish" }).click();

      await expect.poll(() => state.published.length).toBe(1);
      await expect(row).toContainText(says);
    });
  }

  test("Unpublish calls the unpublish route and the row disappears", async ({ page, baseURL }) => {
    await enablePublishFlag(page);
    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    const state = await stubTheBridge(page);

    await openFreshPage(page, baseURL);
    await openPublishedPages(page);

    const rows = region(page).locator("table tbody tr");
    await expect(rows).toHaveCount(2);
    await rows.nth(0).getByRole("button", { name: "Unpublish" }).click();

    await expect.poll(() => state.unpublished.length).toBe(1);
    expect(state.unpublished[0]).toBe(PAGE_LIVE);
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText("Roadmap");
  });

  test("a disabled publish feature is a state, not an error", async ({ page, baseURL }) => {
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await enablePublishFlag(page);
    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    await page.route("**/api/account/published-pages", (route) =>
      route.fulfill({
        status: 404,
        json: { ok: false, code: "publish_disabled", message: "Publishing is disabled." },
      }),
    );

    await openFreshPage(page, baseURL);
    await openPublishedPages(page);

    await expect(region(page).getByText(/publishing is off on the server/i)).toBeVisible();
    await expect(region(page).locator("table")).toHaveCount(0);
    expect(appErrors(consoleErrors), "a disabled publish feature logged a console error").toEqual([]);
  });

  test("at a phone width the table does not overflow the settings pane", async ({ page, baseURL }) => {
    await enablePublishFlag(page);
    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    await stubTheBridge(page);

    await openFreshPage(page, baseURL);
    await openPublishedPages(page);
    await page.setViewportSize({ width: 375, height: 812 });

    const pane = region(page);
    await expect(pane.locator("table")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // The table scrolls INSIDE its own box; the box itself stays in the pane.
    const box = await pane.locator("table").first().locator("xpath=..").boundingBox();
    const paneBox = await pane.boundingBox();
    expect(box.x + box.width, "the table box stays inside the settings pane").toBeLessThanOrEqual(
      paneBox.x + paneBox.width + 1,
    );
  });
});
