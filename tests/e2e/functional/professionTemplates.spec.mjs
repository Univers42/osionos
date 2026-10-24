/* ************************************************************************** */
/*                                                                            */
/*   professionTemplates.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

import { cachedHomeUpdatedAt, settledHomeUpdatedAt } from "../support/homeCache.mjs";

const PICKER_TITLE = "What do you do?";
const INTENT_TITLE = "What is this space for?";
const PROFESSION_KEY = "osionos:profession";

const workspaceSwitcher = (page) => page.locator('aside[aria-label="Sidebar"] div[role="button"]').first();
const picker = (page) => page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: PICKER_TITLE }) });

function railHome(page) {
  return page.locator('[role="tab"][aria-label="Home"]');
}

async function openHome(page) {
  await railHome(page).click();
  await page.getByRole("menuitem", { name: "Dashboard" }).click();
  await expect(page.locator('[data-draggable-block-id]').first()).toBeVisible({ timeout: 30_000 });
}

async function openProfile(page) {
  await page.locator('[role="tab"][aria-label="Account"]').click();
  await expect(page.getByText("Classes taught")).toBeVisible({ timeout: 30_000 });
}

test.describe("profession templates", () => {
  test("picking a profession drives the profile template and the Home seed", async ({ page, baseURL }) => {
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });

    // Onboarding path: create a workspace, then pick Teacher.
    await workspaceSwitcher(page).click();
    await page.getByRole("button", { name: /New workspace/i }).click();
    await expect(page.getByText(INTENT_TITLE)).toBeAttached({ timeout: 20_000 });
    await page.getByRole("button", { name: /^For work/i }).click();
    await expect(picker(page)).toBeVisible({ timeout: 30_000 });
    await picker(page).getByRole("button", { name: /^Teacher\b/ }).click();
    await expect(picker(page)).toHaveCount(0);
    await expect.poll(() => page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      try { return JSON.parse(raw)?.state?.profession ?? null; } catch { return null; }
    }, PROFESSION_KEY)).toBe("teacher");

    // The profile page renders the profession's template.
    await openProfile(page);
    await expect(page.getByText("Classes taught")).toBeVisible();

    // The Home dashboard seeds from the profession.
    await openHome(page);
    await expect(page.getByText("Happy teaching", { exact: true })).toBeVisible({ timeout: 30_000 });

    // A user edit survives a reload, and the Home is not re-seeded.
    const greeting = page.locator('[data-draggable-block-id$="block-greeting"]').first();
    await greeting.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("My profession home note");
    await expect(page.getByText("My profession home note")).toBeVisible();
    const updatedAtBefore = await settledHomeUpdatedAt(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    await openHome(page);
    await expect(page.getByText("My profession home note")).toBeVisible();
    expect(await cachedHomeUpdatedAt(page)).toBe(updatedAtBefore);

    // Picking another profession replaces the Home content entirely.
    await page.evaluate(() => {
      window.localStorage.setItem("osionos:profession", JSON.stringify({ state: { profession: "developer" }, version: 0 }));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await openHome(page);
    await expect(page.getByText("Happy coding", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("My profession home note")).toHaveCount(0);

    // A profile with no profession renders the built-in profile page.
    await page.evaluate(() => {
      window.localStorage.removeItem("osionos:profession");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('[role="tab"][aria-label="Account"]').click();
    await expect(page.getByText("Classes taught")).toHaveCount(0);
  });
});