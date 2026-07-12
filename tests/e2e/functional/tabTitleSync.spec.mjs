/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tabTitleSync.spec.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Renaming a page must (1) rename its open tab in the workspace tab strip and
// (2) survive re-clicking that tab — a tab's creation-time title snapshot must
// never flow back over the live title (the rename-reverts-to-Untitled bug).

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";

test("renaming a fresh page renames its tab and survives tab re-clicks", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);

  const titleBox = page.getByLabel("Page title");
  await titleBox.click();
  await titleBox.fill("Quarterly Plan");
  // Commit the title by moving focus into the document body.
  const editor = await activateFirstEditor(page);
  await editor.click();

  // The open tab renames automatically — no stale "Untitled" tab remains.
  await expect(page.locator('[data-tab-id][title="Quarterly Plan"]')).toBeVisible();
  await expect(page.locator('[data-tab-id][title="Untitled"]')).toHaveCount(0);

  // Re-clicking the tab must NOT revert the title (the stale-snapshot clobber).
  await page.locator('[data-tab-id][title="Quarterly Plan"]').click();
  await expect(page.getByLabel("Page title")).toHaveValue("Quarterly Plan");
  await expect(page.locator('[data-tab-id][title="Untitled"]')).toHaveCount(0);

  // And bouncing via another tab (Home) and back keeps it intact too.
  await page.locator('[data-tab-id][title="Home"]').click();
  await page.locator('[data-tab-id][title="Quarterly Plan"]').click();
  await expect(page.getByLabel("Page title")).toHaveValue("Quarterly Plan");
});
