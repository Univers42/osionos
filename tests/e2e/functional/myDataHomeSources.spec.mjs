/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   myDataHomeSources.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { test, expect } from "@playwright/test";

import { activateFirstEditor, openFreshPage, openSlashMenuFromEditor, slashCommandEntry } from "../../browser/core/app.mjs";

const recentsBlock = (page) => page.locator('[data-database-id="home-recents"]');
const templatesBlock = (page) => page.locator('[data-database-id="home-templates"]');

test.describe("My data Home sources", () => {
  test("/Recently visited inserts the recents gallery", async ({ page }) => {
    await openFreshPage(page, "/");
    const editor = await activateFirstEditor(page);
    await openSlashMenuFromEditor(editor, "/Recently");
    await expect(slashCommandEntry(page, "Recently visited")).toBeVisible();
    await slashCommandEntry(page, "Recently visited").click();
    const inserted = recentsBlock(page);
    await expect(inserted).toBeVisible({ timeout: 15_000 });
    await expect(inserted).toContainText("Untitled");
  });

  test("/Templates inserts the templates gallery with the Student Dashboard card", async ({ page }) => {
    await openFreshPage(page, "/");
    const editor = await activateFirstEditor(page);
    await openSlashMenuFromEditor(editor, "/Templates");
    await expect(slashCommandEntry(page, "Templates")).toBeVisible();
    await slashCommandEntry(page, "Templates").click();
    const inserted = templatesBlock(page);
    await expect(inserted).toBeVisible({ timeout: 15_000 });
    await expect(inserted).toContainText("Student Dashboard");
  });
});
