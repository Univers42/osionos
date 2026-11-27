/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   paletteModes.spec.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The top bar is the app's one entry point: the first character picks the mode,
// the icon and the chip follow it, and the mode decides what may leave the
// browser. Each test names the devil condition it proves (palette-modes ruling).

import { expect, test } from "@playwright/test";

import { closeAllTabs, openFreshPage } from "../../browser/core/app.mjs";
import { giveTheAppABridgeOrigin } from "../support/bridgeSession.mjs";
import { mockPageCreate } from "../support/profilePageMocks.mjs";

const bar = (page) => page.getByRole("combobox", { name: "Search pages or run a command" });
const barMode = (page) => page.locator("[data-palette-mode]");
const chip = (page) => page.locator("#osio-topbar-mode");
const composer = (page) => page.getByPlaceholder("Ask osionos AI…");
const welcomeAsk = (page) => page.getByTestId("empty-workspace").getByRole("button", { name: /^Ask Binocle/ });

// The bar waits this long after the last key before it searches (usePaletteResults.ts).
const DEBOUNCE_MS = 180;
// Caveat: a request that is NOT sent can only be waited for. Three debounces covers the
// bar's own timer; a search that started later than that would be missed by these checks.
const quietFor = (page) => page.waitForTimeout(DEBOUNCE_MS * 3);

/** Sends the bar's searches to the dev server, answers them empty, and returns a live list
 *  of the paths of every request whose URL or body carries `token`. */
async function recordRequestsCarrying(page, baseURL, token) {
  await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
  await mockPageCreate(page);
  await page.route("**/api/pages/search**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/directory/search**", (route) => route.fulfill({ json: { people: [] } }));
  await page.route("**/api/chat/search**", (route) => route.fulfill({ json: { hits: [] } }));
  const carried = [];
  page.on("request", (request) => {
    if (`${request.url()} ${request.postData() ?? ""}`.includes(token)) carried.push(new URL(request.url()).pathname);
  });
  return carried;
}

test.describe("top bar modes", () => {
  test("each prefix names its mode with the icon and a chip; a plain search has neither", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const modes = [[">", "command", "Commands"], [":", "setting", "Settings"], ["/", "ask", "Ask Binocle"],
      ["@", "people", "People"], ["#", "messages", "Messages"], ["?", "help", "Help"]];
    for (const [prefix, mode, label] of modes) {
      await bar(page).fill(prefix);
      await expect(barMode(page)).toHaveAttribute("data-palette-mode", mode);
      await expect(chip(page)).toHaveText(label);
    }
    await bar(page).fill("roadmap");
    await expect(barMode(page)).toHaveAttribute("data-palette-mode", "search");
    await expect(chip(page)).toHaveCount(0);
  });

  // PM3
  test("with message search off, '#' is a plain search and '?' does not offer it", async ({ page, baseURL }) => {
    await page.addInitScript(() => localStorage.setItem("osio.search.unified", "0"));
    await openFreshPage(page, baseURL);
    await bar(page).fill("#1 roadmap");
    await expect(barMode(page)).toHaveAttribute("data-palette-mode", "search");
    await expect(chip(page)).toHaveCount(0);
    await bar(page).fill("?");
    await expect(page.getByRole("option", { name: /^People/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /^Messages/ })).toHaveCount(0);
  });

  // PM1
  test("Ctrl+Shift+P and the welcome's Ask leave the caret after the prefix, so typing keeps it", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await page.keyboard.press("Control+Shift+P");
    await expect(bar(page)).toBeFocused();
    await page.keyboard.type("notif");
    await expect(bar(page)).toHaveValue(">notif");
    await page.keyboard.press("Escape");

    await closeAllTabs(page);
    await welcomeAsk(page).click();
    await expect(bar(page)).toBeFocused();
    await page.keyboard.type("Plan");
    await expect(bar(page)).toHaveValue("/Plan");
  });

  // PM4
  test("only search, '@' and '#' reach the network, each only its own endpoints", async ({ page, baseURL }) => {
    const token = "zq7palette";
    const carried = await recordRequestsCarrying(page, baseURL, token);
    await openFreshPage(page, baseURL);

    for (const prefix of [">", ":", "?", "/"]) {
      await bar(page).fill(`${prefix}${token}`);
      await quietFor(page);
    }
    expect(carried).toEqual([]);

    await bar(page).fill(`@${token}`);
    await expect.poll(() => [...carried]).toContain("/api/directory/search");
    await quietFor(page);
    expect([...new Set(carried)]).toEqual(["/api/directory/search"]);

    carried.length = 0;
    await bar(page).fill(`#${token}`);
    await expect.poll(() => [...carried]).toContain("/api/chat/search");
    await quietFor(page);
    expect([...new Set(carried)]).toEqual(["/api/chat/search"]);

    carried.length = 0;
    await bar(page).fill(token);
    await expect.poll(() => [...carried]).toEqual(expect.arrayContaining(["/api/directory/search", "/api/chat/search"]));
    await quietFor(page);
    expect(carried.filter((path) => !["/api/pages/search", "/api/directory/search", "/api/chat/search"].includes(path))).toEqual([]);
  });

  // PM16
  test("'/' hands the question to the assistant unsent, with no page attached", async ({ page, baseURL }) => {
    const token = "zq7plan";
    const carried = await recordRequestsCarrying(page, baseURL, token);
    await openFreshPage(page, baseURL);

    await bar(page).fill(`/Plan my week ${token}`);
    await expect(page.getByRole("option", { name: /Ask Binocle: “Plan my week/ })).toBeVisible();
    await bar(page).press("Enter");
    await expect(composer(page)).toHaveValue(new RegExp(`Plan my week ${token}`), { timeout: 15_000 });
    await expect(page.getByTestId("ai-context-chips")).toHaveCount(0);
    await expect(bar(page)).toHaveValue("");
    await quietFor(page);
    expect(carried).toEqual([]);
  });

  // PM13
  test("in zen mode, where the bar is hidden, the welcome's Ask opens the assistant", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await closeAllTabs(page);
    await page.keyboard.press("Control+k");
    await page.keyboard.press("Control+z");
    await expect(page.locator('[data-zen="1"]')).toHaveCount(1);
    await expect(bar(page)).toBeHidden();
    await welcomeAsk(page).click();
    await expect(composer(page)).toBeVisible({ timeout: 15_000 });
  });

  // PM6, PM10, PM12
  test("':' changes the theme from the keyboard, and choosing the current value writes nothing", async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      globalThis.__themeWrites = 0;
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function countThemeWrites(key, value) {
        if (key === "osionos:theme-mode") globalThis.__themeWrites += 1;
        return setItem.call(this, key, value);
      };
    });
    const themeWrites = () => page.evaluate(() => globalThis.__themeWrites);
    await page.emulateMedia({ colorScheme: "light" });
    await openFreshPage(page, baseURL);
    const before = await themeWrites();

    await bar(page).click();
    await page.keyboard.type(":theme d");
    await expect(page.getByRole("option").first()).toContainText("Theme: Dark");
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(bar(page)).toHaveValue("");
    expect(await themeWrites()).toBe(before + 1);

    await bar(page).click();
    await page.keyboard.type(":");
    await expect(page.getByRole("option").first()).toContainText("Theme");
    await page.keyboard.press("Enter");
    await expect(bar(page)).toHaveValue(":Theme ");
    await expect(bar(page)).toBeFocused();
    await page.keyboard.type("dark");
    const current = page.getByRole("option", { name: /Theme: Dark/ });
    await expect(current).toContainText("Current");
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await themeWrites()).toBe(before + 1);
  });
});
