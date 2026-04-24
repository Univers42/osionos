import { expect } from "@playwright/test";

import {
  activateFirstEditor,
  clearAndType,
  createCodeBlock,
  createParagraphs,
  editorLeft,
  focusTextareaEnd,
  getEditors,
  openFreshPage,
  openSlashMenuFromEditor,
  pressEnter,
  pressTab,
  selectSlashMenuEntry,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

function expectNearlyEqual(left, right, delta = 2) {
  expect(Math.abs(left - right)).toBeLessThanOrEqual(delta);
}

export const indentationScenarios = [
  defineScenario(
    "2. Indentation (Tab / Shift+Tab)",
    "Basic indentation",
    "pressing Tab indents a paragraph under the previous sibling",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Parent", "Child"]);
      const child = getEditors(page).nth(1);
      const before = await editorLeft(child);
      await pressTab(child);
      expect(await editorLeft(child)).toBeGreaterThan(before + 8);
    },
  ),
  defineScenario(
    "2. Indentation (Tab / Shift+Tab)",
    "Basic indentation",
    "pressing Shift+Tab outdents an indented paragraph back to root level",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Parent", "Child"]);
      const child = getEditors(page).nth(1);
      const before = await editorLeft(child);
      await pressTab(child);
      await pressTab(child, { shift: true });
      expectNearlyEqual(await editorLeft(child), before);
    },
  ),
  defineScenario(
    "2. Indentation (Tab / Shift+Tab)",
    "Basic indentation",
    "repeated Tab builds hierarchy one level at a time instead of skipping directly to deep nesting",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["A", "B", "C"]);
      const second = getEditors(page).nth(1);
      const third = getEditors(page).nth(2);
      const rootLeft = await editorLeft(third);

      await pressTab(second);
      await pressTab(third);
      const firstNestedLeft = await editorLeft(third);
      await pressTab(third);
      const secondNestedLeft = await editorLeft(third);

      expect(firstNestedLeft).toBeGreaterThan(rootLeft + 8);
      expect(secondNestedLeft).toBeGreaterThan(firstNestedLeft + 8);
    },
  ),
  defineScenario(
    "2. Indentation (Tab / Shift+Tab)",
    "Basic indentation",
    "Shift+Tab only outdents one level at a time from a deep hierarchy",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["A", "B", "C"]);
      const second = getEditors(page).nth(1);
      const third = getEditors(page).nth(2);
      const rootLeft = await editorLeft(getEditors(page).first());

      await pressTab(second);
      await pressTab(third);
      await pressTab(third);
      const deeplyNestedLeft = await editorLeft(third);

      await pressTab(third, { shift: true });
      const oneLevelOutdentedLeft = await editorLeft(third);

      expect(oneLevelOutdentedLeft).toBeLessThan(deeplyNestedLeft - 8);
      expect(oneLevelOutdentedLeft).toBeGreaterThan(rootLeft + 8);
    },
  ),
  defineScenario(
    "2. Indentation (Tab / Shift+Tab)",
    "Basic indentation",
    "pressing Tab on the first root block does nothing",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "Only block");
      const before = await editorLeft(editor);
      await pressTab(editor);
      expectNearlyEqual(await editorLeft(editor), before);
    },
  ),
  defineScenario(
    "2. Indentation (Tab / Shift+Tab)",
    "Basic indentation",
    "pressing Shift+Tab on a root paragraph does nothing",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "Root block");
      const before = await editorLeft(editor);
      await pressTab(editor, { shift: true });
      expectNearlyEqual(await editorLeft(editor), before);
    },
  ),
  defineScenario(
    "2. Indentation (Tab / Shift+Tab)",
    "Type-specific indentation",
    "a heading can be indented under a paragraph and keeps its heading styling",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Parent", ""]);
      const headingEditor = getEditors(page).nth(1);
      await clearAndType(headingEditor, "# ");
      await page.keyboard.type("Indented heading");
      const before = await editorLeft(headingEditor);
      await pressTab(headingEditor);
      const fontSize = await headingEditor.evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).fontSize),
      );
      expect(await editorLeft(headingEditor)).toBeGreaterThan(before + 8);
      expect(fontSize).toBeGreaterThan(20);
    },
  ),
  defineScenario(
    "2. Indentation (Tab / Shift+Tab)",
    "Type-specific indentation",
    "a paragraph cannot be indented under a heading",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const first = await activateFirstEditor(page);
      await clearAndType(first, "# ");
      await page.keyboard.type("Heading parent");
      await pressEnter(first);
      const child = getEditors(page).nth(1);
      await clearAndType(child, "Paragraph child");
      const before = await editorLeft(child);
      await pressTab(child);
      expectNearlyEqual(await editorLeft(child), before);
    },
  ),
  defineScenario(
    "2. Indentation (Tab / Shift+Tab)",
    "Type-specific indentation",
    "a paragraph cannot be indented under a code block",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Code host", "Paragraph child"]);
      const first = getEditors(page).first();
      await openSlashMenuFromEditor(first, "/code");
      await selectSlashMenuEntry(page, "^Code$");
      const child = getEditors(page).first();
      const before = await editorLeft(child);
      await pressTab(child);
      expectNearlyEqual(await editorLeft(child), before);
    },
  ),
  defineScenario(
    "2. Indentation (Tab / Shift+Tab)",
    "Type-specific indentation",
    "a paragraph cannot be indented under a divider",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Divider host", "Paragraph child"]);
      const first = getEditors(page).first();
      await openSlashMenuFromEditor(first, "/divider");
      await selectSlashMenuEntry(page, "^Divider$");
      const child = getEditors(page).first();
      const before = await editorLeft(child);
      await pressTab(child);
      expectNearlyEqual(await editorLeft(child), before);
    },
  ),
  defineScenario(
    "2. Indentation (Tab / Shift+Tab)",
    "Type-specific indentation",
    "a paragraph can be indented under a callout container",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Container host", "Indented child"]);
      const first = getEditors(page).first();
      const child = getEditors(page).nth(1);
      const before = await editorLeft(child);
      await openSlashMenuFromEditor(first, "/callout");
      await selectSlashMenuEntry(page, "^Callout$");
      await pressTab(child);
      expect(await editorLeft(child)).toBeGreaterThan(before + 8);
      await expect(page.getByRole("button", { name: "Change callout icon" })).toBeVisible();
    },
  ),
  defineScenario(
    "2. Indentation (Tab / Shift+Tab)",
    "Type-specific indentation",
    "a paragraph can be indented under a quote container",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createParagraphs(page, ["Quote host", "Indented child"]);
      const first = getEditors(page).first();
      const child = getEditors(page).nth(1);
      const before = await editorLeft(child);
      await openSlashMenuFromEditor(first, "/quote");
      await selectSlashMenuEntry(page, "^Quote$");
      await pressTab(child);
      expect(await editorLeft(child)).toBeGreaterThan(before + 8);
    },
  ),
  defineScenario(
    "2. Indentation (Tab / Shift+Tab)",
    "Type-specific indentation",
    "pressing Tab inside a code block inserts spaces instead of changing hierarchy",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createCodeBlock(page);
      const textarea = page.locator("textarea");
      await textarea.fill("const value = 1;");
      await focusTextareaEnd(textarea);
      await page.keyboard.press("Tab");
      await expect(textarea).toHaveValue("const value = 1;    ");
      await expect(getEditors(page)).toHaveCount(0);
    },
  ),
];
