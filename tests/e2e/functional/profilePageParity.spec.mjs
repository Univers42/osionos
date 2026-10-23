/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profilePageParity.spec.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P2-1-d: the profile page at phone and desktop widths in both themes (own and another's):
// no horizontal overflow, header band, avatar and identity column visible; a shot per case goes
// to target/shots/profile/ for review (no committed baselines: local rendering differs from CI).
// Caveat: scrollWidth <= clientWidth misses overflow clipped by an inner overflow:hidden box.

import { mkdirSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { BOB_PUBLIC, OTHER, giveTheAppABridgeOrigin, heading, mockApi, openProfile, seedSession } from "../support/profilePageMocks.mjs";

const SHOTS = "target/shots/profile";
const BANNER = "/e2e-profile-banner.png";
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const WIDTHS = [375, 1440];
const THEMES = ["light", "dark"];

async function shapeTheViewport(page, width, theme) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript((mode) => localStorage.setItem("osionos:theme-mode", mode), theme);
  // Unmocked lists answer with the SPA's HTML and pile error toasts over the shots.
  const empty = { blocks: [], connections: [], edges: [] };
  await page.route(/\/api\/(social|app-connections|connections)/, (route) => route.fulfill({ json: empty }));
  await page.route(`**${BANNER}`, (route) => route.fulfill({ body: PIXEL, contentType: "image/png" }));
}

async function expectProfileFits(page, name, theme) {
  await expect(heading(page, name)).toBeVisible();
  await expect(page.getByTestId("profile-banner")).toBeVisible();
  await expect(page.getByRole("img", { name, exact: true }).or(page.getByText(name.slice(0, 1), { exact: true })).first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(fits).toBe(true);
}

async function shoot(page, who, width, theme) {
  mkdirSync(SHOTS, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/${who}-${width}-${theme}.png` });
}

async function openOwn(page, baseURL) {
  await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
  await openFreshPage(page, baseURL);
  const mine = await seedSession(page);
  const public_ = { ...BOB_PUBLIC, userId: mine, username: "me-user", displayName: "Me Myself", bannerUrl: BANNER };
  await mockApi(page, { id: mine, username: "me-user", name: "Me Myself", publicBody: public_, profileExtra: { bannerUrl: BANNER } });
  const box = page.getByRole("combobox", { name: "Search pages or run a command" });
  await box.click();
  await box.fill("user:Me");
  await page.getByRole("option").filter({ hasText: "Me Myself" }).first().click();
}

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    test.describe(`profile page, ${width}px, ${theme}`, () => {
      test("another person's page fits and keeps its header band, avatar and identity", async ({ page, baseURL }) => {
        await shapeTheViewport(page, width, theme);
        await mockApi(page, { ...OTHER, name: "Bob Jones", publicBody: { ...BOB_PUBLIC, bannerUrl: BANNER }, profileExtra: { bannerUrl: BANNER } });
        await openProfile(page, baseURL, "Bob");
        await expectProfileFits(page, "Bob Jones", theme);
        await expect(page.getByText("he/him", { exact: true })).toBeVisible();
        await shoot(page, "other", width, theme);
      });

      test("your own page fits and keeps its header band, avatar and identity", async ({ page, baseURL }) => {
        await shapeTheViewport(page, width, theme);
        await openOwn(page, baseURL);
        await expectProfileFits(page, "Me Myself", theme);
        await expect(page.getByRole("button", { name: "Customize", exact: true })).toBeVisible();
        await shoot(page, "own", width, theme);
      });
    });
  }
}

test("another person's DOM never carries directoryOptOut or the e-mail", async ({ page, baseURL }) => {
  await mockApi(page, {
    ...OTHER, name: "Bob Jones",
    publicBody: { ...BOB_PUBLIC, email: "bob-private@example.com", directoryOptOut: true },
    profileExtra: { email: "bob-private@example.com", directoryOptOut: true },
  });
  await openProfile(page, baseURL, "Bob");
  await expect(heading(page, "Bob Jones")).toBeVisible();
  const html = await page.content();
  for (const secret of ["bob-private@example.com", "directoryOptOut", "directory_opt_out"]) {
    expect(html).not.toContain(secret);
  }
});
