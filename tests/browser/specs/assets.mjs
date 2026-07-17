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
  embedMediaViaLink,
  getEditors,
  mediaBlockPicker,
  openFreshPage,
  pickFirstAssetFromVisiblePicker,
  selectSlashMenuEntry,
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

// Callout icons redesigned into a semantic type menu (CalloutTypePicker.tsx):
// the toggle button is now "Change callout type" and opens a menu of presets +
// a "Custom emoji…" item — THAT opens the full asset picker (with "Remove icon").
// Reopening after a close is therefore a two-step click, not one; call
// openCalloutIconPicker(page) again rather than re-clicking a captured button.
async function openCalloutIconPicker(page) {
  const toggle = page.getByRole("button", { name: "Change callout type" });
  await toggle.click();
  await page.getByRole("menuitem", { name: "Custom emoji…" }).click();
  await expect(removeIconButton(page)).toBeVisible();
  return toggle;
}

// "Add cover" now opens a picker first (PageHeader.tsx wires it to
// actions.toggleCoverPicker, not an instant default assignment) — pick the
// first tile to actually assign a cover.
async function addPageCover(page) {
  await addCoverButton(page).click();
  await pickCoverTile(page, 0);
  await expect(changeCoverButton(page)).toBeVisible();
  await expect(page.locator(".osionos-page-cover")).toHaveCount(1);
}

async function openCoverPicker(page) {
  const button = changeCoverButton(page);
  await button.click();
  await expect(page.getByTestId("page-cover-picker")).toBeVisible();
  return button;
}

// The cover picker (CoverAssetPicker.tsx, 2026-07-12 redesign) is a tabbed
// gallery/Unsplash/video/URL/upload/library UI, not the generic title-attribute
// asset grid pickAssetFromVisiblePicker expects — its tiles carry
// data-testid="cover-picker-item" instead (coverPickerTiles.tsx CoverTile).
async function pickCoverTile(page, index = 0) {
  const tile = page.getByTestId("cover-picker-item").nth(index);
  await tile.waitFor();
  await tile.click();
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
    "Expanded catalogs",
    "the emoji tab exposes the full Unicode catalog with group headers",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await addPageIcon(page);
      await openPageIconPicker(page);
      await expect(page.getByTestId("emoji-picker").getByText("Smileys & Emotion")).toBeVisible();
      await page.getByLabel("Search emoji").fill("shaking face");
      await expect(page.getByTitle("shaking face", { exact: true })).toBeVisible();
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Expanded catalogs",
    "the skin-tone selector composes tone variants into grid and picked value",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await addPageIcon(page);
      await openPageIconPicker(page);
      await page.getByRole("button", { name: "Skin tone 5" }).click();
      await page.getByLabel("Search emoji").fill("thumbs up");
      const cell = page.getByTitle("thumbs up", { exact: true }).first();
      await expect(cell).toHaveText("👍🏿");
      await cell.click();
      await expect(pageIconButton(page)).toContainText("👍🏿");
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Expanded catalogs",
    "the icons tab browses the entire lucide set beyond the curated defaults",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await addPageIcon(page);
      await openPageIconPicker(page);
      await page.getByRole("button", { name: /^Icons$/ }).click();
      await expect(page.getByTestId("emoji-picker").getByText(/All icons · \d{4}/)).toBeVisible();
      await page.getByLabel("Search icons").fill("zap");
      await page.getByTitle("zap-off", { exact: true }).click();
      await expect(pageIconButton(page).locator("svg")).toHaveCount(1);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Expanded catalogs",
    "the GIFs tab lists Noto animated emoji and picking one sets an animated icon",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await addPageIcon(page);
      await openPageIconPicker(page);
      await page.getByRole("button", { name: /^GIFs$/ }).click();
      const picker = page.getByTestId("emoji-picker");
      await expect(picker.getByText(/Animated · Noto Emoji · \d{3}/)).toBeVisible();
      await expect(picker.locator('img[src*="notoemoji"]').first()).toBeAttached();
      await pickFirstAssetFromVisiblePicker(page);
      await expect(pageIconButton(page).locator('img[src*="fonts.gstatic.com"]')).toHaveCount(1);
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Callout icons",
    "new callout blocks start with the default light bulb icon",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createCallout(page);
      await expect(page.getByRole("button", { name: "Change callout type" })).toContainText("💡");
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
      const button = page.getByRole("button", { name: "Change callout type" });
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
      await openCalloutIconPicker(page);
      await page.keyboard.press("Escape");
      await openCalloutIconPicker(page);
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
      await openCalloutIconPicker(page);
      await pickFirstAssetFromVisiblePicker(page);
      await openCalloutIconPicker(page);
      await expect(removeIconButton(page)).toBeVisible();
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Callout icons",
    "Remove icon resets the callout icon back to the default Note type",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createCallout(page);
      const button = page.getByRole("button", { name: "Change callout type" });
      await openCalloutIconPicker(page);
      await pickFirstAssetFromVisiblePicker(page);
      await openCalloutIconPicker(page);
      await removeIconButton(page).click();
      // CalloutTypePicker.tsx's custom-emoji "Remove icon" resets to the Note
      // preset (📝) — the semantic system's neutral default — not the block's
      // creation-time light bulb (which only useSlashSelect.ts's plain "Callout"
      // command sets).
      await expect(button).toContainText("📝");
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
        await pickCoverTile(page, selectableIndex);
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
      await expect(page.getByRole("button", { name: "Change image" })).toBeVisible();
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
      await expect(page.getByRole("button", { name: "Change image" })).toBeVisible();
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
      await expect(page.getByRole("button", { name: "Change video" })).toBeVisible();
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
      await expect(page.getByRole("button", { name: "Change audio" })).toBeVisible();
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
      await expect(page.getByRole("button", { name: "Change file" })).toBeVisible();
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
      // A slash entry's accessible name is "Image <description>", not bare "Image" —
      // use the shared entry helper (data-testid + hasText) the rest of the suite uses.
      await selectSlashMenuEntry(page, "Image");
      await page
        .getByTestId("media-block-editor")
        .getByRole("button", { name: /^Add image$/i })
        .click();
      await embedMediaViaLink(page, "image");
      await expect(getEditors(page).first()).toHaveText("Paragraph before image");
      await page.getByTestId("media-block-editor").click();
      await expect(page.getByRole("button", { name: "Change image" })).toBeVisible();
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
      await page.getByRole("button", { name: "Change image" }).click();
      await embedMediaViaLink(page, "image", "https://example.com/fixtures/image-1.png");
      // Picking an asset closes the settings bar by design (MediaBlockEditor.tsx
      // handleSelect → setShowSettings(false)); click the block to bring it back.
      await page.getByTestId("media-block-editor").click();
      await expect(page.getByRole("button", { name: "Change image" })).toBeVisible();
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
      await page.getByRole("button", { name: "Change image" }).click();
      await expect(mediaBlockPicker(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(mediaBlockPicker(page)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Change image" })).toBeVisible();
    },
  ),
  defineScenario(
    "12. Emojis, Icons & Media",
    "Media blocks",
    "clicking outside a media picker closes it without changing the current block",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createMediaBlock(page, "image");
      await page.getByRole("button", { name: "Change image" }).click();
      await expect(mediaBlockPicker(page)).toBeVisible();
      // The media picker is a full-viewport Modal now (Modal.tsx) — the generic
      // clickOutside() helper targets app-shell, which the modal backdrop covers.
      // Click the modal's own backdrop instead (a corner far from the centered dialog).
      await page.mouse.click(4, 4);
      await expect(mediaBlockPicker(page)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Change image" })).toBeVisible();
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
