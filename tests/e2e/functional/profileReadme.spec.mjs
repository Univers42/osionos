/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profileReadme.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P2-1-c: the README on a profile. Another viewer gets the server's projection (blocks or a
// "too large" line) and never fetches the page; the owner gets Edit profile + Customize, and
// the first Customize creates the page and links it with an If-Match PATCH.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { BOB_PUBLIC, OTHER, giveTheAppABridgeOrigin, heading, mockApi, openProfile, seedSession } from "../support/profilePageMocks.mjs";

const README_ID = "22222222-2222-4222-8222-222222222222";
const READMES = {
  blocks: { pageId: README_ID, blocks: [{ id: "r1", type: "paragraph", content: "Hello from Bob's README" }] },
  truncated: { pageId: README_ID, truncated: true },
};

async function openBob(page, baseURL, readme) {
  const pageReads = [];
  page.on("request", (request) => { if (/\/api\/pages/.test(request.url())) pageReads.push(request.url()); });
  await mockApi(page, { ...OTHER, name: "Bob Jones", publicBody: { ...BOB_PUBLIC, readme } });
  await openProfile(page, baseURL, "Bob");
  await expect(heading(page, "Bob Jones")).toBeVisible();
  return pageReads;
}

test.describe("another person's README", () => {
  test("renders the projected blocks, offers no owner controls, and never reads the page", async ({ page, baseURL }) => {
    const pageReads = await openBob(page, baseURL, READMES.blocks);
    await expect(page.getByRole("region", { name: "README" })).toContainText("Hello from Bob's README");
    await expect(page.getByRole("button", { name: "Customize" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit profile" })).toHaveCount(0);
    expect(pageReads.filter((url) => url.includes(README_ID))).toEqual([]);
  });

  test("a README over the cap shows the too-large line", async ({ page, baseURL }) => {
    await openBob(page, baseURL, READMES.truncated);
    await expect(page.getByText("README too large to preview")).toBeVisible();
    await expect(page.getByRole("region", { name: "README" })).toHaveCount(0);
  });

  test("no README, no README region", async ({ page, baseURL }) => {
    await openBob(page, baseURL, undefined);
    await expect(page.getByRole("region", { name: "README" })).toHaveCount(0);
  });
});

test.describe("your own README", () => {
  test("Customize creates the page once, links it with If-Match, and opens it", async ({ page, baseURL }) => {
    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    await openFreshPage(page, baseURL);
    const mine = await seedSession(page);
    await mockApi(page, { id: mine, username: "me-user", name: "Me Myself", publicBody: { ...BOB_PUBLIC, userId: mine, username: "me-user" } });
    const patches = [];
    await page.route("**/api/pages", (route) => {
      const sent = route.request().postDataJSON();
      return route.fulfill({ json: { ...sent, _id: README_ID, updatedAt: new Date().toISOString(), archivedAt: null } });
    });
    await page.route("**/api/account/profile", async (route) => {
      const request = route.request();
      if (request.method() === "PATCH") {
        patches.push({ ifMatch: request.headers()["if-match"], body: request.postDataJSON() });
        return route.fulfill({ json: { userId: mine, version: 2, readmePageId: patches[0].body.readmePageId } });
      }
      return route.fulfill({ json: { userId: mine, version: 1, readmePageId: null } });
    });
    const box = page.getByRole("combobox", { name: "Search pages or run a command" });
    await box.click();
    await box.fill("user:Me");
    await page.getByRole("option").filter({ hasText: "Me Myself" }).first().click();
    await expect(page.getByRole("button", { name: "Edit profile", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Customize", exact: true }).click();
    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0].ifMatch).toBe('"1"');
    expect(Object.keys(patches[0].body)).toEqual(["readmePageId"]);
    await expect(page.getByTitle("README", { exact: true }).last()).toBeVisible();
  });
});

test.describe("the ?u= link", () => {
  test("opens that member's profile tab and drops the param", async ({ page, baseURL }) => {
    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    await openFreshPage(page, baseURL);
    await seedSession(page);
    await mockApi(page, { ...OTHER, name: "Bob Jones", publicBody: BOB_PUBLIC });
    await page.evaluate(async () => {
      globalThis.history.replaceState(null, "", "/?u=bob");
      const link = await import("/src/widgets/profile-page/model/profileDeepLink.ts");
      link.applyProfileDeepLink();
    });
    await expect(heading(page, "Bob Jones")).toBeVisible();
    expect(new URL(page.url()).searchParams.has("u")).toBe(false);
  });
});
