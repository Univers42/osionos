/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   assets.mjs                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/20 21:29:32 by rstancu           #+#    #+#             */
/*   Updated: 2026/04/28 18:19:49 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";

import {
  activateFirstEditor,
  clickOutside,
  clearAndType,
  createCallout,
  createMediaBlock,
  getEditors,
  mediaBlockPicker,
  openHarnessPage,
  openFreshPage,
  pickAssetFromVisiblePicker,
  pickFirstAssetFromVisiblePicker,
  selectText,
  toolbarButton,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

function pageIconButton(page) {
  return page.getByRole("button", { name: "Change page icon" });
}

function removeIconButton(page) {
  return page.getByRole("button", { name: /^Remove icon$/ });
}

function addCoverButton(page) {
  return page.getByRole("button", { name: /Add cover/i });
}

function changeCoverButton(page) {
  return page.getByRole("button", { name: /Change cover/i });
}

function removeCoverButton(page) {
  return page.getByTestId("page-cover-remove");
}

async function addPageIcon(page) {
  await page.getByRole("button", { name: /Add icon/i }).click();
  await expect(pageIconButton(page)).toBeVisible();
}

async function openPageIconPicker(page) {
  const iconButton = pageIconButton(page);
  await iconButton.click();
  await expect(removeIconButton(page)).toBeVisible();
  return iconButton;
}

async function openCalloutIconPicker(page) {
  const button = page.getByRole("button", { name: "Change callout icon" });
  await button.click();
  await expect(removeIconButton(page)).toBeVisible();
  return button;
}

async function addPageCover(page) {
  await addCoverButton(page).click();
  await expect(changeCoverButton(page)).toBeVisible();
  await expect(page.locator(".osionos-page-cover")).toHaveCount(1);
}

async function openCoverPicker(page) {
  const button = changeCoverButton(page);
  await button.click();
  await expect(page.getByTestId("page-cover-picker")).toBeVisible();
  return button;
}

async function pickFirstPanelAsset(panel) {
  const firstAsset = panel.locator('button[title]').first();
  await expect(firstAsset).toBeVisible();
  await firstAsset.click();
}

export const assetScenarios = [
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page icons",
    "Add icon assigns a page icon when the page starts without one",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await addPageIcon(page);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page icons",
    "clicking the page icon opens the asset picker and Escape closes it",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await addPageIcon(page);
      await openPageIconPicker(page);
      await page.keyboard.press("Escape");
      await expect(removeIconButton(page)).toHaveCount(0);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page icons",
    "selecting an asset updates the page icon immediately",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await addPageIcon(page);
      const iconButton = pageIconButton(page);
      const previousIcon = await iconButton.innerText();
      await openPageIconPicker(page);
      await pickFirstAssetFromVisiblePicker(page);
      await expect(iconButton).not.toContainText(previousIcon);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page icons",
    "clicking outside the page icon picker closes it",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await addPageIcon(page);
      await openPageIconPicker(page);
      await clickOutside(page);
      await expect(removeIconButton(page)).toHaveCount(0);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page icons",
    "the page icon picker can be reopened after closing it once",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await addPageIcon(page);
      const iconButton = await openPageIconPicker(page);
      await page.keyboard.press("Escape");
      await iconButton.click();
      await expect(removeIconButton(page)).toBeVisible();
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page icons",
    "Remove icon clears the page icon and restores the Add icon action",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await addPageIcon(page);
      const iconButton = await openPageIconPicker(page);
      await removeIconButton(page).click();
      await expect(page.getByRole("button", { name: /Add icon/i })).toBeVisible();
      await expect(iconButton).toHaveCount(0);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page icons",
    "clicking a custom page icon reopens its picker after the icon has already been changed",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await addPageIcon(page);
      const iconButton = await openPageIconPicker(page);
      await pickFirstAssetFromVisiblePicker(page);
      await iconButton.click();
      await expect(removeIconButton(page)).toBeVisible();
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Callout icons",
    "new callout blocks start with the default light bulb icon",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createCallout(page);
      await expect(page.getByRole("button", { name: "Change callout icon" })).toContainText("💡");
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Callout icons",
    "clicking a callout icon opens its picker and Escape closes it",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createCallout(page);
      await openCalloutIconPicker(page);
      await page.keyboard.press("Escape");
      await expect(removeIconButton(page)).toHaveCount(0);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Callout icons",
    "clicking outside the callout icon picker closes it",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createCallout(page);
      await openCalloutIconPicker(page);
      await clickOutside(page);
      await expect(removeIconButton(page)).toHaveCount(0);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Callout icons",
    "selecting an asset updates the callout icon immediately",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createCallout(page);
      const button = page.getByRole("button", { name: "Change callout icon" });
      const previousMarkup = await button.innerHTML();
      await openCalloutIconPicker(page);
      await page.getByRole("button", { name: /^Icons$/ }).click();
      await pickFirstAssetFromVisiblePicker(page);
      expect(await button.innerHTML()).not.toBe(previousMarkup);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Callout icons",
    "the callout icon picker can be reopened after being closed",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createCallout(page);
      const button = await openCalloutIconPicker(page);
      await page.keyboard.press("Escape");
      await button.click();
      await expect(removeIconButton(page)).toBeVisible();
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Callout icons",
    "clicking a custom callout icon reopens its picker after the icon has already changed",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createCallout(page);
      const button = await openCalloutIconPicker(page);
      await pickFirstAssetFromVisiblePicker(page);
      await button.click();
      await expect(removeIconButton(page)).toBeVisible();
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Callout icons",
    "Remove icon resets the callout icon back to the default light bulb",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createCallout(page);
      const button = await openCalloutIconPicker(page);
      await pickFirstAssetFromVisiblePicker(page);
      await button.click();
      await removeIconButton(page).click();
      await expect(button).toContainText("💡");
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page cover",
    "Add cover assigns a cover to a page that starts without one",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await addPageCover(page);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page cover",
    "selecting a cover from the picker updates the page cover immediately",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await addPageCover(page);
      const previousCover = await page.getByTestId("page-cover-media").innerHTML();
      for (let selectableIndex = 0; selectableIndex < 8; selectableIndex += 1) {
        await openCoverPicker(page);
        await pickAssetFromVisiblePicker(page, selectableIndex);
        if ((await page.getByTestId("page-cover-media").innerHTML()) !== previousCover) {
          return;
        }
      }
      expect(await page.getByTestId("page-cover-media").innerHTML()).not.toBe(previousCover);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page cover",
    "clicking Change cover opens the cover picker and outside click closes it",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await addPageCover(page);
      await openCoverPicker(page);
      await clickOutside(page);
      await expect(page.getByTestId("page-cover-picker")).toHaveCount(0);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page cover",
    "pressing Escape closes the cover picker",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await addPageCover(page);
      await openCoverPicker(page);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("page-cover-picker")).toHaveCount(0);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page cover",
    "the cover picker can be reopened after it has been closed",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await addPageCover(page);
      const changeCover = await openCoverPicker(page);
      await page.keyboard.press("Escape");
      await changeCover.click();
      await expect(page.getByTestId("page-cover-picker")).toBeVisible();
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page cover",
    "closing the cover picker without selecting anything keeps the current cover in place",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await addPageCover(page);
      const previousCover = await page.getByTestId("page-cover-media").innerHTML();
      await openCoverPicker(page);
      await page.keyboard.press("Escape");
      expect(await page.getByTestId("page-cover-media").innerHTML()).toBe(previousCover);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page cover",
    "Remove cover clears the current cover and restores Add cover",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await addPageCover(page);
      await removeCoverButton(page).click();
      await expect(addCoverButton(page)).toBeVisible();
      await expect(page.locator(".osionos-page-cover")).toHaveCount(0);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Media blocks",
    "creating an image from an empty paragraph converts the current block without leaving an extra paragraph behind",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createMediaBlock(page, "image");
      await expect(page.locator('button:has-text("Change image")')).toBeVisible();
      await expect(getEditors(page)).toHaveCount(1);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Media blocks",
    "an image block can be created from the slash menu on an empty paragraph",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createMediaBlock(page, "image");
      await expect(page.locator('button:has-text("Change image")')).toBeVisible();
      await expect(page.locator("img").first()).toBeVisible();
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Media blocks",
    "a video block can be created from the slash menu on an empty paragraph",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createMediaBlock(page, "video");
      await expect(page.locator('button:has-text("Change video")')).toBeVisible();
      await expect(page.locator("video")).toHaveCount(1);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Media blocks",
    "an audio block can be created from the slash menu on an empty paragraph",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createMediaBlock(page, "audio");
      await expect(page.locator('button:has-text("Change audio")')).toBeVisible();
      await expect(page.locator("audio")).toHaveCount(1);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Media blocks",
    "a file block can be created from the slash menu on an empty paragraph",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createMediaBlock(page, "file");
      await expect(page.locator('button:has-text("Change file")')).toBeVisible();
      await expect(page.getByRole("link", { name: /Open/i })).toHaveCount(1);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Media blocks",
    "selecting media in a paragraph with existing text inserts a new media block below",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "Paragraph before image");
      await editor.click();
      await page.keyboard.press("Enter");
      const secondEditor = getEditors(page).nth(1);
      await secondEditor.click();
      await page.keyboard.type("/image");
      await page.getByRole("button", { name: /^Image$/i }).click();
      await pickFirstAssetFromVisiblePicker(page);
      await expect(getEditors(page).first()).toHaveText("Paragraph before image");
      await expect(page.locator('button:has-text("Change image")')).toBeVisible();
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Media blocks",
    "changing an image asset updates the image preview without changing block type",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createMediaBlock(page, "image");
      const image = page.locator("img").first();
      const previousSrc = await image.getAttribute("src");
      await page.locator('button:has-text("Change image")').click();
      await pickAssetFromVisiblePicker(page, 1);
      await expect(page.locator('button:has-text("Change image")')).toBeVisible();
      expect(await page.locator("img").first().getAttribute("src")).not.toBe(previousSrc);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Media blocks",
    "pressing Escape closes a media picker without changing the current block",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createMediaBlock(page, "image");
      await page.locator('button:has-text("Change image")').click();
      await expect(mediaBlockPicker(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(mediaBlockPicker(page)).toHaveCount(0);
      await expect(page.locator('button:has-text("Change image")')).toBeVisible();
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Media blocks",
    "clicking outside a media picker closes it without changing the current block",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createMediaBlock(page, "image");
      await page.locator('button:has-text("Change image")').click();
      await expect(mediaBlockPicker(page)).toBeVisible();
      await clickOutside(page);
      await expect(mediaBlockPicker(page)).toHaveCount(0);
      await expect(page.locator('button:has-text("Change image")')).toBeVisible();
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Media blocks",
    "the media caption remains inline-editable and still opens the formatting toolbar on selection",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createMediaBlock(page, "image");
      const caption = getEditors(page).last();
      await clearAndType(caption, "Caption text");
      await selectText(caption, "Caption");
      await expect(toolbarButton(page, "Bold")).toBeVisible();
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Picker panels",
    "cover picker exposes thumbnail and larger selected URLs separately",
    async ({ page, appUrl }) => {
      await openHarnessPage(page, appUrl, "tests/browser/pickableImagePanelHarness.html");
      const expectedImageCount = Number(
        await page.getByTestId("package-image-count").textContent(),
      );
      await expect(
        page.getByTestId("cover-asset-picker").locator('button[title]'),
      ).toHaveCount(expectedImageCount);
      await pickFirstPanelAsset(page.getByTestId("cover-asset-picker"));

      const serialized = await page.getByTestId("cover-serialized").textContent();
      const url = await page.getByTestId("cover-url").textContent();
      const fullUrl = await page.getByTestId("cover-full-url").textContent();
      const previewUrl = await page.getByTestId("cover-preview-url").textContent();
      const thumbnailUrl = await page.getByTestId("cover-thumbnail-url").textContent();

      expect(serialized?.startsWith("url:http")).toBe(true);
      expect(url).toBeTruthy();
      expect(fullUrl).toBeTruthy();
      expect(previewUrl).toBeTruthy();
      expect(thumbnailUrl).toBeTruthy();
      expect(previewUrl).not.toBe(thumbnailUrl);
      expect(fullUrl).not.toBe(thumbnailUrl);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Picker panels",
    "image picker resolves preview and full image URLs independently from the thumbnail",
    async ({ page, appUrl }) => {
      await openHarnessPage(page, appUrl, "tests/browser/pickableImagePanelHarness.html");
      const expectedImageCount = Number(
        await page.getByTestId("package-image-count").textContent(),
      );
      await expect(
        page.getByTestId("image-panel-picker").locator('button[title]'),
      ).toHaveCount(expectedImageCount);
      await pickFirstPanelAsset(page.getByTestId("image-panel-picker"));

      const serialized = await page.getByTestId("image-serialized").textContent();
      const url = await page.getByTestId("image-url").textContent();
      const fullUrl = await page.getByTestId("image-full-url").textContent();
      const previewUrl = await page.getByTestId("image-preview-url").textContent();
      const thumbnailUrl = await page.getByTestId("image-thumbnail-url").textContent();

      expect(serialized?.startsWith("url:http")).toBe(true);
      expect(url).toBeTruthy();
      expect(fullUrl).toBeTruthy();
      expect(previewUrl).toBeTruthy();
      expect(thumbnailUrl).toBeTruthy();
      expect(previewUrl).not.toBe(thumbnailUrl);
      expect(fullUrl).not.toBe(thumbnailUrl);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Picker panels",
    "video picker keeps video source separate from poster and thumbnail",
    async ({ page, appUrl }) => {
      await openHarnessPage(page, appUrl, "tests/browser/pickableImagePanelHarness.html");
      const expectedVideoCount = Number(
        await page.getByTestId("package-video-count").textContent(),
      );
      await expect(
        page.getByTestId("video-panel-picker").locator('button[title]'),
      ).toHaveCount(expectedVideoCount);
      await pickFirstPanelAsset(page.getByTestId("video-panel-picker"));

      const url = await page.getByTestId("video-url").textContent();
      const fullUrl = await page.getByTestId("video-full-url").textContent();
      const thumbnailUrl = await page.getByTestId("video-thumbnail-url").textContent();
      const posterUrl = await page.getByTestId("video-poster-url").textContent();

      expect(url).toContain(".mp4");
      expect(fullUrl).toContain(".mp4");
      expect(thumbnailUrl).toBeTruthy();
      expect(posterUrl).toBeTruthy();
      expect(url).not.toBe(thumbnailUrl);
      expect(fullUrl).not.toBe(posterUrl);
    },
  ),
];
