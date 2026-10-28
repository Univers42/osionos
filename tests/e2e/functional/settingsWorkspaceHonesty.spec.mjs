// P2-5-c1: the workspace panels (General, Teamspaces, Billing, Import,
// Library) in the offline build, where no account route answers. What is
// proved: nothing is invented, and nothing destructive happens on one click.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { closeSettings, openSettings, region } from "../support/settingsHelpers.mjs";

test.describe("workspace panels are honest (offline build)", () => {
  test("Billing: View invoice never invents an invoice", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "Billing");
    await expect(region(page).getByText("No invoices yet")).toBeVisible();
    await expect(region(page).getByRole("button", { name: "View invoice" })).toHaveCount(0);
    await expect(region(page).getByText("For students & educators")).toHaveCount(0);
    await expect(region(page).getByRole("row")).toHaveCount(0);
  });

  test("Teamspaces: Archive asks first, and the empty table says so", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "Teamspaces");
    await expect(region(page).getByText("42 school HQ")).toHaveCount(0);
    await expect(region(page).getByText("No teamspaces yet")).toBeVisible();

    await region(page).getByRole("button", { name: "New teamspace", exact: true }).click();
    const create = page.getByRole("dialog", { name: "New teamspace" });
    await create.getByLabel("Teamspace name").fill("Design");
    await create.getByRole("button", { name: "Create" }).click();
    const nameInput = region(page).locator('input[value="Design"]');
    await expect(nameInput).toBeVisible();

    await region(page).getByRole("button", { name: "Archive", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: "Archive teamspace" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(nameInput).toBeVisible();

    await region(page).getByRole("button", { name: "Archive", exact: true }).click();
    await page.getByRole("dialog", { name: "Archive teamspace" }).getByRole("button", { name: "Archive" }).click();
    await expect(nameInput).toHaveCount(0);
  });

  test("Import: the Completed tab shows the empty state, not a fake row", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "Import");
    await region(page).getByRole("tab", { name: /Completed/ }).click();
    await expect(region(page).getByText("No completed imports yet")).toBeVisible();
    await expect(region(page).getByRole("cell", { name: "Local", exact: true })).toHaveCount(0);
  });

  test("Import: third-party providers are unavailable and write nothing", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "Import");
    const trello = region(page).getByRole("button", { name: "Import from Trello" });
    await expect(trello).toBeDisabled();
    await expect(region(page).getByText("Not available yet").first()).toBeVisible();
  });

  test("General: no invented workspace name or id", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "General");
    await expect(region(page).getByText("1edd3106")).toHaveCount(0);
    await expect(region(page).getByText("42 school", { exact: true })).toHaveCount(0);
    await expect(region(page).getByText("Learn more")).toHaveCount(0);
  });

  test("General: Reset to defaults asks first", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "General");
    await region(page).getByRole("button", { name: "Reset to defaults" }).click();
    await expect(page.getByRole("dialog", { name: "Reset to defaults" })).toBeVisible();
  });

  test("General: renaming the workspace renames it in the switcher", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "General");
    await region(page).getByLabel("Workspace name").fill("Renamed space");
    // The icon is not what is under test here, so any icon before the name passes.
    const header = page.getByRole("button", { name: /^\S+ Renamed space$/u }).first();
    await expect(header).toBeVisible();
    await closeSettings(page);
    await expect(header).toBeVisible();
  });

  test("Library: Remove asset asks first", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await openSettings(page, "Emoji & Library");
    await region(page).locator('input[type="file"]').setInputFiles({ name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await expect(region(page).getByText("note.txt")).toBeVisible();
    await region(page).getByRole("button", { name: "Remove asset" }).click();
    const confirm = page.getByRole("dialog", { name: "Remove asset" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(region(page).getByText("note.txt")).toBeVisible();
    await region(page).getByRole("button", { name: "Remove asset" }).click();
    await page.getByRole("dialog", { name: "Remove asset" }).getByRole("button", { name: "Remove" }).click();
    await expect(region(page).getByText("note.txt")).toHaveCount(0);
  });
});
