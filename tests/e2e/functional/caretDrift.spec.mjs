/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   caretDrift.spec.mjs                                :+:      :+:    :+:   */
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
  openFreshPage,
  waitForRenderStability,
} from "../../browser/core/app.mjs";

// Reproduces the reported "cursor drift": when several characters are typed
// quickly, the caret jumps back to the start and characters land out of order.
test.describe("caret drift on fast typing", () => {
  test.describe.configure({ mode: "serial" });

  test("a long string typed fast stays in order", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();

    const text = "The quick brown fox jumps over the lazy dog";
    await page.keyboard.type(text, { delay: 0 });
    await waitForRenderStability(page);

    await expect(editor).toHaveText(text);
  });

  test("typing fast then continuing appends at the end (no jump to start)", async ({
    page,
    baseURL,
  }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();

    await page.keyboard.type("hello", { delay: 0 });
    await waitForRenderStability(page);
    await page.keyboard.type("world", { delay: 0 });
    await waitForRenderStability(page);

    await expect(editor).toHaveText("helloworld");
  });

  // Most aggressive repro: dispatch many characters within a SINGLE synchronous
  // task (what a real fast burst / key-repeat does) before React flushes the
  // draft re-render. execCommand("insertText") fires a native input event per
  // char synchronously, so the DOM gets all chars before the rAF emit/re-render.
  test("a single-frame burst of characters keeps order", async ({
    page,
    baseURL,
  }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();

    await editor.evaluate((node) => {
      node.focus();
      for (const ch of "abcdefghijklmnopqrstuvwxyz") {
        document.execCommand("insertText", false, ch);
      }
    });
    await waitForRenderStability(page);

    await expect(editor).toHaveText("abcdefghijklmnopqrstuvwxyz");
  });

  // The clearest "caret jumps to the first position" repro: insert in the MIDDLE
  // of existing text. A caret reset to 0 lands the new chars at the start.
  test("inserting in the middle keeps the caret in place", async ({
    page,
    baseURL,
  }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("helloworld", { delay: 0 });
    await waitForRenderStability(page);

    // caret after "hello" (offset 5), then type a fast burst
    await editor.press("Home");
    for (let i = 0; i < 5; i += 1) await editor.press("ArrowRight");
    await page.keyboard.type("XYZ", { delay: 0 });
    await waitForRenderStability(page);

    await expect(editor).toHaveText("helloXYZworld");
  });

  // Long CONTINUOUS typing at a human-fast cadence: spans many 250ms idle-commit
  // boundaries WHILE still typing — the window where the committed content prop
  // lags the live DOM and a reactive re-render rewrites the DOM mid-keystroke.
  test("long continuous typing across many commit boundaries stays in order", async ({
    page,
    baseURL,
  }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();

    const text =
      "the quick brown fox jumps over the lazy dog while the caret must stay " +
      "exactly where the typist left it and never ever drift back to the start";
    await page.keyboard.type(text, { delay: 25 });
    await waitForRenderStability(page);

    await expect(editor).toHaveText(text);
  });

  // Cross the 250ms idle-commit boundary: after the draft commits (dirty→false),
  // getDraftSnapshot returns committed content; resuming typing here is the window
  // where a stale content prop is re-applied to the DOM and drifts the caret.
  test("typing across the draft-commit boundary keeps order", async ({
    page,
    baseURL,
  }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("first", { delay: 0 });
    await page.waitForTimeout(350);
    await page.keyboard.type("second", { delay: 0 });
    await waitForRenderStability(page);

    await expect(editor).toHaveText("firstsecond");
  });
});
