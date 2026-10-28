/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   markdownVariables.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// `{{NAME}}` variables in the live editor: the source keeps the braces, the reader sees
// the value as an atomic chip, and typing carries on after it. The offline build starts
// with no env.json, so one test creates it from Settings
// (tests/canvas/variables-resolver.test.ts covers definitions, formats and filters).

import { expect, test } from "@playwright/test";

import { activateFirstEditor, createNewWorkspacePage, openFreshPage } from "../../browser/core/app.mjs";
import { openSettings } from "../support/settingsHelpers.mjs";

async function caretBlockText(page) {
  return page.evaluate(() => {
    const sel = globalThis.getSelection();
    const anchor = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
    const el = anchor ? (anchor.nodeType === 1 ? anchor : anchor.parentElement) : null;
    return el?.closest("[data-block-id]")?.textContent?.replaceAll("​", "") ?? null;
  });
}

test.describe("markdown variables", () => {
  test("typing {{TODAY | date:\"yyyy\"}} becomes a chip and the caret stays after it", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type('Year {{TODAY | date:"yyyy"}}');
    const chip = page.locator('span.md-variable[data-inline-type="variable"]').first();
    await expect(chip).toHaveText(/^\d{4}$/);
    await expect(chip).toHaveAttribute("data-var-expr", 'TODAY | date:"yyyy"');
    await expect(chip).toHaveAttribute("contenteditable", "false");
    await page.keyboard.type(" ok");
    await expect.poll(() => caretBlockText(page)).toMatch(/^Year \d{4} ok$/);
  });

  test("an unknown name stays literal text and a code span escapes the syntax", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("a {{NOPE}} b `{{NOW}}` c");
    await expect.poll(() => caretBlockText(page)).toBe("a {{NOPE}} b {{NOW}} c");
    await expect(page.locator("span.md-variable")).toHaveCount(0);
  });

  // The focused block shows its source; the rendered block drops the backslash, no chip.
  test("a backslash before {{ keeps the braces literal", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("x \\{{NOW}} y");
    await expect.poll(() => caretBlockText(page)).toBe("x \\{{NOW}} y");
    await expect(page.locator("span.md-variable")).toHaveCount(0);
    await page.keyboard.press("Enter");
    await page.keyboard.type("next");
    await expect(page.getByText("x {{NOW}} y", { exact: true })).toBeVisible();
    await expect(page.locator("span.md-variable")).toHaveCount(0);
  });

  test("a bad filter renders an error chip naming the problem", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("x {{NOW | shout}}");
    const chip = page.locator("span.md-variable-error").first();
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute("title", /shout/);
  });

  test("Settings creates env.json and its starter values resolve in a page", async ({ page, baseURL }) => {
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await openSettings(page, "General");
    await page.getByRole("button", { name: "Create env.json", exact: true }).click();
    await expect(page.locator(".monaco-editor").first()).toBeVisible();
    await createNewWorkspacePage(page);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("Hi {{COMPANY}}");
    await expect(page.locator('span.md-variable[data-var-expr="COMPANY"]').first()).toHaveText("Acme");
    await page.keyboard.type(" {{CO");
    await expect(page.getByTestId("variable-menu").getByRole("option").first()).toContainText(/COMPANY\s*Acme/);
  });

  test("the {{ menu offers names, then filters after |, and Enter writes the pick", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("Due {{TOD");
    const menu = page.getByTestId("variable-menu");
    const first = menu.getByRole("option").first();
    await expect(first).toContainText("TODAY");
    await expect(first).toContainText("built-in");
    await expect(first).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(menu).toHaveCount(0);
    await expect(page.locator('span.md-variable[data-var-expr="TODAY"]')).toHaveCount(1);

    await page.keyboard.type(" {{PAGE | up");
    await expect(menu.getByRole("option").first()).toContainText("upper");
    await page.keyboard.press("Enter");
    await expect(page.locator('span.md-variable[data-var-expr="PAGE | upper"]')).toHaveCount(1);
  });

  test("Escape closes the {{ menu and keeps what was typed", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("a {{NO");
    const menu = page.getByTestId("variable-menu");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect.poll(() => caretBlockText(page)).toBe("a {{NO");
  });
});
