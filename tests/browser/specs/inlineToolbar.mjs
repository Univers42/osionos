/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineToolbar.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/27 10:00:24 by rstancu           #+#    #+#             */
/*   Updated: 2026/04/27 10:00:25 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";

import {
  activateFirstEditor,
  choosePaletteColor,
  choosePaletteColorByLabel,
  clearAndType,
  clickOutside,
  createBlockViaSlash,
  editorHtml,
  getCodeTextarea,
  openColorPalette,
  openFreshPage,
  selectText,
  slashMenu,
  setCaretInsideText,
  toolbarButton,
  wrapperCount,
  expectToolbar,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

async function createFormattedParagraph(page, appUrl, text = "alpha beta gamma") {
  await openFreshPage(page, appUrl);
  const editor = await activateFirstEditor(page);
  await clearAndType(editor, text);
  return editor;
}

async function openLinkPicker(page) {
  await toolbarButton(page, "Add link").click();
}

function visibleButtonWithText(page, pattern) {
  return page.getByTestId("inline-page-link-results").getByRole("button", { name: pattern }).first();
}

export const inlineToolbarScenarios = [
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Toolbar visibility",
    "selecting visible text opens the inline toolbar",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "alpha");
      await expectToolbar(page);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Toolbar visibility",
    "selecting text inside a heading also opens the inline toolbar",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "# ");
      await page.keyboard.type("Heading text");
      await selectText(editor, "Heading");
      await expectToolbar(page);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Toolbar visibility",
    "selecting text inside a callout opens the inline toolbar",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "callout", "Callout");
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "Callout text");
      await selectText(editor, "Callout");
      await expectToolbar(page);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Toolbar visibility",
    "placing only the caret keeps the inline toolbar hidden",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await editor.click();
      await expect(toolbarButton(page, "Bold")).toHaveCount(0);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Toolbar visibility",
    "clearing the selection closes the inline toolbar",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "alpha");
      await expectToolbar(page);
      await editor.click();
      await expect(toolbarButton(page, "Bold")).toHaveCount(0);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Toolbar visibility",
    "clicking outside the editor closes the inline toolbar on blur",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "alpha");
      await expectToolbar(page);
      await clickOutside(page);
      await expect(toolbarButton(page, "Bold")).toHaveCount(0);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Toolbar visibility",
    "selecting inside a code block uses the native textarea selection only",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "```typescript ");
      const textarea = getCodeTextarea(page);
      await textarea.waitFor();
      await textarea.fill("const value = 42;");
      await textarea.evaluate((node) => node.setSelectionRange(0, 5));
      await expect(toolbarButton(page, "Bold")).toHaveCount(0);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Color actions",
    "the text color button opens the text color palette",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "alpha");
      await openColorPalette(page, "text");
      await expect(page.locator("text=Text color")).toBeVisible();
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Color actions",
    "the background color button opens the background palette",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "alpha");
      await openColorPalette(page, "background");
      await expect(page.locator("text=Background color")).toBeVisible();
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Color actions",
    "applying text color changes only the selected text",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "alpha");
      await openColorPalette(page, "text");
      await choosePaletteColor(page, 1);
      expect(await wrapperCount(editor, '[data-inline-type="text_color"]')).toBe(1);
      expect(await editorHtml(editor)).toContain("beta gamma");
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Color actions",
    "applying background color changes only the selected text",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "beta");
      await openColorPalette(page, "background");
      await choosePaletteColor(page, 1);
      expect(await wrapperCount(editor, '[data-inline-type="background_color"]')).toBe(1);
      expect(await editorHtml(editor)).toContain("alpha");
      expect(await editorHtml(editor)).toContain("gamma");
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Color actions",
    "text color survives additional typing without stacking wrappers",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl, "alpha beta");
      await selectText(editor, "alpha");
      await openColorPalette(page, "text");
      await choosePaletteColor(page, 1);
      await setCaretInsideText(editor, "alpha", 5);
      await page.keyboard.type("123");
      expect(await wrapperCount(editor, '[data-inline-type="text_color"]')).toBe(1);
      await expect(editor).toContainText("alpha123 beta");
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Color actions",
    "background color survives additional typing without stacking wrappers",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl, "alpha beta");
      await selectText(editor, "alpha");
      await openColorPalette(page, "background");
      await choosePaletteColor(page, 1);
      await setCaretInsideText(editor, "alpha", 5);
      await page.keyboard.type("XYZ");
      expect(await wrapperCount(editor, '[data-inline-type="background_color"]')).toBe(1);
      await expect(editor).toContainText("alphaXYZ beta");
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Color actions",
    "applying the same text color twice removes the text color wrapper",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "alpha");
      await openColorPalette(page, "text");
      const label = await choosePaletteColor(page, 1);
      await selectText(editor, "alpha");
      await openColorPalette(page, "text");
      await choosePaletteColorByLabel(page, label);
      expect(await wrapperCount(editor, '[data-inline-type="text_color"]')).toBe(0);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Color actions",
    "applying the same background color twice removes the background wrapper",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "alpha");
      await openColorPalette(page, "background");
      const label = await choosePaletteColor(page, 1);
      await selectText(editor, "alpha");
      await openColorPalette(page, "background");
      await choosePaletteColorByLabel(page, label);
      expect(await wrapperCount(editor, '[data-inline-type="background_color"]')).toBe(0);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Color actions",
    "background color excludes trailing whitespace from the highlighted wrapper",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl, "alpha beta");
      await selectText(editor, "alpha ");
      await openColorPalette(page, "background");
      await choosePaletteColor(page, 1);
      const highlightedText = await editor.evaluate(
        (node) =>
          node.querySelector('[data-inline-type="background_color"]')?.textContent ?? "",
      );
      expect(highlightedText).toBe("alpha");
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Color actions",
    "text color and background color can coexist with bold and italic while typing",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl, "alpha beta");
      await selectText(editor, "alpha");
      await toolbarButton(page, "Bold").click();
      await selectText(editor, "alpha");
      await toolbarButton(page, "Italic").click();
      await selectText(editor, "alpha");
      await openColorPalette(page, "text");
      await choosePaletteColor(page, 1);
      await selectText(editor, "alpha");
      await openColorPalette(page, "background");
      await choosePaletteColor(page, 1);
      await setCaretInsideText(editor, "alpha", 5);
      await page.keyboard.type("++");
      expect(await wrapperCount(editor, '[data-inline-type="text_color"]')).toBe(1);
      expect(await wrapperCount(editor, '[data-inline-type="background_color"]')).toBe(1);
      expect(await wrapperCount(editor, "strong")).toBeGreaterThan(0);
      expect(await wrapperCount(editor, "em")).toBeGreaterThan(0);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Format actions",
    "the bold button toggles bold on and off",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "alpha");
      await toolbarButton(page, "Bold").click();
      expect(await wrapperCount(editor, "strong")).toBeGreaterThan(0);
      await selectText(editor, "alpha");
      await toolbarButton(page, "Bold").click();
      expect(await wrapperCount(editor, "strong")).toBe(0);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Format actions",
    "the italic button toggles italic on and off",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "beta");
      await toolbarButton(page, "Italic").click();
      expect(await wrapperCount(editor, "em")).toBeGreaterThan(0);
      await selectText(editor, "beta");
      await toolbarButton(page, "Italic").click();
      expect(await wrapperCount(editor, "em")).toBe(0);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Format actions",
    "the strikethrough button toggles strikethrough on and off",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "gamma");
      await toolbarButton(page, "Strikethrough").click();
      expect(await wrapperCount(editor, "del")).toBeGreaterThan(0);
      await selectText(editor, "gamma");
      await toolbarButton(page, "Strikethrough").click();
      expect(await wrapperCount(editor, "del")).toBe(0);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Format actions",
    "bold and italic can coexist on the same selection",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "alpha");
      await toolbarButton(page, "Bold").click();
      await selectText(editor, "alpha");
      await toolbarButton(page, "Italic").click();
      expect(await wrapperCount(editor, "strong")).toBeGreaterThan(0);
      expect(await wrapperCount(editor, "em")).toBeGreaterThan(0);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Format actions",
    "the inline code button wraps the selection as inline code",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "beta");
      await toolbarButton(page, "Inline code").click();
      expect(await wrapperCount(editor, 'code[data-inline-type="code"]')).toBe(1);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Format actions",
    "inline code keeps inherited custom text and background colors",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "beta");
      await toolbarButton(page, "Bold").click();
      await selectText(editor, "beta");
      await openColorPalette(page, "text");
      await choosePaletteColor(page, 1);
      await selectText(editor, "beta");
      await openColorPalette(page, "background");
      await choosePaletteColor(page, 1);
      await selectText(editor, "beta");
      await toolbarButton(page, "Inline code").click();
      const codeStyles = await editor.evaluate((node) => {
        const code = node.querySelector('code[data-inline-type="code"]');
        if (!code) {
          return null;
        }

        const styles = getComputedStyle(code);
        return {
          color: styles.getPropertyValue("--inline-code-color").trim(),
          background: styles.getPropertyValue("--inline-code-background").trim(),
        };
      });
      expect(codeStyles).not.toBeNull();
      expect(codeStyles?.color).not.toBe("");
      expect(codeStyles?.background).not.toBe("");
      expect(await wrapperCount(editor, '[data-inline-type="text_color"]')).toBe(0);
      expect(await wrapperCount(editor, '[data-inline-type="background_color"]')).toBe(0);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Format actions",
    "mixed inline formats remain stable after typing and deleting inside the same region",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl, "alpha beta");
      await selectText(editor, "alpha");
      await toolbarButton(page, "Bold").click();
      await selectText(editor, "alpha");
      await toolbarButton(page, "Italic").click();
      await selectText(editor, "alpha");
      await toolbarButton(page, "Strikethrough").click();
      await selectText(editor, "alpha");
      await openColorPalette(page, "text");
      await choosePaletteColor(page, 1);
      await selectText(editor, "alpha");
      await openColorPalette(page, "background");
      await choosePaletteColor(page, 1);
      await setCaretInsideText(editor, "alpha", 5);
      await page.keyboard.type("12");
      await page.keyboard.press("Backspace");
      expect(await wrapperCount(editor, "strong")).toBeGreaterThan(0);
      expect(await wrapperCount(editor, "em")).toBeGreaterThan(0);
      expect(await wrapperCount(editor, "del")).toBeGreaterThan(0);
      expect(await wrapperCount(editor, '[data-inline-type="text_color"]')).toBe(1);
      expect(await wrapperCount(editor, '[data-inline-type="background_color"]')).toBe(1);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Link and slash actions",
    "the Add link button opens the link type chooser",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "alpha");
      await openLinkPicker(page);
      await expect(page.getByRole("button", { name: /^Web link$/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Page link$/ })).toBeVisible();
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Link and slash actions",
    "a web link can be applied to the selected text",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "alpha");
      await openLinkPicker(page);
      await page.getByRole("button", { name: /^Web link$/ }).click();
      await page.getByRole("textbox", { name: /Web URL/i }).fill("https://example.com");
      await page.getByRole("button", { name: /^Apply$/ }).click();
      const href = await editor.evaluate((node) =>
        node.querySelector("a")?.getAttribute("href"),
      );
      expect(href).toBe("https://example.com");
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Link and slash actions",
    "a page link can be applied from the page picker",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "beta");
      await openLinkPicker(page);
      await page.getByRole("button", { name: /^Page link$/ }).click();
      await visibleButtonWithText(page, /Getting Started/i).click();
      const href = await editor.evaluate((node) =>
        node.querySelector("a")?.getAttribute("href"),
      );
      expect(href?.startsWith("page://")).toBe(true);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Link and slash actions",
    "page link search filters matching results and shows a no-result state",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "beta");
      await openLinkPicker(page);
      await page.getByRole("button", { name: /^Page link$/ }).click();
      const search = page.getByRole("textbox", { name: /Page reference/i });
      await search.fill("Meeting");
      await expect(visibleButtonWithText(page, /Meeting Notes/i)).toBeVisible();
      await search.fill("zzzzzz");
      await expect(page.locator("text=No pages match your search.")).toBeVisible();
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Link and slash actions",
    "pressing Escape closes the link picker without creating a link",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "alpha");
      await openLinkPicker(page);
      await page.getByRole("button", { name: /^Web link$/ }).click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: /^Apply$/ })).toHaveCount(0);
      expect(await wrapperCount(editor, "a")).toBe(0);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Link and slash actions",
    "Cancel closes the link picker without changing the selection",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "alpha");
      await openLinkPicker(page);
      await page.getByRole("button", { name: /^Web link$/ }).click();
      await page.getByRole("button", { name: /^Cancel$/ }).click();
      await expect(page.getByRole("button", { name: /^Apply$/ })).toHaveCount(0);
      expect(await wrapperCount(editor, "a")).toBe(0);
    },
  ),
  defineScenario(
    "11. Inline Text Selection & Formatting Toolbar",
    "Link and slash actions",
    "the slash button closes the toolbar and opens the slash menu",
    async ({ page, appUrl }) => {
      const editor = await createFormattedParagraph(page, appUrl);
      await selectText(editor, "alpha");
      await toolbarButton(page, "Open slash menu").click();
      await expect(slashMenu(page)).toContainText("Heading");
      await expect(toolbarButton(page, "Bold")).toHaveCount(0);
    },
  ),
];
