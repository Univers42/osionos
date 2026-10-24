/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   accountEmails.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// F-3b against the stubbed bridge (PLAYWRIGHT_BRIDGE_STUB=1): add an address, enter the code,
// see it Verified, remove it. This proves the client against a stub, not the bridge.

import { test, expect } from "@playwright/test";

import { region } from "../support/settingsHelpers.mjs";
import { openProfile } from "../support/sessionsStub.mjs";
import { GOOD_CODE } from "../support/emailsStub.mjs";
import { stubTwoStep } from "../support/twoStepStub.mjs";
import { BRIDGE_STUB_ORIGIN } from "../support/bridgeStub.mjs";

const emailsDialog = (page) => page.getByRole("dialog", { name: "Manage emails" });

async function openManager(page, baseURL) {
  const bridge = await stubTwoStep(page);
  await openProfile(page, baseURL);
  await region(page).getByRole("button", { name: "Manage emails", exact: true }).click();
  return bridge;
}

test.describe("Manage emails (bridge stub)", () => {
  test("add, enter the code, verified, then remove", async ({ page, baseURL }) => {
    const bridge = await openManager(page, baseURL);
    const dialog = emailsDialog(page);
    await dialog.getByPlaceholder("name@example.com").fill("other@example.com");
    await dialog.getByRole("button", { name: "Send code" }).click();
    await expect(dialog.getByText("other@example.com")).toBeVisible();
    await expect(dialog).toContainText("Code sent to o•••@e•••.com");
    await expect(dialog).toContainText("Not verified");
    expect(bridge.bodies.addEmail).toEqual({ email: "other@example.com" });

    await dialog.getByLabel(/Code for/).fill("000000");
    await dialog.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(dialog).toContainText("That code is not right");
    await dialog.getByLabel(/Code for/).fill(GOOD_CODE);
    await dialog.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(dialog).not.toContainText("Not verified");
    await expect(dialog.getByText("Verified", { exact: true })).toBeVisible();

    await dialog.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(dialog).toContainText("It can no longer be used for this account.");
    await dialog.getByRole("group", { name: "Confirm removal" }).getByRole("button", { name: "Remove" }).click();
    await expect(dialog.getByText("other@example.com")).toHaveCount(0);
    expect(bridge.calls.filter((call) => call.startsWith("DELETE"))).toHaveLength(1);
  });

  test("cancelling a pending address removes it", async ({ page, baseURL }) => {
    await openManager(page, baseURL);
    const dialog = emailsDialog(page);
    await dialog.getByPlaceholder("name@example.com").fill("other@example.com");
    await dialog.getByRole("button", { name: "Send code" }).click();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog.getByText("other@example.com")).toHaveCount(0);
    await expect(dialog).toContainText("No other addresses");
  });

  test("make a verified secondary the primary", async ({ page, baseURL }) => {
    const stamp = "2026-10-01T00:00:00Z";
    const row = (_id, email, isPrimary) => ({ _id, userId: "u", email, isPrimary, verifiedAt: stamp, createdAt: stamp, updatedAt: stamp, removedAt: null });
    let rows = [row("primary-u", "e2e@example.com", true), row("row-1", "second@example.com", false)];
    const posts = [];
    await stubTwoStep(page);
    // Registered after the shared stub, so it answers first; everything else falls back to it.
    await page.route((url) => url.origin === BRIDGE_STUB_ORIGIN && url.pathname.startsWith("/api/account/emails"), (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const headers = { "access-control-allow-origin": request.headers().origin ?? "*", "access-control-allow-credentials": "true", "access-control-allow-headers": "*" };
      if (request.method() === "GET" && url.pathname === "/api/account/emails") return route.fulfill({ headers, json: rows });
      if (request.method() === "POST" && url.pathname === "/api/account/emails/row-1/primary") {
        posts.push(url.pathname);
        rows = [row("row-1", "second@example.com", true), row("row-2", "e2e@example.com", false)];
        return route.fulfill({ headers, json: { previous: "row-2" } });
      }
      return route.fallback();
    });
    await openProfile(page, baseURL);
    await region(page).getByRole("button", { name: "Manage emails", exact: true }).click();
    const dialog = emailsDialog(page);
    await dialog.getByRole("button", { name: "Make second@example.com primary" }).click();
    await expect(dialog).toContainText("You'll sign in with second@example.com from now on. e2e@example.com stays on your account as a secondary address.");
    await dialog.getByRole("group", { name: "Confirm new primary address" }).getByRole("button", { name: "Make primary" }).click();
    await expect(dialog).toContainText("second@example.com is now your primary address. Other devices were signed out.");
    const items = dialog.getByRole("listitem");
    await expect(items.filter({ hasText: "second@example.com" })).toContainText("Primary");
    await expect(items.filter({ hasText: "e2e@example.com" })).toContainText("Verified");
    expect(posts).toHaveLength(1);
  });
});
