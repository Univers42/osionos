/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsTokens.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Settings > Developer against a stubbed bridge (PLAYWRIGHT_BRIDGE_STUB=1): list,
// create (the secret is shown once), revoke (behind an in-app confirmation) and the
// failure states.

import { test, expect } from "@playwright/test";

import { region } from "../support/settingsHelpers.mjs";
import { SECRET, openDeveloper, stubTokens, tokenRow } from "../support/tokensStub.mjs";

const ROWS = [tokenRow("11111111-1111-4111-8111-111111111111", "CI pipeline"), tokenRow("22222222-2222-4222-8222-222222222222", "Backup script", { expiresAt: "2027-02-01T00:00:00.000Z" })];

const panel = (page) => region(page).locator('[data-settings-panel="developer"]');

test.describe("settings developer panel", () => {
  test("lists the tokens, never a secret, and sends the page JWT", async ({ page, baseURL }) => {
    const bridge = await stubTokens(page, ROWS);
    await openDeveloper(page, baseURL);
    await expect(panel(page).getByRole("row")).toHaveCount(3);
    await expect(panel(page).getByText("CI pipeline")).toBeVisible();
    await expect(panel(page)).not.toContainText("osio_pat_");
    expect(bridge.auth.at(-1)).toBe("Bearer e2e-page-jwt");
  });

  test("an empty account shows the empty state", async ({ page, baseURL }) => {
    await stubTokens(page, []);
    await openDeveloper(page, baseURL);
    await expect(panel(page).getByText("No personal access tokens yet.")).toBeVisible();
  });

  test("create needs a name and a scope; the secret shows once, with Copy, and is gone after Done and a reload", async ({ page, baseURL }) => {
    const bridge = await stubTokens(page, ROWS);
    await openDeveloper(page, baseURL);
    await panel(page).getByRole("button", { name: "New token" }).click();
    const create = page.getByRole("button", { name: "Create token" });
    await expect(create).toBeDisabled();
    await page.getByLabel("Name").fill("Deploy bot");
    await expect(create).toBeDisabled();
    await page.getByRole("checkbox", { name: "Pages: read", exact: true }).check();
    await page.getByLabel("Expires on").fill("");
    await expect(create).toBeDisabled();
    await page.getByRole("button", { name: "90 days" }).click();
    await create.click();
    await expect(page.getByLabel("Your new token")).toHaveValue(SECRET);
    await expect(page.getByLabel("Your new token")).toHaveAttribute("readonly", "");
    await expect(page.getByRole("button", { name: "Copy token" })).toBeVisible();
    expect(bridge.posts).toHaveLength(1);
    expect(bridge.posts[0]).toMatchObject({ name: "Deploy bot", kind: "classic", scopes: ["pages:read"] });
    expect(bridge.posts[0].expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByLabel("Your new token")).toHaveCount(0);
    await expect(panel(page).getByText("Deploy bot")).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    const stored = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
    expect(stored).not.toContain(SECRET);
    await expect(page.getByText(SECRET)).toHaveCount(0);
  });

  test("revoke asks first: Cancel keeps the token, Revoke deletes it and the row goes", async ({ page, baseURL }) => {
    const bridge = await stubTokens(page, ROWS);
    await openDeveloper(page, baseURL);
    await panel(page).getByRole("button", { name: "Revoke CI pipeline" }).click();
    await expect(page.getByText("Revoke CI pipeline? Apps using it will stop working immediately.").first()).toBeVisible();
    expect(bridge.deletes).toEqual([]);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(panel(page).getByText("CI pipeline")).toBeVisible();
    await panel(page).getByRole("button", { name: "Revoke CI pipeline" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(panel(page).getByText("CI pipeline")).toHaveCount(0);
    expect(bridge.deletes).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });

  test("a failed list shows the message in the panel and Retry recovers, with no console error", async ({ page, baseURL }) => {
    const bridge = await stubTokens(page, ROWS);
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) errors.push(message.text()); });
    bridge.failList = { status: 500, json: { ok: false, message: "boom", code: "server_error" } };
    await openDeveloper(page, baseURL);
    await expect(panel(page).getByRole("alert")).toBeVisible();
    bridge.failList = null;
    await panel(page).getByRole("button", { name: "Retry" }).click();
    await expect(panel(page).getByText("CI pipeline")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a revoke the bridge refuses (sudo needed) keeps the token and says why", async ({ page, baseURL }) => {
    const bridge = await stubTokens(page, ROWS);
    bridge.failDelete = { status: 403, json: { ok: false, message: "sudo", code: "sudo_required" } };
    await openDeveloper(page, baseURL);
    await panel(page).getByRole("button", { name: "Revoke CI pipeline" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    await expect(panel(page).getByText("CI pipeline")).toBeVisible();
  });

  test("at 375px the panel does not overflow the page", async ({ page, baseURL }) => {
    await stubTokens(page, ROWS);
    await openDeveloper(page, baseURL);
    await page.setViewportSize({ width: 375, height: 800 });
    await expect(panel(page).getByText("CI pipeline")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
