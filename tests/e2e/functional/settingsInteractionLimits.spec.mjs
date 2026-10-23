/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsInteractionLimits.spec.mjs                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";


const ROUTE = "**/api/account/moderation-settings";
const FUTURE = new Date(Date.now() + 5 * 24 * 3_600_000).toISOString();
const FIXTURE = { messages: { mode: "connections", until: FUTURE }, connections: { mode: "everyone" }, comments: { mode: "everyone" } };

function region(page) {
  return page.getByRole("region", { name: "Settings", exact: true });
}

function appErrors(consoleErrors) {
  return consoleErrors.filter((text) => !text.startsWith("Failed to load resource"));
}

async function giveTheAppABridgeOrigin(page, origin) {
  await page.route("**/src/shared/api/client.ts", async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({ response, body: source.replace(/("VITE_API_URL":\s*)""/, `$1"${origin}"`) });
  });
}

async function openPanel(page, baseURL, handler) {
  await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
  await page.route("**/api/social/blocks", (route) => route.fulfill({ json: { ok: true, blocks: [] } }));
  await page.route(ROUTE, handler);
  await page.goto(new URL("/?settings=moderation#interaction-limits", baseURL).toString());
  await expect(region(page)).toBeVisible();
}

function rowOf(page, title) {
  return region(page).getByText(title, { exact: true }).locator("xpath=ancestor::div[contains(@class,'justify-between')][1]");
}

test.describe("the interaction limits panel", () => {
  test("the three rows show the stored limit and No limit for the rest", async ({ page, baseURL }) => {
    const consoleErrors = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await openPanel(page, baseURL, (route) => route.fulfill({ json: FIXTURE }));
    const r = region(page);
    const messages = rowOf(page, "Who can direct message me");
    await expect(messages.getByRole("combobox", { name: /who$/ })).toHaveText(/People you are connected to/);
    await expect(messages.getByText(/^Until \d{1,2} \w{3} \d{4}$/)).toBeVisible();
    await expect(rowOf(page, "Who can connect with me").getByText("No limit")).toBeVisible();
    await expect(rowOf(page, "Who can comment on my pages").getByText("No limit")).toBeVisible();
    await expect(rowOf(page, "Who can connect with me").getByRole("combobox", { name: /for how long$/ })).toBeDisabled();
    await expect(r.getByText(/channel, a workspace invite and a page comment/)).toBeVisible();
    await expect(r.getByText("A block does not stop a comment.")).toBeVisible();
    expect(appErrors(consoleErrors)).toEqual([]);
  });

  test("choosing Nobody patches the mode with 24 hours and shows the answered until", async ({ page, baseURL }) => {
    let patched = null;
    await openPanel(page, baseURL, async (route) => {
      if (route.request().method() === "PATCH") {
        patched = route.request().postDataJSON();
        return route.fulfill({ json: { ...FIXTURE, connections: { mode: "nobody", until: FUTURE } } });
      }
      return route.fulfill({ json: { messages: { mode: "everyone" }, connections: { mode: "everyone" }, comments: { mode: "everyone" } } });
    });
    const row = rowOf(page, "Who can connect with me");
    await row.getByRole("combobox", { name: /who$/ }).click();
    await page.getByRole("option", { name: "Nobody" }).click();
    await expect(row.getByText(/^Until \d{1,2} \w{3} \d{4}$/)).toBeVisible();
    expect(patched).toEqual({ connections: { mode: "nobody", durationHours: 24 } });
  });

  test("a 500 on save shows the message on the row and keeps the previous value", async ({ page, baseURL }) => {
    const consoleErrors = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await openPanel(page, baseURL, (route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({ status: 500, json: { ok: false, message: "boom" } })
        : route.fulfill({ json: FIXTURE }));
    const row = rowOf(page, "Who can direct message me");
    await row.getByRole("combobox", { name: /who$/ }).click();
    await page.getByRole("option", { name: "Nobody" }).click();
    await expect(region(page).getByText("boom")).toBeVisible();
    await expect(row.getByRole("combobox", { name: /who$/ })).toHaveText(/People you are connected to/);
    expect(appErrors(consoleErrors)).toEqual([]);
  });

  test("a bare 404 says the server does not serve interaction limits yet", async ({ page, baseURL }) => {
    await openPanel(page, baseURL, (route) => route.fulfill({ status: 404, body: "" }));
    await expect(region(page).getByText("This server does not serve interaction limits yet.")).toBeVisible();
    await expect(region(page).getByText("Who can direct message me")).toHaveCount(0);
  });

  test("at 375px the rows do not overflow the settings pane", async ({ page, baseURL }) => {
    await openPanel(page, baseURL, (route) => route.fulfill({ json: FIXTURE }));
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(region(page).getByText("Who can comment on my pages")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
