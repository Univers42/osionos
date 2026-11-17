/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profileShots.spec.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The filled profile, read mode, as owner and as visitor: status emoji on the avatar, headline,
// bio, pronouns, company, location and links of four kinds. Shots go to target/shots/profile.
// Caveat: a screenshot is evidence for a human to look at; the assertions only pin that the
// facts are on the page and nothing overflows or raises an error toast.

import { mkdirSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { OTHER, accountBackend, expectNoErrorToast, giveTheAppABridgeOrigin, heading, mockAccountBackend, mockApi, openProfileFromPalette, seedSession } from "../support/profilePageMocks.mjs";

const SHOTS = "target/shots/profile";
const VIEWS = [
  { width: 1440, theme: "light" },
  { width: 1440, theme: "dark" },
  { width: 375, theme: "light" },
];
const FACTS = {
  pronouns: "she/her", headline: "Analyst at the engine", bio: "Writes the first program.\nLoves looms and numbers.",
  company: "Analytical Engines", location: "Lyon, France", timezone: "Europe/Paris",
  links: ["https://github.com/ada", "https://www.linkedin.com/in/ada", "https://youtube.com/@ada", "https://ada.example.com"],
};
const STATUS = { emoji: "🎯", text: "Focusing", busy: true, expiresAt: null };

async function shape(page, width, theme) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript((mode) => localStorage.setItem("osionos:theme-mode", mode), theme);
  const empty = { blocks: [], connections: [], edges: [] };
  await page.route(/\/api\/(social|app-connections|connections)/, (route) => route.fulfill({ json: empty }));
}

async function expectFilled(page, name) {
  await expect(heading(page, name)).toBeVisible();
  await expect(page.getByTestId("profile-status-emoji")).toHaveText("🎯");
  const side = page.getByRole("complementary", { name: "Profile details" });
  for (const fact of [FACTS.pronouns, FACTS.headline, "Writes the first program.", FACTS.company, FACTS.location]) {
    await expect(side.getByText(fact).first()).toBeVisible();
  }
  for (const host of ["github.com", "linkedin.com", "youtube.com", "ada.example.com"]) {
    await expect(side.getByRole("link", { name: new RegExp(host) }).first()).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expectNoErrorToast(page);
}

async function shoot(page, who, width, theme) {
  mkdirSync(SHOTS, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/filled-${who}-${width}-${theme}.png` });
}

for (const { width, theme } of VIEWS) {
  test(`owner, read mode, filled, ${width}px ${theme}`, async ({ page, baseURL }) => {
    await shape(page, width, theme);
    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    await openFreshPage(page, baseURL);
    const mine = await seedSession(page);
    const backend = accountBackend(mine, "ada", { ...FACTS, displayName: "Ada Lovelace" });
    backend.status = STATUS;
    await mockApi(page, { id: mine, username: "ada", name: "Ada Lovelace", publicBody: backend.card() });
    await mockAccountBackend(page, backend, "ada");
    await openProfileFromPalette(page, "Ada");
    await expectFilled(page, "Ada Lovelace");
    await expect(page.getByRole("button", { name: "Edit profile", exact: true })).toBeVisible();
    await shoot(page, "owner", width, theme);
  });

  test(`visitor, read mode, filled, ${width}px ${theme}`, async ({ page, baseURL }) => {
    await shape(page, width, theme);
    const card = { userId: OTHER.id, username: OTHER.username, displayName: "Bob Jones", ...FACTS, status: STATUS, avatarUrl: null, bannerUrl: null };
    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    await openFreshPage(page, baseURL);
    await seedSession(page);
    await mockApi(page, { ...OTHER, name: "Bob Jones", publicBody: card });
    await openProfileFromPalette(page, "Bob");
    await expectFilled(page, "Bob Jones");
    await expect(page.getByRole("button", { name: "Edit profile", exact: true })).toHaveCount(0);
    await shoot(page, "visitor", width, theme);
  });
}
