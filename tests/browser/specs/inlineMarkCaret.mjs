/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineMarkCaret.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";

import {
  activateFirstEditor,
  clearAndType,
  openFreshPage,
  selectText,
  setCaretInsideText,
  toolbarButton,
  waitForRenderStability,
  wrapperCount,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

export const inlineMarkCaretScenarios = [
  defineScenario(
    "12. Inline mark caret behaviour",
    "ArrowRight",
    "ArrowRight at the end of bold escapes the mark so the next character is unstyled",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "hello world");
      await selectText(editor, "hello");
      await toolbarButton(page, "Bold").click();
      await waitForRenderStability(page);
      await setCaretInsideText(editor, "hello", 5);
      await editor.press("ArrowRight");
      await waitForRenderStability(page);
      await page.keyboard.type("X");
      await waitForRenderStability(page);

      const xInsideBold = await editor.evaluate((node) =>
        [...node.querySelectorAll("strong")].some((s) =>
          s.textContent?.includes("X"),
        ),
      );
      expect(xInsideBold).toBe(false);
      await expect(editor).toContainText("helloX");
      await expect(editor).toContainText("world");
    },
  ),

  defineScenario(
    "12. Inline mark caret behaviour",
    "Empty mark cleanup",
    "Backspacing all text inside a bold mark removes the empty container so the next character is unstyled",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "hi");
      await selectText(editor, "hi");
      await toolbarButton(page, "Bold").click();
      await waitForRenderStability(page);
      await setCaretInsideText(editor, "hi", 2);
      await editor.press("Backspace");
      await editor.press("Backspace");
      await waitForRenderStability(page);
      await page.keyboard.type("X");
      await waitForRenderStability(page);

      expect(await wrapperCount(editor, "strong")).toBe(0);
      await expect(editor).toHaveText("X");
    },
  ),

  defineScenario(
    "12. Inline mark caret behaviour",
    "ArrowRight",
    "Two ArrowRight presses exit nested bold-italic so the next character is unstyled",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "hello world");
      await selectText(editor, "hello");
      await toolbarButton(page, "Bold").click();
      await selectText(editor, "hello");
      await toolbarButton(page, "Italic").click();
      await waitForRenderStability(page);
      await setCaretInsideText(editor, "hello", 5);
      await editor.press("ArrowRight");
      await editor.press("ArrowRight");
      await waitForRenderStability(page);
      await page.keyboard.type("X");
      await waitForRenderStability(page);

      const xInsideBold = await editor.evaluate((node) =>
        [...node.querySelectorAll("strong")].some((s) =>
          s.textContent?.includes("X"),
        ),
      );
      const xInsideItalic = await editor.evaluate((node) =>
        [...node.querySelectorAll("em")].some((s) =>
          s.textContent?.includes("X"),
        ),
      );
      expect(xInsideBold).toBe(false);
      expect(xInsideItalic).toBe(false);
      await expect(editor).toContainText("helloX");
      await expect(editor).toContainText("world");
    },
  ),

  defineScenario(
    "12. Inline mark caret behaviour",
    "Autoformat exit",
    "Completing **bold** by typing lands the caret OUTSIDE the mark so the next character is unstyled (the style never overflows)",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "**bold**");
      await waitForRenderStability(page);
      // Typing the closing delimiter auto-rendered the mark.
      expect(await wrapperCount(editor, "strong")).toBe(1);
      await page.keyboard.type("X");
      await waitForRenderStability(page);

      const xInsideBold = await editor.evaluate((node) =>
        [...node.querySelectorAll("strong")].some((s) =>
          s.textContent?.includes("X"),
        ),
      );
      expect(xInsideBold).toBe(false);
      await expect(editor).toContainText("boldX");
    },
  ),
];
