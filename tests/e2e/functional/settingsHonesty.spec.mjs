/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsHonesty.spec.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Offline Playwright build: VITE_API_URL is empty so all account routes are
// "unavailable". This spec verifies honest behaviour — no fake success
// toasts, no invented data, no silent state changes.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { enableAccountDelete } from "../support/accountDelete.mjs";
import { closeSettings, openSettings, region, searchSettings } from "../support/settingsHelpers.mjs";

test.describe("settings honesty (offline build)", () => {
  test("Profile → Delete account shows honest notice, keeps user signed in", async ({ page, baseURL }) => {
    await enableAccountDelete(page);
    await openFreshPage(page, baseURL);
    await openSettings(page);

    // Navigate to Profile via search (the Profile nav button shows persona name)
    await searchSettings(page, "delete account");

    // Should land on Profile at the Danger zone anchor (where Delete my account is)
    await expect(region(page).getByRole("heading", { name: "Danger zone", exact: true })).toBeVisible();
    await expect(region(page).locator('[data-settings-anchor="danger"]')).toBeInViewport();

    // Open delete account modal
    await page.getByRole("button", { name: "Delete my account", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Delete account" })).toBeVisible();

    // Type confirmation
    const typed = page.getByRole("dialog", { name: "Delete account" }).getByRole("textbox");
    await typed.fill((await typed.getAttribute("placeholder")) ?? "");
    await page.getByRole("button", { name: "Schedule deletion" }).click();

    // Wait for the modal to close and any toast to appear
    await expect(page.getByRole("dialog", { name: "Delete account" })).toBeHidden();

    // The honest "not available" notice should appear
    const toast = page.getByRole("status").filter({ hasText: "Account deletion isn't available on this server yet" });
    await expect(toast).toBeVisible({ timeout: 5000 });

    // User should still be signed in — workspace still there, no redirect
    await expect(page.getByRole("button", { name: /Home|Workspace/, exact: true }).first()).toBeVisible();

    // No "scheduled for deletion" text anywhere
    await expect(page.getByText(/scheduled for deletion/i)).toHaveCount(0);

    await closeSettings(page);
  });

  test("Two-step verification: no recovery code is ever rendered", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page);

    // Navigate to Profile via search
    await searchSettings(page, "two-step");

    // Should land on Profile at the Account security anchor
    await expect(region(page).getByRole("heading", { name: "Account security", exact: true })).toBeVisible();
    await expect(region(page).locator('[data-settings-anchor="account-security"]')).toBeInViewport();

    // Open two-factor modal (the button is in the "Two-step verification" row within Account security)
    // "Add verification method" is unique to the 2FA row (Email row says "Manage emails")
    const twoFactorBtn = region(page).getByRole("button", { name: "Add verification method", exact: true });
    await expect(twoFactorBtn).toBeVisible();
    await twoFactorBtn.click();
    
    // Allow time for React state update and modal render
    await page.waitForTimeout(1000);
    
    // Wait for modal to appear (portaled to body)
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // The modal should not show any recovery codes (the hard-coded fallback is gone)
    const recoveryCodePattern = /A12B|E56F|J90K|N34P/;
    await expect(dialog.getByText(recoveryCodePattern)).toHaveCount(0);

    // Also verify the QR code is not rendered (enrolment is unavailable offline)
    await expect(dialog.locator("img")).toHaveCount(0);

    // Close the modal (the kit's Modal has no close button — Escape closes it)
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await closeSettings(page);
  });

  test("Devices table has exactly one row and no 'Ubuntu' text unless the browser UA says so", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page);

    // Navigate to Profile via search
    await searchSettings(page, "devices");

    // Should land on Profile at the Devices anchor
    await expect(region(page).getByRole("heading", { name: "Devices", exact: true })).toBeVisible();
    await expect(region(page).locator('[data-settings-anchor="devices"]')).toBeInViewport();

    // Find the Devices section and its table
    const rows = region(page).locator("table tbody tr");
    await expect(rows).toHaveCount(1);

    // The device name should come from navigator.userAgent (honest), not "Ubuntu · This Device"
    const deviceNameCell = rows.locator("td").first();
    const deviceName = await deviceNameCell.textContent();

    // In the offline Playwright build the UA is headless Chromium on Linux — it does not contain "Ubuntu"
    // So we assert the text is NOT the old hard-coded value
    expect(deviceName).not.toContain("Ubuntu · This Device");
    // And it should contain something honest from the UA (e.g., "Chrome on Linux")
    expect(deviceName.length).toBeGreaterThan(0);

    await closeSettings(page);
  });

  test("User ID shows the persona's id or nothing — no literal UUID fallback", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page);

    // Navigate to Profile via search
    await searchSettings(page, "user id");

    // Should land on Profile at the User ID anchor
    await expect(region(page).getByRole("heading", { name: "User ID", exact: true })).toBeVisible();
    await expect(region(page).locator('[data-settings-anchor="user-id"]')).toBeInViewport();

    // Scoped to the section itself: its parent is the whole panel, whose first
    // .text-sm is whatever section happens to come first.
    const description = region(page).locator('[data-settings-anchor="user-id"] .mt-1.text-sm').first();
    const text = (await description.count()) > 0 ? ((await description.textContent()) ?? "") : "";

    // In the offline build the persona may not have an id — showing nothing is honest
    // Not the literal UUID "b0181a89-4ad8-476c-9657-352d6eadf49e"
    expect(text).not.toBe("b0181a89-4ad8-476c-9657-352d6eadf49e");
    // The offline persona's id is "mock-user-0", not a UUID: it was never read before,
    // because the old locator landed on an empty <input>.
    if (text) expect(text).toMatch(/^[\w-]+$/);
  });
});