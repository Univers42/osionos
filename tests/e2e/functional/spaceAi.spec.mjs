/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   spaceAi.spec.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Notion parity: Space on an EMPTY paragraph opens the inline AI prompt instead
// of typing a space. Everywhere else a space stays a space and "# " still turns
// the block into a heading.
//
// The AI group of the slash menu is the pre-existing, runtime witness of
// `isAiConfigured()` (the service URL is a BUILD switch, tests/e2e does not set
// one). So the spec probes it and skips the configured cases in an offline
// build — tests/canvas/space-ai-shortcut.test.ts owns that truth table there.

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage, slashCommandEntry } from "../../browser/core/app.mjs";

/** The AI prompt of the editor. */
function aiPanel(page) {
  return page.getByTestId("ai-inline-panel");
}

/** Clear the focused block (the probe below types into it). */
async function clearEditor(editor) {
  await editor.press("Control+A");
  await editor.press("Backspace");
  await expect(editor).toHaveText("");
}

/**
 * Open a fresh page and answer whether the assistant is configured, using the
 * AI entry of the slash menu — a behaviour that predates this feature.
 */
async function openPageAndProbe(page, baseURL) {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await expect(editor).toHaveText("");

  await page.keyboard.type("/ask");
  const askAi = slashCommandEntry(page, "Ask AI");
  const configured = await askAi
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  await page.keyboard.press("Escape");
  await clearEditor(editor);
  return { editor, configured };
}

test.describe("Space on an empty paragraph", () => {
  test("opens Edit with AI, and Escape closes it back onto the block", async ({ page, baseURL }) => {
    const { editor, configured } = await openPageAndProbe(page, baseURL);
    test.skip(!configured, "the AI service is not configured in this build");

    await editor.click();
    await expect(editor).toHaveText("");
    await expect(editor).toHaveAttribute(
      "data-placeholder",
      "Press 'space' for AI or '/' for commands…",
    );

    await page.keyboard.press("Space");
    await expect(aiPanel(page)).toBeVisible();
    await expect(editor).toHaveText(""); // the prompt took the caret, no space was typed

    // Notion's bar: one line the width of the text column, sitting on the line.
    const prompt = page.getByRole("textbox", { name: "Ask AI anything" });
    await expect(prompt).toHaveAttribute("placeholder", "Edit with AI");
    await expect(aiPanel(page).getByRole("button", { name: "Send" })).toBeDisabled();
    await expect(page.getByTestId("ai-inline-answer")).toHaveCount(0);
    const bar = await aiPanel(page).boundingBox();
    const line = await editor.boundingBox();
    expect(bar.width).toBeGreaterThanOrEqual(line.width);
    expect(Math.abs(bar.y - line.y)).toBeLessThan(12);

    await page.keyboard.press("Escape");
    await expect(aiPanel(page)).toHaveCount(0);
    await expect(editor).toBeFocused();
    await expect(editor).toHaveText("");
  });

  test("without the AI service, still types a space", async ({ page, baseURL }) => {
    const { editor, configured } = await openPageAndProbe(page, baseURL);
    test.skip(configured, "the AI service is configured in this build");

    await editor.click();
    await page.keyboard.press("Space");
    await expect(aiPanel(page)).toHaveCount(0);
    expect(await editor.textContent()).toBe(" ");
  });
});

test.describe("Space elsewhere is unchanged", () => {
  test("a paragraph with text types the space, and opens nothing", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await expect(editor).toHaveText("");

    await page.keyboard.type("hello");
    await page.keyboard.press("Space");

    await expect(aiPanel(page)).toHaveCount(0);
    expect(await editor.textContent()).toBe("hello ");
  });

  test("'# ' still turns the paragraph into a heading", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await expect(editor).toHaveText("");

    await page.keyboard.type("#");
    await page.keyboard.press("Space");
    await expect(page.locator('[data-block-type="heading_1"]').first()).toBeVisible();
    await expect(aiPanel(page)).toHaveCount(0);
  });
});
