/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   professionPicker.spec.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * P2-4-d2: the profession picker is mounted in the app shell, and the onboarding path
 * opens it.
 *
 * The harness builds OFFLINE (VITE_API_URL=''), so the pick cannot reach the account
 * plane: the store keeps it locally and persists it under `osionos:profession`. That
 * persisted payload is what this test reads — it is the same thing the store exposes
 * when the server is not there.
 *
 * The path under test is the real one: the workspace switcher → "New workspace" → an
 * intent → the picker. No store is opened by hand.
 */

import { test, expect } from "@playwright/test";

const PICKER_TITLE = "What do you do?";
const INTENT_TITLE = "What is this space for?";
const PROFESSION_KEY = "osionos:profession";

/** The workspace switcher: the header button of the sidebar, named after the workspace. */
const workspaceSwitcher = (page) => page.locator('aside[aria-label="Sidebar"] div[role="button"]').first();

/** The picker: the open modal that carries its title. */
const picker = (page) => page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: PICKER_TITLE }) });

/** The profession the store persisted, or null. */
const persistedProfession = (page) =>
  page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw)?.state?.profession ?? null;
    } catch {
      return null;
    }
  }, PROFESSION_KEY);

test("the onboarding path opens the profession picker, and the pick is kept offline", async ({ page, baseURL }) => {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });

  // Nothing of the picker is in the DOM before it opens: the mount costs no warm path.
  await expect(page.getByText(PICKER_TITLE)).toHaveCount(0);

  // The onboarding path: the workspace switcher, then "New workspace".
  await workspaceSwitcher(page).click();
  await page.getByRole("button", { name: /New workspace/i }).click();
  await expect(page.getByText(INTENT_TITLE)).toBeAttached({ timeout: 20_000 });

  // An intent creates the workspace; the picker opens once it exists.
  await page.getByRole("button", { name: /^For work/i }).click();
  await expect(picker(page)).toBeVisible({ timeout: 30_000 });

  // The eight professions are offered.
  for (const label of ["Student", "Developer", "Designer", "Data analyst", "Researcher", "Creator", "Founder", "Teacher"]) {
    await expect(picker(page).getByRole("button", { name: new RegExp(`^${label}\\b`) })).toBeVisible();
  }

  // The last profession is reachable on a phone-sized screen: the list scrolls inside the
  // dialog instead of running past the viewport. Resized only now: the sidebar that
  // hosts the workspace switcher is hidden at this width.
  await page.setViewportSize({ width: 375, height: 667 });
  const teacher = picker(page).getByRole("button", { name: /^Teacher\b/ });
  await teacher.scrollIntoViewIfNeeded();
  const box = await teacher.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(667);

  // Picking one closes the picker and keeps the value: offline there is no account
  // plane to write to, so the store holds it locally.
  await picker(page).getByRole("button", { name: /^Teacher\b/ }).click();
  await expect(picker(page)).toHaveCount(0);
  await expect.poll(() => persistedProfession(page)).toBe("teacher");

  // The value survives a reload: the persisted payload is the store's own.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => persistedProfession(page)).toBe("teacher");
});
