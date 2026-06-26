/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   search.spec.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { test, expect } from "@playwright/test";

import {
  activateFirstEditor,
  clearAndType,
  openFreshPage,
  waitForRenderStability,
} from "../../browser/core/app.mjs";

test.describe("workspace search & replace", () => {
  test.describe.configure({ mode: "serial" });

  test("finds a unique word typed into a page", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await clearAndType(editor, "alpha zphraseq omega");
    await waitForRenderStability(page);

    await page.keyboard.press("Control+Shift+F"); // opens the Search panel from anywhere
    await page.getByLabel("Search query").fill("zphraseq");

    await expect(page.locator("mark", { hasText: "zphraseq" }).first()).toBeVisible({ timeout: 10_000 });
  });

  test("replace-all rewrites matches across the page and undo restores them", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await clearAndType(editor, "wibble wibble wibble");
    await waitForRenderStability(page);

    await page.keyboard.press("Control+Shift+F"); // opens the Search panel from anywhere
    await page.getByLabel("Search query").fill("wibble");
    await expect(page.locator("mark", { hasText: "wibble" }).first()).toBeVisible({ timeout: 10_000 });

    await page.getByLabel("Replace text").fill("wobble");
    await page.getByRole("button", { name: "Replace all matches" }).click();
    // Confirm dialog.
    await page.getByRole("button", { name: "Replace all", exact: true }).click();
    await waitForRenderStability(page);

    await expect(editor).toContainText("wobble");
    await expect(editor).not.toContainText("wibble");
  });
});
