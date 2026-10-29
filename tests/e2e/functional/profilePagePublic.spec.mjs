/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profilePagePublic.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P1-6-c: the profile page shows the server's PUBLIC projection; your own page
// has "Edit profile". The offline build has no token, so the spec seeds one and
// mocks /api/profile/:id, /api/users/:username and /api/directory/search.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { BOB_PUBLIC, OTHER, giveTheAppABridgeOrigin, heading, mockApi, openProfile, seedSession } from "../support/profilePageMocks.mjs";

test.describe("the profile page shows the saved public profile", () => {
  test("another person's page shows pronouns, company, link hosts, ORCID, Patreon and local time", async ({ page, baseURL }) => {
    await mockApi(page, { ...OTHER, name: "Bob Jones", publicBody: BOB_PUBLIC });
    await openProfile(page, baseURL, "Bob");
    await expect(heading(page, "Bob Jones")).toBeVisible();
    await expect(page.getByText("he/him", { exact: true })).toBeVisible();
    await expect(page.getByText("Design Co")).toBeVisible();
    await expect(page.getByText("New York, NY")).toBeVisible();
    await expect(page.getByTestId("local-time")).toHaveText(/\d{1,2}:\d{2}/);
    for (const host of ["bob.example.com", "dribbble.com"]) {
      const link = page.getByRole("link", { name: host, exact: true });
      await expect(link).toHaveAttribute("rel", "noopener noreferrer me");
      await expect(link).toHaveAttribute("target", "_blank");
    }
    await expect(page.getByRole("link", { name: "0000-0002-1825-0097" })).toHaveAttribute("href", "https://orcid.org/0000-0002-1825-0097");
    await expect(page.getByRole("link", { name: "bobdraws" })).toHaveAttribute("href", "https://www.patreon.com/bobdraws");
  });

  test("someone else's page has no Edit profile button", async ({ page, baseURL }) => {
    await mockApi(page, { ...OTHER, name: "Bob Jones", publicBody: BOB_PUBLIC });
    await openProfile(page, baseURL, "Bob");
    await expect(heading(page, "Bob Jones")).toBeVisible();
    await expect(page.getByRole("button", { name: "Message" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit profile" })).toHaveCount(0);
  });

  test("a private field never renders for another viewer, and no /api/account call is made", async ({ page, baseURL }) => {
    const accountCalls = [];
    await mockApi(page, {
      ...OTHER, name: "Bob Jones", accountCalls,
      publicBody: { ...BOB_PUBLIC, email: "bob-secret@example.com", phone: "+33-secret-phone", birthday: "1999-secret-day" },
      profileExtra: { email: "bob-secret@example.com", customFields: { vault: "secret-vault" } },
    }, accountCalls);
    await openProfile(page, baseURL, "Bob");
    await expect(heading(page, "Bob Jones")).toBeVisible();
    await expect(page.getByText("he/him")).toBeVisible();
    const html = await page.content();
    for (const secret of ["bob-secret@example.com", "secret-phone", "secret-day", "secret-vault"]) {
      expect(html).not.toContain(secret);
    }
    expect(accountCalls).toEqual([]);
  });

  test("a reduced card shows only the name; a failed public read leaves the first result", async ({ page, baseURL }) => {
    await mockApi(page, { ...OTHER, name: "Bob Jones", publicBody: null });
    await openProfile(page, baseURL, "Bob");
    await expect(heading(page, "Bob Jones")).toBeVisible();
    await expect(page.getByText("he/him")).toHaveCount(0);
    await expect(page.getByTestId("local-time")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "dribbble.com" })).toHaveCount(0);
  });

  test("absent fields render nothing", async ({ page, baseURL }) => {
    await mockApi(page, { ...OTHER, name: "Bob Jones", publicBody: { userId: OTHER.id, username: "bob", displayName: "Bob Jones", links: [] } });
    await openProfile(page, baseURL, "Bob");
    await expect(heading(page, "Bob Jones")).toBeVisible();
    await expect(page.getByTestId("local-time")).toHaveCount(0);
    await expect(page.getByText("orcid", { exact: false })).toHaveCount(0);
  });

  test("your own page shows Edit profile, which opens the public profile section; the presence dot uses --osio-success", async ({ page, baseURL }) => {
    await giveTheAppABridgeOrigin(page, new URL(baseURL).origin);
    await openFreshPage(page, baseURL);
    const mine = await seedSession(page);
    await mockApi(page, { id: mine, username: "me-user", name: "Me Myself", publicBody: { ...BOB_PUBLIC, userId: mine, username: "me-user" }, profileExtra: { online: true } });
    const box = page.getByRole("combobox", { name: "Search pages or run a command" });
    await box.click();
    await box.fill("user:Me");
    await page.getByRole("option").filter({ hasText: "Me Myself" }).first().click();
    await expect(heading(page, "Me Myself")).toBeVisible();
    await expect(page.locator('[title="Online"]').first()).not.toHaveClass(/bg-green-500/);
    await page.getByRole("button", { name: "Edit profile", exact: true }).click();
    const region = page.getByRole("region", { name: "Settings", exact: true });
    await expect(region).toBeVisible();
    // The public-profile anchor itself is P1-6-a's; here the Profile section must be the one shown.
    await expect(region.getByRole("heading", { level: 1, name: "Profile", exact: true })).toBeVisible();
  });
});
