/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   slashMenuPreview.spec.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// The pane beside the slash menu draws the highlighted block for real (an h1
// for Heading 1, a table for Table), follows the highlight, shows the
// description alone for blocks it cannot draw, and steps aside on a phone.

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage, slashMenu } from "../../browser/core/app.mjs";

const preview = (page) => page.getByTestId("slash-command-preview");
const sample = (page) => page.getByTestId("slash-command-preview-sample");

async function openSlash(page, baseURL, query = "") {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  for (const word of ["alpha", "beta", "gamma"]) {
    await page.keyboard.type(word);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.type(`/${query}`);
  await expect(slashMenu(page)).toBeVisible();
}

test.describe("slash menu preview", () => {
  test("draws the highlighted block for real, beside the menu", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSlash(page, baseURL, "h1");

    await expect(sample(page).locator('h1[data-block-type="heading_1"]')).toBeVisible();
    const menuBox = await slashMenu(page).boundingBox();
    const previewBox = await preview(page).boundingBox();
    expect(previewBox.x).toBeGreaterThanOrEqual(menuBox.x + menuBox.width);
    // A picture for the eye: never a click target, never read twice.
    await expect(preview(page)).toHaveAttribute("aria-hidden", "true");
    expect(await preview(page).evaluate((element) => element.inert)).toBe(true);

    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("table");
    await expect(sample(page).locator("table")).toBeVisible();
    await expect(sample(page).getByText("Owner")).toBeVisible();
  });

  test("a block it cannot draw shows its description alone", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSlash(page, baseURL, "image");

    await expect(preview(page)).toBeVisible();
    await expect(sample(page)).toHaveCount(0);
    await expect(preview(page).locator("p").first()).toHaveText(/image/i);
  });

  test("steps aside on a phone", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openSlash(page, baseURL, "h1");
    await expect(preview(page)).toHaveCount(0);
  });
});
