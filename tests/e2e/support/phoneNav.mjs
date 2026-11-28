// Reaching a feature the way a phone user does: through the bottom tabs, the account sheet and the
// back arrow, never through the desktop rail, menubar or tab strip (none of which exist below 768px).
// Ponytail: the page is found by its visible title in the Home tree, so a title that is also the
// name of a folder or a notification elsewhere on Home may match first; pass a more specific name.

import { expect } from "@playwright/test";

const tabBar = (page) => page.getByRole("navigation", { name: "Primary" });
const backArrow = (page) => page.getByRole("button", { name: "Back" });

/** Taps a page in the Home tree and waits for it to fill the screen with its back arrow. */
export async function openPageOnPhone(page, name) {
  await tabBar(page).getByRole("button", { name: "Home" }).click();
  await page.locator("main").getByText(name, { exact: true }).first().click();
  await expect(backArrow(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("phone-page").last()).toBeVisible();
}

/** Opens Settings from the account sheet; `section` (its sidebar label) is tapped when given. */
export async function openSettingsOnPhone(page, section) {
  await page.getByRole("button", { name: "Account and settings" }).click();
  await page.getByRole("dialog", { name: "Account and settings" }).getByRole("button", { name: "Settings" }).click();
  await expect(page.getByTestId("phone-page").last()).toBeVisible({ timeout: 15_000 });
  if (section) await page.getByTestId("phone-page").last().getByRole("button", { name: section, exact: true }).first().click();
}

/** Opens a rail destination (Library, Archived files, Admin, apps) from the account sheet's More group. */
export async function openMoreOnPhone(page, label) {
  await page.getByRole("button", { name: "Account and settings" }).click();
  await page.getByRole("dialog", { name: "Account and settings" }).getByRole("group", { name: "More" }).getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByTestId("phone-page").last()).toBeVisible({ timeout: 15_000 });
}

/** True below the phone shell's 768px breakpoint, for specs that run at both widths. */
export const isPhoneWidth = (page) => page.viewportSize().width < 768;

/** The Android back button: one history step, then the page is gone. */
export async function phoneBack(page) {
  const pages = await page.getByTestId("phone-page").count();
  await page.goBack();
  await expect(page.getByTestId("phone-page")).toHaveCount(Math.max(0, pages - 1));
}

/** Taps the Search tab, where the command palette lives on a phone. */
export async function openSearchOnPhone(page) {
  await tabBar(page).getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("combobox", { name: "Search pages or run a command" })).toBeVisible();
}
