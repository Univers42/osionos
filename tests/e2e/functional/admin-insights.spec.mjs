/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   admin-insights.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P4-5-app: the Insights section of the Admin space. The session is seeded with a role claim and
// the aggregate route is mocked, so the spec proves what the client OFFERS and SHOWS; the
// k>=5 rule itself is the bridge's and is covered by the bridge suites.

import { readdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

import { giveTheAppABridgeOrigin, seedSession, stubRestOfTheBridge } from "../support/bridgeSession.mjs";

const ROUTE = "**/api/account/admin/insights**";
const NOTICE = "Groups with fewer than 5 people are never shown";
const CELLS = [
  { day: "2026-10-20", event: "page.open", surface: "editor", events: 40, users: 7 },
  { day: "2026-10-21", event: "page.open", surface: "editor", events: 25, users: 6 },
];

async function openInsights(page, baseURL, role, body) {
  const requests = [];
  await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
  await seedSession(page, { platform_role: role, is_admin: role === "admin" });
  await stubRestOfTheBridge(page);
  await page.route(ROUTE, (route) => { requests.push(route.request().url()); return route.fulfill({ json: body }); });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  return requests;
}

const adminNav = (page) => page.getByRole("navigation", { name: "Admin sections" });

async function gotoInsights(page) {
  await page.getByRole("tab", { name: "Admin", exact: true }).click();
  await adminNav(page).getByRole("button", { name: "Insights" }).click();
}

test.describe("the Insights section", () => {
  test("an admin sees the chart, the table and the static notice", async ({ page, baseURL }) => {
    const requests = await openInsights(page, baseURL, "admin", { ok: true, cells: CELLS, totalOfShownCells: 65 });
    await gotoInsights(page);
    await expect(page.getByText(NOTICE)).toBeVisible();
    await expect(page.getByRole("img", { name: /Events per day, 2 days, 65 events/ })).toBeVisible();
    await expect(page.getByRole("table").getByText("page.open").first()).toBeVisible();
    expect(requests.some((url) => url.includes("days=30"))).toBe(true);
  });

  test("an empty response is an empty state, not an error, and the notice stays", async ({ page, baseURL }) => {
    await openInsights(page, baseURL, "admin", { ok: true, cells: [], totalOfShownCells: 0 });
    await gotoInsights(page);
    await expect(page.getByText("No activity to show yet")).toBeVisible();
    await expect(page.getByText(NOTICE)).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("the period selector offers 7, 14, 30, 60 and 90 days", async ({ page, baseURL }) => {
    const requests = await openInsights(page, baseURL, "admin", { ok: true, cells: CELLS, totalOfShownCells: 65 });
    await gotoInsights(page);
    await page.getByRole("combobox", { name: "Period" }).click();
    for (const days of [7, 14, 30, 60, 90]) await expect(page.getByRole("option", { name: `Last ${days} days` })).toBeVisible();
    await page.getByRole("option", { name: "Last 7 days" }).click();
    await expect.poll(() => requests.some((url) => url.includes("days=7"))).toBe(true);
  });

  test("a response with a per-user key shows none of it", async ({ page, baseURL }) => {
    const leaky = CELLS.map((cell) => ({ ...cell, user_id: "user-secret-1", userId: "user-secret-2" }));
    await openInsights(page, baseURL, "admin", { ok: true, cells: leaky, totalOfShownCells: 65, workspace_too_small: 3 });
    await gotoInsights(page);
    await expect(page.getByText("page.open").first()).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain("user-secret");
    expect(html).not.toContain("workspace_too_small");
    expect(CELLS.flatMap(Object.keys).filter((key) => /^user(_?id)?$/i.test(key))).toEqual([]);
  });

  test("a moderator does not get the Insights section", async ({ page, baseURL }) => {
    const requests = await openInsights(page, baseURL, "moderator", { ok: true, cells: CELLS, totalOfShownCells: 65 });
    await page.getByRole("tab", { name: "Admin", exact: true }).click();
    await expect(adminNav(page).getByRole("button", { name: "Moderation" })).toBeVisible();
    await expect(adminNav(page).getByRole("button", { name: "Insights" })).toHaveCount(0);
    expect(requests).toEqual([]);
  });

  test("the section lives under sections/insights/ and needs no edit of adminSections", async () => {
    expect(readdirSync("src/widgets/admin-space/sections/insights").sort()).toEqual(["InsightsPanel.tsx", "section.ts"]);
  });
});
