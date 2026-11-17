// U1: the sidebar shows what the card serves (status, headline, bio, facts) and the opened
// profile page has no WCAG 2.x A/AA violation in read mode, in both themes.
// Caveat: axe proves machine-checkable failures only; keyboard order and reading order still
// need a human pass, so a green run here is not an AA claim.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { BOB_PUBLIC, OTHER, giveTheAppABridgeOrigin, heading, mockApi, openProfile, openProfileFromPalette, seedSession } from "../support/profilePageMocks.mjs";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const FULL_CARD = {
  ...BOB_PUBLIC,
  headline: "Product designer",
  bio: "Designs calm tools.\nBased in Brooklyn.",
  status: { emoji: "🎯", text: "Heads down", expiresAt: null, busy: true },
};

async function axeViolations(page) {
  const { violations } = await new AxeBuilder({ page }).include("main, [data-testid='profile-banner'], aside").withTags(WCAG_AA).analyze();
  return violations.map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
}

async function openOther(page, baseURL, theme) {
  await page.addInitScript((mode) => localStorage.setItem("osionos:theme-mode", mode), theme);
  await mockApi(page, { ...OTHER, name: "Bob Jones", publicBody: FULL_CARD });
  await openProfile(page, baseURL, "Bob");
  await expect(heading(page, "Bob Jones")).toBeVisible();
}

test("the sidebar shows the typed status, headline and bio from the card", async ({ page, baseURL }) => {
  await openOther(page, baseURL, "light");
  const side = page.getByRole("complementary", { name: "Profile details" });
  await expect(side.getByText("Product designer")).toBeVisible();
  await expect(side.getByText("Designs calm tools.")).toBeVisible();
  await expect(side.getByTestId("profile-status")).toContainText("Heads down");
  await expect(page.getByTestId("profile-status-emoji")).toHaveText("🎯");
});

test("a visitor sees no call-to-action rows on someone else's page", async ({ page, baseURL }) => {
  await openOther(page, baseURL, "light");
  await expect(page.getByRole("button", { name: /^Add a / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Write your README" })).toHaveCount(0);
});

for (const theme of ["light", "dark"]) {
  test(`axe: another person's profile page, read mode, ${theme}`, async ({ page, baseURL }) => {
    await openOther(page, baseURL, theme);
    expect(await axeViolations(page)).toEqual([]);
  });
}

test("axe: your own profile page, read mode, with the owner's empty-state rows", async ({ page, baseURL }) => {
  await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
  await openFreshPage(page, baseURL);
  const mine = await seedSession(page);
  const bare = { ...BOB_PUBLIC, userId: mine, username: "me-user", displayName: "Me Myself", company: null, location: null, links: [], website: null, pronouns: null };
  await mockApi(page, { id: mine, username: "me-user", name: "Me Myself", publicBody: bare });
  await openProfileFromPalette(page, "Me");
  await expect(heading(page, "Me Myself")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a bio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Write your README" })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});
