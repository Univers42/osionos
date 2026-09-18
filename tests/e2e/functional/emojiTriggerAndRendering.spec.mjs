/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   emojiTriggerAndRendering.spec.mjs                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Emoji regressions found live on the "hello" page:
// 1. A BARE ":" (and ":" at the start of a block) must open the picker — the
//    old rule required >=1 name char, so ":" alone did nothing.
// 2. The page TITLE had no trigger at all (plain <textarea>).
// 3. The catalog ships Unicode 17.0 but the OS emoji font trails it, so
//    16.0/17.0 glyphs painted tofu boxes. The picker must not offer what this
//    device cannot draw.

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";

const PICKER = '[data-testid="title-emoji-picker"], [role="dialog"], [data-testid="emoji-picker"]';

test("a bare ':' opens the picker, including at the start of a block", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type(":");
  await page.waitForTimeout(400);
  expect(await page.locator(PICKER).count(), "bare ':' at block start must open the picker").toBeGreaterThan(0);
  // Typing narrows rather than closing.
  await page.keyboard.type("sm");
  await page.waitForTimeout(300);
  expect(await page.locator(PICKER).count()).toBeGreaterThan(0);
});

test("':' after a space mid-text opens it; a url or time does not", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("meet at 10:30");
  await page.waitForTimeout(350);
  expect(await page.locator(PICKER).count(), "a time must not trigger").toBe(0);
  await page.keyboard.type(" :");
  await page.waitForTimeout(350);
  expect(await page.locator(PICKER).count(), "' :' must trigger").toBeGreaterThan(0);
});

test("the page title supports ':' emoji insertion", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const title = page.getByLabel("Page title");
  await title.click();
  await title.fill("Trip");
  await title.press("End");
  await page.keyboard.type(" :");
  await page.waitForTimeout(500);
  const picker = page.locator('[data-testid="title-emoji-picker"]');
  await expect(picker, "the title must open the shared picker").toBeVisible();
  // Pick the first emoji offered and confirm it lands in the title text.
  const firstEmoji = picker.locator("button").filter({ hasNotText: /^$/ }).first();
  await firstEmoji.click();
  await page.waitForTimeout(400);
  const value = await title.inputValue();
  console.log("title after emoji pick:", JSON.stringify(value));
  expect(value.startsWith("Trip "), `title was ${JSON.stringify(value)}`).toBe(true);
  expect(value.includes(":"), "the trigger colon must be consumed").toBe(false);
  expect(value.length).toBeGreaterThan("Trip ".length);
});

test("the picker offers no glyph this device paints as tofu", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type(":");
  await page.waitForTimeout(900); // let the full catalog chunk load

  const report = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 48; canvas.height = 48;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const font = getComputedStyle(document.body).fontFamily;
    const sig = (t) => {
      ctx.clearRect(0, 0, 48, 48);
      ctx.font = `28px ${font}`;
      ctx.textBaseline = "top";
      ctx.fillText(t, 2, 2);
      const d = ctx.getImageData(0, 0, 48, 48).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i+1]*3 + d[i+2]*7 + d[i+3]*11) >>> 0;
      return h;
    };
    const controls = new Set(["\u{10FFFD}", "\u{0FFFFD}"].map(sig));
    // Sample the emoji the picker is actually showing.
    const shown = Array.from(document.querySelectorAll('[role="dialog"] button, [data-testid="emoji-picker"] button'))
      .map((b) => (b.textContent ?? "").trim())
      .filter((t) => t.length > 0 && t.length <= 8 && /\p{Extended_Pictographic}/u.test(t));
    const tofu = shown.filter((t) => controls.has(sig(t)));
    return { shownCount: shown.length, tofuCount: tofu.length, tofuSample: tofu.slice(0, 5) };
  });
  console.log("picker emoji:", JSON.stringify(report));
  expect(report.shownCount, "the picker should be showing emoji").toBeGreaterThan(10);
  expect(report.tofuCount, `tofu offered: ${JSON.stringify(report.tofuSample)}`).toBe(0);
});
