import { expect } from "@playwright/test";

import {
  activateFirstEditor,
  clearAndType,
  createCallout,
  createMediaBlock,
  getEditors,
  openFreshPage,
  pickFirstAssetFromVisiblePicker,
  selectText,
  toolbarButton,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

export const assetScenarios = [
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page icons",
    "Add icon assigns a page icon when the page starts without one",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await page.getByRole("button", { name: /Add icon/i }).dispatchEvent("click");
      await expect(page.getByRole("button", { name: "Change page icon" })).toBeVisible();
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page icons",
    "clicking the page icon opens the asset picker and Escape closes it",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await page.getByRole("button", { name: /Add icon/i }).dispatchEvent("click");
      const iconButton = page.getByRole("button", { name: "Change page icon" });
      await iconButton.dispatchEvent("click");
      await expect(page.getByRole("button", { name: /^Remove icon$/ })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: /^Remove icon$/ })).toHaveCount(0);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page icons",
    "selecting an asset updates the page icon immediately",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await page.getByRole("button", { name: /Add icon/i }).dispatchEvent("click");
      const iconButton = page.getByRole("button", { name: "Change page icon" });
      const previousIcon = await iconButton.innerText();
      await iconButton.dispatchEvent("click");
      await pickFirstAssetFromVisiblePicker(page);
      await expect(iconButton).not.toContainText(previousIcon);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page icons",
    "Remove icon clears the page icon and restores the Add icon action",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await page.getByRole("button", { name: /Add icon/i }).dispatchEvent("click");
      const iconButton = page.getByRole("button", { name: "Change page icon" });
      await iconButton.dispatchEvent("click");
      await page.getByRole("button", { name: /^Remove icon$/ }).click();
      await expect(page.getByRole("button", { name: /Add icon/i })).toBeVisible();
      await expect(iconButton).toHaveCount(0);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Callout icons",
    "clicking a callout icon opens its picker and Escape closes it",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createCallout(page);
      const button = page.getByRole("button", { name: "Change callout icon" });
      await button.click({ force: true });
      await expect(page.getByRole("button", { name: /^Remove icon$/ })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: /^Remove icon$/ })).toHaveCount(0);
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
      await button.click({ force: true });
      await page.getByRole("button", { name: /^Icons$/ }).click();
      await pickFirstAssetFromVisiblePicker(page);
      expect(await button.innerHTML()).not.toBe(previousMarkup);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Callout icons",
    "Remove icon resets the callout icon back to the default light bulb",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createCallout(page);
      const button = page.getByRole("button", { name: "Change callout icon" });
      await button.click({ force: true });
      await pickFirstAssetFromVisiblePicker(page);
      await button.click({ force: true });
      await page.getByRole("button", { name: /^Remove icon$/ }).click();
      await expect(button).toContainText("💡");
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page cover",
    "Add cover assigns a cover to a page that starts without one",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await page.getByRole("button", { name: /Add cover/i }).dispatchEvent("click");
      await expect(page.getByRole("button", { name: /Change cover/i })).toBeVisible();
      await expect(page.locator(".notion-page-cover")).toHaveCount(1);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page cover",
    "clicking Change cover opens the cover picker and outside click closes it",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await page.getByRole("button", { name: /Add cover/i }).dispatchEvent("click");
      await page.getByRole("button", { name: /Change cover/i }).dispatchEvent("click");
      await expect(page.locator(".notion-cover-picker")).toHaveCount(1);
      await page.mouse.click(20, 20);
      await expect(page.locator(".notion-cover-picker")).toHaveCount(0);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Page cover",
    "Remove cover clears the current cover and restores Add cover",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await page.getByRole("button", { name: /Add cover/i }).dispatchEvent("click");
      await page.locator(".notion-page-cover button").nth(1).dispatchEvent("click");
      await expect(page.getByRole("button", { name: /Add cover/i })).toBeVisible();
      await expect(page.locator(".notion-page-cover")).toHaveCount(0);
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
];
