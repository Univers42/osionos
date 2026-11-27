/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   shellEdges.spec.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// What sits on the shell's edges: the messaging launcher takes the bottom corner
// the primary side bar leaves free, and an auto-hidden title bar comes back only
// at the top edge, on focus, or while one of its menus is open.

import { expect, test } from "@playwright/test";
import { openFreshPage } from "../../browser/core/app.mjs";
import { chooseViewAppearance } from "../support/viewMenu.mjs";

const VIEWPORT = { width: 1440, height: 900 };
const topbar = (page) => page.getByTestId("app-topbar");
const launcher = (page) => page.getByRole("button", { name: /^(Open messaging|Messaging, \d+ unread)$/ });

async function openDesktop(page, baseURL) {
  await page.setViewportSize(VIEWPORT);
  await openFreshPage(page, baseURL);
}

async function launcherCenterX(page) {
  const box = await launcher(page).boundingBox();
  return box.x + box.width / 2;
}

async function topbarBottom(page) {
  const box = await topbar(page).boundingBox();
  return box.y + box.height;
}

test("the messaging launcher moves to the bottom-left while the side bar docks right, never under it", async ({ page, baseURL }) => {
  await openDesktop(page, baseURL);
  expect(await launcherCenterX(page)).toBeGreaterThan(VIEWPORT.width / 2);
  await chooseViewAppearance(page, "Move primary side bar right");
  await expect.poll(() => launcherCenterX(page)).toBeLessThan(VIEWPORT.width / 2);
  // A trial click fails when another element (the side bar) would take the click.
  await launcher(page).click({ trial: true, timeout: 5_000 });
  await chooseViewAppearance(page, "Move primary side bar left");
  await expect.poll(() => launcherCenterX(page)).toBeGreaterThan(VIEWPORT.width / 2);
});

test("an auto-hidden title bar gives its height to the workbench and returns at the top edge or on focus", async ({ page, baseURL }) => {
  await openDesktop(page, baseURL);
  const mainTop = async () => (await page.locator("#osio-main").boundingBox()).y;
  const docked = await mainTop();
  await chooseViewAppearance(page, "Auto-hide title bar", "menuitemcheckbox");
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await expect.poll(() => topbarBottom(page)).toBeLessThanOrEqual(0);
  expect(await mainTop()).toBeLessThan(docked);

  await page.mouse.move(VIEWPORT.width / 2, 2);
  await expect.poll(() => topbarBottom(page)).toBeGreaterThan(30);
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  await expect.poll(() => topbarBottom(page)).toBeLessThanOrEqual(0);

  await topbar(page).getByRole("button", { name: "View", exact: true }).focus();
  await expect.poll(() => topbarBottom(page)).toBeGreaterThan(30);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("app-shell")).toHaveAttribute("data-topbar-autohide", "1");
  // The setting survived the reload, so the bar is hidden: reach it the way a user does.
  await page.mouse.move(VIEWPORT.width / 2, 2);
  await expect.poll(() => topbarBottom(page)).toBeGreaterThan(30);
  await chooseViewAppearance(page, "Auto-hide title bar", "menuitemcheckbox");
  await expect(page.getByTestId("app-shell")).not.toHaveAttribute("data-topbar-autohide", "1");
});
