/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsAccountHonesty.spec.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/*                                                                            */
/* ************************************************************************** */

// P2-5-c2: the account-side panels (Mail & Calendar, Notifications, Page
// settings, Contacts, MCP) on the offline build: no invented connection, no
// fake row, pickers that offer only what they can connect, destructive actions
// that ask first, and a notification override that is kept.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { openSettings, region, searchSettings } from "../support/settingsHelpers.mjs";

async function connectMail(page) {
  await region(page).getByRole("button", { name: "Add address" }).click();
  await page.getByRole("dialog", { name: "Mail provider" }).getByRole("button", { name: "osionos Mail" }).click();
}

test.describe("account-side settings honesty (offline build)", () => {
  test("Mail & Calendar shows no invented connection and no fake row", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "Mail & Calendar");

    await expect(region(page).getByText("dev.pro.photo@gmail.com")).toHaveCount(0);
    await expect(region(page).getByText("Not connected", { exact: true })).toHaveCount(0);
    await expect(region(page).getByRole("button", { name: "Disconnect" })).toHaveCount(0);
    await expect(region(page).getByText("No calendars connected yet")).toBeVisible();
  });

  test("the pickers list only matching providers", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "Mail & Calendar");

    await region(page).getByRole("button", { name: "Add address" }).click();
    const mail = page.getByRole("dialog", { name: "Mail provider" });
    await expect(mail.getByRole("button", { name: "osionos Mail" })).toBeVisible();
    await expect(mail.getByRole("button", { name: "Slack" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(mail).toHaveCount(0);

    await region(page).getByRole("button", { name: "Add calendar" }).click();
    const calendar = page.getByRole("dialog", { name: "Calendar provider" });
    await expect(calendar.getByRole("button", { name: "osionos Calendar" })).toBeVisible();
    await expect(calendar.getByRole("button", { name: "GitHub" })).toHaveCount(0);
  });

  test("Disconnect asks first and Cancel keeps the connection", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "Mail & Calendar");
    await connectMail(page);

    await region(page).getByRole("button", { name: "Disconnect" }).click();
    const dialog = page.getByRole("dialog", { name: /Disconnect/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(region(page).getByRole("button", { name: "Disconnect" })).toHaveCount(1);

    await region(page).getByRole("button", { name: "Disconnect" }).click();
    await page.getByRole("dialog", { name: /Disconnect/ }).getByRole("button", { name: "Disconnect" }).click();
    await expect(region(page).getByRole("button", { name: "Disconnect" })).toHaveCount(0);
  });

  test("a notification page override survives closing and reopening the modal", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "Notifications");

    await region(page).getByRole("button", { name: "Manage settings" }).click();
    let dialog = page.getByRole("dialog", { name: "Page notification settings" });
    const first = dialog.getByRole("switch").first();
    await expect(first).toBeVisible();
    const before = await first.getAttribute("aria-checked");
    await first.click();
    const after = await first.getAttribute("aria-checked");
    expect(after).not.toBe(before);
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toHaveCount(0);

    await region(page).getByRole("button", { name: "Manage settings" }).click();
    dialog = page.getByRole("dialog", { name: "Page notification settings" });
    await expect(dialog.getByRole("switch").first()).toHaveAttribute("aria-checked", after);
  });

  // Move to Trash cannot be reached from a settings tab: opening any non-page
  // tab clears the active page (layoutSync.ts), so the panel is its empty state.
  test("Page settings says no page is open, and offers no AI-share action", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "Page settings");

    await expect(region(page).getByText("No page open", { exact: true })).toBeVisible();
    await expect(region(page).getByText("Open a page to see its settings.")).toBeVisible();
    await expect(region(page).getByRole("button", { name: "Use", exact: true })).toHaveCount(0);
  });

  test("'>' contacts finds the Contacts anchors", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await page.getByRole("combobox", { name: "Search pages or run a command" }).fill(">contacts");
    await expect(page.getByRole("option", { name: /Your connections/ }).first()).toBeVisible();
  });

  test("settings search reaches the Contacts anchors", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page);
    await searchSettings(page, "abuse reports");
    await expect(region(page).getByRole("heading", { level: 1, name: "Contacts" })).toBeVisible();
    await expect(region(page).locator('[data-settings-anchor="reports"]')).toBeInViewport();
  });
});
