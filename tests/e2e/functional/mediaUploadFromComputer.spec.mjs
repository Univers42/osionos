/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mediaUploadFromComputer.spec.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// /image → void row → Upload → local file. Online the file goes to the
// bridge storage; OFFLINE (this env) small files fall back to an inline data
// URL and big files surface a CLEAR error — never the old silent quota crash
// that left the placeholder behind.

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  openFreshPage,
  slashCommandEntry,
} from "../../browser/core/app.mjs";

async function pickSlashEntry(page, label) {
  const entry = slashCommandEntry(page, label).last();
  await entry.waitFor();
  await entry.evaluate((node) => node.click());
}

// Tiny valid PNG (1×1 transparent).
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function openImageUploadDialog(page, baseURL) {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("/image");
  await pickSlashEntry(page, "Image");
  await page.getByText("Add an image").click();
  await page.getByText("Upload an image from your device.").waitFor();
}

test.describe("upload an image from the computer", () => {
  test("a small local image embeds and renders", async ({ page, baseURL }) => {
    await openImageUploadDialog(page, baseURL);
    await page.locator('input[type="file"]').setInputFiles({
      name: "tiny.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    const img = page.locator('[data-testid="media-block-editor"] img');
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute("src", /^(data:image|https?:)/);
  });

  test("a photo-sized file offline surfaces a clear error, never a silent crash", async ({ page, baseURL }) => {
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await openImageUploadDialog(page, baseURL);
    const big = Buffer.concat([TINY_PNG, Buffer.alloc(6 * 1024 * 1024, 7)]);
    await page.locator('input[type="file"]').setInputFiles({
      name: "photo.png",
      mimeType: "image/png",
      buffer: big,
    });

    // The dialog stays open and TELLS the user what happened.
    await expect(page.getByText(/too large to embed offline/i)).toBeVisible({ timeout: 10_000 });
    expect(pageErrors, "no unhandled quota exception").toEqual([]);
  });
});
