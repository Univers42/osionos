// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   recentsLiveTitle.spec.mjs                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// #84: a page titled after it was opened came back in Recents as an untitled row after a
// reload, because the Recents entry is the visit-time snapshot and a rename never re-saves it.

import { expect, test } from "@playwright/test";
import { clearAndTypePageTitle, openFreshPage } from "../../browser/core/app.mjs";

const FILES = '[data-sidebar-panel="files"]';
const TITLE = "Recents rename probe";

test("a page titled after it was opened keeps its title in Recents across a reload (#84)", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFreshPage(page, "/");
  await clearAndTypePageTitle(page, TITLE);
  // The pages cache persists on a debounce; reload once it holds the new title.
  await expect
    .poll(() => page.evaluate((title) => Object.keys(localStorage).some((key) => key.startsWith("osio:pages:") && localStorage.getItem(key).includes(title)), TITLE))
    .toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });
  const header = page.locator(FILES).getByRole("button", { name: "Recents", exact: true });
  await header.waitFor({ timeout: 60_000 });
  const recents = page.locator(`[id="${await header.getAttribute("aria-controls")}"]`);
  await page.locator(FILES).screenshot({ path: testInfo.outputPath("recents-after-reload.png") });

  await expect(recents.getByText(TITLE, { exact: true })).toBeVisible();
  await expect(recents.getByText("Untitled", { exact: true })).toHaveCount(0);
});
