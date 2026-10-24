/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profileBanner.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P1-6-d: the profile page draws the banner the public projection names, above the
// header, and nothing when there is none. Only the allowlisted `bannerUrl` is read.

import { expect, test } from "@playwright/test";

import { BOB_PUBLIC, OTHER, heading, mockApi, openProfile } from "../support/profilePageMocks.mjs";

const BANNER = "/api/media/avatars/user-456/" + "a".repeat(64) + "-banner.webp";
const EVIL = "https://evil.example/banner.png";
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==", "base64");

async function stubImages(page) {
  await page.route("**/api/media/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }));
}

test.describe("the profile banner", () => {
  test("shows the banner above the header when the profile has one", async ({ page, baseURL }) => {
    await stubImages(page);
    await mockApi(page, { ...OTHER, name: "Bob Jones", publicBody: { ...BOB_PUBLIC, bannerUrl: BANNER } });
    await openProfile(page, baseURL, "Bob");
    await expect(heading(page, "Bob Jones")).toBeVisible();
    const banner = page.getByTestId("profile-banner");
    await expect(banner).toHaveAttribute("src", BANNER);
    const [bannerBox, headingBox] = [await banner.boundingBox(), await heading(page, "Bob Jones").boundingBox()];
    expect(bannerBox.y + bannerBox.height).toBeLessThanOrEqual(headingBox.y);
  });

  test("draws nothing when there is no banner", async ({ page, baseURL }) => {
    await mockApi(page, { ...OTHER, name: "Bob Jones", publicBody: BOB_PUBLIC });
    await openProfile(page, baseURL, "Bob");
    await expect(heading(page, "Bob Jones")).toBeVisible();
    await expect(page.getByTestId("profile-banner")).toHaveCount(0);
  });

  test("ignores a banner under any key but the allowlisted bannerUrl", async ({ page, baseURL }) => {
    await mockApi(page, {
      ...OTHER, name: "Bob Jones",
      publicBody: { ...BOB_PUBLIC, banner: EVIL, banner_url: EVIL },
      profileExtra: { banner: EVIL, banner_url: EVIL },
    });
    await openProfile(page, baseURL, "Bob");
    await expect(heading(page, "Bob Jones")).toBeVisible();
    await expect(page.getByTestId("profile-banner")).toHaveCount(0);
  });

  test("refuses a banner URL that is not https or a same-origin path", async ({ page, baseURL }) => {
    await mockApi(page, { ...OTHER, name: "Bob Jones", publicBody: { ...BOB_PUBLIC, bannerUrl: "javascript:alert(1)" } });
    await openProfile(page, baseURL, "Bob");
    await expect(heading(page, "Bob Jones")).toBeVisible();
    await expect(page.getByTestId("profile-banner")).toHaveCount(0);
  });
});
