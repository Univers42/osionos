/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   multiPaneEditing.spec.mjs                          :+:      :+:    :+:   */
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
  clearAndTypePageTitle,
  getEditors,
  openFreshPage,
  waitForRenderStability,
} from "../../browser/core/app.mjs";

async function addPage(page) {
  await page.getByRole("button", { name: /New page/i }).first().click();
  await page.getByRole("textbox", { name: "Page title" }).waitFor();
}

// Build a real split: left pane = page "Alpha" (body "alphabody"), right pane =
// page "Beta" (body "betabody"), with the LEFT pane active/focused.
async function buildTwoPaneLayout(page, baseURL) {
  await openFreshPage(page, baseURL);
  await clearAndTypePageTitle(page, "Alpha");
  await clearAndType(await activateFirstEditor(page), "alphabody");

  await addPage(page);
  await clearAndTypePageTitle(page, "Beta");
  await clearAndType(await activateFirstEditor(page), "betabody");

  // Split → new right pane duplicates the active (Beta) tab and becomes active.
  await page.locator('button[title="Split right"]').first().click();
  await waitForRenderStability(page);

  // Make the LEFT pane show Alpha: clicking the sidebar "Alpha" focuses its
  // existing tab (openTab dedupes by pageId → focuses it in the left pane).
  await page.getByText("Alpha", { exact: true }).first().click();
  await waitForRenderStability(page);

  const alphaEditor = getEditors(page).filter({ hasText: "alphabody" }).first();
  const betaEditor = getEditors(page).filter({ hasText: "betabody" }).first();
  await alphaEditor.waitFor();
  await betaEditor.waitFor();
  return { alphaEditor, betaEditor };
}

test.describe("multi-pane editing", () => {
  test.describe.configure({ mode: "serial" });

  test("one click into another pane lets you type there immediately", async ({
    page,
    baseURL,
  }) => {
    const { alphaEditor, betaEditor } = await buildTwoPaneLayout(page, baseURL);

    // Left (Alpha) is active. Click ONCE into the right (Beta, inactive) pane and
    // type — no separate "select the pane first" step.
    await betaEditor.click();
    await page.keyboard.type("ZZZ", { delay: 0 });
    await waitForRenderStability(page);

    await expect(betaEditor).toContainText("ZZZ");
    await expect(alphaEditor).not.toContainText("ZZZ");
  });

  test("typing in a non-active pane does not drift the caret", async ({
    page,
    baseURL,
  }) => {
    const { betaEditor } = await buildTwoPaneLayout(page, baseURL);

    // Click into the inactive Beta pane, put caret at the end, type a fast burst.
    await betaEditor.click();
    await betaEditor.press("End");
    await page.keyboard.type("12345", { delay: 0 });
    await waitForRenderStability(page);

    await expect(betaEditor).toHaveText("betabody12345");
  });
});
