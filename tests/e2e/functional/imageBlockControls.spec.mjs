/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   imageBlockControls.spec.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+       +#+       */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Image-block controls: Caption focuses the caption field, the ratio picker
// applies an aspect-ratio, the width preset resizes, and Full screen closes on
// Escape. Pure client surfaces — no bridge — so the offline env exercises them.

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  openFreshPage,
  slashCommandEntry,
} from "../../browser/core/app.mjs";

// These insert an image then drive UI; a couple of the surfaces settle async, so
// allow a small retry budget file-wide.
test.describe.configure({ retries: 2 });

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function insertImage(page, baseURL) {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("/image");
  const entry = slashCommandEntry(page, "Image").last();
  await entry.waitFor();
  await entry.evaluate((node) => node.click());
  await page.getByText("Add an image").click();
  await page.getByText("Upload an image from your device.").waitFor();
  await page.locator('input[type="file"]').setInputFiles({
    name: "tiny.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  const media = page.locator('[data-testid="media-block-editor"]');
  await media.locator("img").waitFor();
  return media;
}

test("Caption button focuses the caption field and reveals its placeholder", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const media = await insertImage(page, baseURL);

  await media.hover();
  await page.getByRole("toolbar", { name: "Image actions" })
    .getByRole("button", { name: "Caption" }).click();

  const caption = media.getByRole("textbox", { name: "Write a caption..." });
  await expect(caption).toBeFocused();
  await expect(caption).toHaveAttribute("data-placeholder", "Write a caption...");
});

test("Ratio picker applies an aspect-ratio and the width preset resizes", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const media = await insertImage(page, baseURL);
  const img = media.locator("img");

  await img.click(); // reveal the settings bar
  await page.getByRole("button", { name: "Ratio 16:9" }).click();
  await expect(img).toHaveJSProperty("style.aspectRatio", "16 / 9");

  await page.getByRole("button", { name: "50%", exact: true }).click();
  await expect(img.locator("xpath=..")).toHaveJSProperty("style.width", "50%");
});

test("Full screen opens and closes on Escape", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const media = await insertImage(page, baseURL);

  await media.hover();
  await page.getByRole("toolbar", { name: "Image actions" })
    .getByRole("button", { name: "Full screen" }).click();
  const dialog = page.getByRole("dialog", { name: "Image full screen" });
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
