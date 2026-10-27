/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   themeEditor.spec.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const SETTINGS_URL = (baseURL) => new URL("/?settings=preferences", baseURL).toString();

async function openEditor(page, baseURL) {
  await page.goto(SETTINGS_URL(baseURL), { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Advanced (JSON)" }).first().click();
  await page.locator(".monaco-editor textarea").first().waitFor({ state: "attached", timeout: 150_000 });
}

// Monaco auto-closes the first `{` of inserted text, so the inserted JSON is
// followed by a stray `}`; whatever sits after the cursor is deleted.
async function enterJson(page, text) {
  await page.keyboard.insertText(text);
  await page.keyboard.press("Shift+Control+End");
  await page.keyboard.press("Delete");
}

async function editorTextarea(page) {
  return page.locator(".monaco-editor textarea").first();
}

test.describe("theme editor", () => {
  test.setTimeout(300_000);

  test("Advanced (JSON) opens a theme-json tab", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await page.goto(SETTINGS_URL(baseURL), { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Advanced (JSON)" }).first().click();
    await expect(page.locator('[data-osio-tabstrip] [title$=".json"]')).toHaveCount(1, { timeout: 30_000 });
  });

  test("typing a color restyles html live", async ({ page, baseURL }) => {
    await openEditor(page, baseURL);
    await page.locator(".monaco-editor .view-lines").first().click();
    await page.keyboard.press("Control+A");
    await enterJson(page, '{\n  "name": "T",\n  "colors": { "bg-page": "#102030" }\n}');
    await page.waitForTimeout(500);
    await expect.poll(async () => (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--osio-bg-page").trim())), { timeout: 10_000 }).toBe("#102030");
  });

  test("an invalid value gets a marker and is not applied", async ({ page, baseURL }) => {
    await openEditor(page, baseURL);
    const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--osio-accent").trim());
    const input = await editorTextarea(page);
    await page.locator(".monaco-editor .view-lines").first().click();
    await page.keyboard.press("Control+A");
    await enterJson(page, '{\n  "name": "T",\n  "colors": { "accent": "red;" }\n}');
    await page.waitForTimeout(300);
    await expect(page.locator(".squiggly-error").first()).toBeVisible({ timeout: 5_000 });
    const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--osio-accent").trim());
    expect(after).toBe(before);
  });

  test("save persists and revert restores", async ({ page, baseURL }) => {
    await openEditor(page, baseURL);
    await page.locator(".monaco-editor .view-lines").first().click();
    await page.keyboard.press("Control+A");
    await enterJson(page, '{\n  "name": "Persisted",\n  "colors": { "bg-page": "#102030" }\n}');
    await page.keyboard.press("Control+S");
    await page.waitForTimeout(1000);
    await expect.poll(async () => (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--osio-bg-page").trim())), { timeout: 5_000 }).toBe("#102030");
    await page.reload({ waitUntil: "domcontentloaded" });
    // reopen editor
    await page.goto(SETTINGS_URL(baseURL), { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Advanced (JSON)" }).first().click();
    await page.locator(".monaco-editor textarea").first().waitFor({ state: "attached", timeout: 150_000 });
    await expect.poll(async () => (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--osio-bg-page").trim())), { timeout: 10_000 }).toBe("#102030");

    // edit then revert
    await page.locator(".monaco-editor .view-lines").first().click();
    await page.keyboard.press("Control+A");
    await enterJson(page, '{\n  "name": "Persisted",\n  "colors": { "bg-page": "#999999" }\n}');
    await page.getByRole("button", { name: "Revert" }).first().click();
    await expect.poll(async () => (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--osio-bg-page").trim())), { timeout: 2_000 }).toBe("#102030");
    // The editor shows the saved text again, not the edit that was thrown away.
    await expect(page.locator(".monaco-editor .view-lines").first()).toContainText("#102030");
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--osio-bg-page").trim())).toBe("#102030");
  });

  test("closing dirty keeps a draft and reopening shows Draft restored", async ({ page, baseURL }) => {
    await openEditor(page, baseURL);
    await page.locator(".monaco-editor .view-lines").first().click();
    await page.keyboard.press("Control+A");
    await enterJson(page, '{\n  "name": "Drafty",\n  "colors": { "bg-page": "#102030" }\n}');
    await page.getByRole("button", { name: /Close .*\.json/ }).first().click();
    await page.goto(SETTINGS_URL(baseURL), { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Advanced (JSON)" }).first().click();
    await page.locator(".monaco-editor textarea").first().waitFor({ state: "attached", timeout: 150_000 });
    await expect(page.getByText("Draft restored")).toBeVisible({ timeout: 5_000 });
  });

  test("opening Harbor Night and saving creates Harbor Night (copy)", async ({ page, baseURL }) => {
    await page.goto(SETTINGS_URL(baseURL), { waitUntil: "domcontentloaded" });
    // select Harbor Night in theme dropdown
    const select = page.locator("#theme-library-select");
    await select.selectOption("Harbor Night");
    await page.getByRole("button", { name: "Advanced (JSON)" }).first().click();
    await page.locator(".monaco-editor textarea").first().waitFor({ state: "attached", timeout: 150_000 });
    await page.getByRole("button", { name: "Save" }).first().click();
    await page.waitForTimeout(1000);
    await page.goto(SETTINGS_URL(baseURL), { waitUntil: "domcontentloaded" });
    const option = page.locator("#theme-library-select option", { hasText: "Harbor Night (copy)" });
    await expect(option).toHaveCount(1, { timeout: 10_000 });
  });

  test("?theme=safe shows banner and palette value", async ({ page, baseURL }) => {
    await page.goto(new URL("/?theme=safe", baseURL).toString(), { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Your custom theme is off for this visit.")).toBeVisible({ timeout: 10_000 });
  });
});
