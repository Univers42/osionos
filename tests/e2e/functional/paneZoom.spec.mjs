/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   paneZoom.spec.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 02:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 02:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Ctrl +/-/0 and Ctrl+wheel zoom the pane you selected and nothing else. With no
// pane selected the key is left alone, so the browser zooms the whole page as it
// always did. `currentCSSZoom` is the browser's own report of the zoom an element
// renders at, so these read the effect rather than an attribute we set.

import { expect, test } from "@playwright/test";

import { activateFirstEditor, getEditors, openFreshPage, waitForRenderStability } from "../../browser/core/app.mjs";

const panes = (page) => page.locator("[data-osio-pane]");
/** Rendered zoom in percent. `currentCSSZoom` is a 32-bit float (1.1 reads back
 *  as 1.100000023841858), so it is compared as the whole percent the user sees. */
const zoomOf = (locator) => locator.evaluate((element) => Math.round(element.currentCSSZoom * 100));
const resetChip = (pane) => pane.getByRole("button", { name: /^Reset zoom/ });

/** One page open in two side-by-side panes; returns each pane's editor. */
async function splitInTwo(page, baseURL) {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("Text to read at another size in one pane only.");
  await page.locator('button[title="Split right"]').first().click();
  await waitForRenderStability(page);
  await expect(panes(page)).toHaveCount(2);
  return { left: getEditors(page).first(), right: getEditors(page).last() };
}

/** Records whether the app swallowed the latest zoom key or wheel. The shortcut
 *  dispatcher stops propagation of a key it handles, so this listens in the
 *  capture phase on `window` (ahead of every app handler) and reads the verdict
 *  once dispatch is over. Modifier-only keydowns are not zoom gestures. */
async function watchDefaultPrevented(page) {
  await page.evaluate(() => {
    window.__zoomGesture = null;
    const record = (event) => {
      if (!event.ctrlKey || event.key === "Control") return;
      setTimeout(() => { window.__zoomGesture = event.defaultPrevented; });
    };
    window.addEventListener("keydown", record, true);
    window.addEventListener("wheel", record, { capture: true, passive: true });
  });
  return () => page.evaluate(() => window.__zoomGesture);
}

test.describe("pane zoom", () => {
  test("Ctrl+= zooms only the pane the caret is in, and the chip resets it", async ({ page, baseURL }) => {
    const { left, right } = await splitInTwo(page, baseURL);
    const swallowed = await watchDefaultPrevented(page);
    await left.click();

    await page.keyboard.press("Control+=");
    await expect.poll(() => zoomOf(left)).toBe(110);
    expect(await zoomOf(right)).toBe(100);
    await expect.poll(swallowed).toBe(true);
    await expect(resetChip(panes(page).first())).toHaveText("110%");
    await expect(resetChip(panes(page).last())).toHaveCount(0);

    await page.keyboard.press("Control+-");
    await page.keyboard.press("Control+-");
    await expect.poll(() => zoomOf(left)).toBe(90);

    await resetChip(panes(page).first()).click();
    await expect.poll(() => zoomOf(left)).toBe(100);
    await expect(resetChip(panes(page).first())).toHaveCount(0);
  });

  test("Ctrl+0 puts the selected pane back to 100%", async ({ page, baseURL }) => {
    const { left } = await splitInTwo(page, baseURL);
    await left.click();
    await page.keyboard.press("Control+=");
    await page.keyboard.press("Control+=");
    await expect.poll(() => zoomOf(left)).toBe(125);
    await page.keyboard.press("Control+0");
    await expect.poll(() => zoomOf(left)).toBe(100);
  });

  test("with no pane selected the zoom key is left to the browser", async ({ page, baseURL }) => {
    const { left, right } = await splitInTwo(page, baseURL);
    const swallowed = await watchDefaultPrevented(page);
    await left.click();
    // The sidebar is part of the app but not a pane: clicking it deselects.
    await page.getByText("Explorer", { exact: true }).click();

    await page.keyboard.press("Control+=");
    await expect.poll(swallowed).toBe(false);
    expect(await zoomOf(left)).toBe(100);
    expect(await zoomOf(right)).toBe(100);
  });

  test("Ctrl+wheel zooms the pane under the pointer; over the sidebar it is left to the browser", async ({ page, baseURL }) => {
    const { left, right } = await splitInTwo(page, baseURL);
    const swallowed = await watchDefaultPrevented(page);

    await right.hover();
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -120);
    await page.keyboard.up("Control");
    await expect.poll(() => zoomOf(right)).toBe(110);
    expect(await zoomOf(left)).toBe(100);
    await expect.poll(swallowed).toBe(true);
    // Chromium on Linux reports a notch as 53px; it is still one step.
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, 53);
    await page.keyboard.up("Control");
    await expect.poll(() => zoomOf(right)).toBe(100);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -53);
    await page.keyboard.up("Control");
    await expect.poll(() => zoomOf(right)).toBe(110);

    await page.getByText("Explorer", { exact: true }).hover();
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -120);
    await page.keyboard.up("Control");
    await expect.poll(swallowed).toBe(false);
    expect(await zoomOf(right)).toBe(110);
  });

  test("a zoomed pane reflows its text instead of scrolling sideways, and keeps its zoom after a reload", async ({ page, baseURL }) => {
    const { left } = await splitInTwo(page, baseURL);
    await left.click();
    for (let step = 0; step < 4; step += 1) await page.keyboard.press("Control+=");
    await expect.poll(() => zoomOf(left)).toBe(175);
    const fits = await left.evaluate((editor) => {
      const pane = editor.closest("[data-osio-pane]").getBoundingClientRect();
      const box = editor.getBoundingClientRect();
      return box.left >= pane.left && box.right <= pane.right + 1 && editor.scrollWidth <= editor.clientWidth + 1;
    });
    expect(fits).toBe(true);

    await page.reload();
    await expect(panes(page)).toHaveCount(2);
    await expect(resetChip(panes(page).first())).toHaveText("175%");
  });

  test("a surface that takes the wheel for itself keeps it", async ({ page, baseURL }) => {
    const { right } = await splitInTwo(page, baseURL);
    // What a drawing canvas or a diagram does: its own non-passive wheel listener.
    await right.evaluate((element) => element.addEventListener("wheel", (event) => event.preventDefault(), { passive: false }));

    await right.hover();
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -120);
    await page.keyboard.up("Control");
    await waitForRenderStability(page);
    expect(await zoomOf(right)).toBe(100);
  });

  test("splitting a zoomed pane opens the new one at 100%", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.press("Control+=");
    await expect.poll(() => zoomOf(editor)).toBe(110);

    await page.locator('button[title="Split right"]').first().click();
    await expect(panes(page)).toHaveCount(2);
    await expect(resetChip(panes(page).first())).toHaveText("110%");
    await expect(resetChip(panes(page).last())).toHaveCount(0);
    expect(await zoomOf(getEditors(page).last())).toBe(100);
  });

  test("zen mode hides the chip with the tab strip; Ctrl+0 still resets", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.press("Control+=");
    await expect(resetChip(panes(page).first())).toBeVisible();

    await page.keyboard.press("Control+k");
    await page.keyboard.press("Control+z");
    await expect(page.locator('[data-zen="1"]')).toHaveCount(1);
    await expect(resetChip(panes(page).first())).toBeHidden();

    await editor.click();
    await page.keyboard.press("Control+0");
    await expect.poll(() => zoomOf(editor)).toBe(100);
  });

  test("switched off, the zoom keys and the wheel are the browser's again", async ({ page, baseURL }) => {
    await page.addInitScript(() => localStorage.setItem("osio.panezoom", "0"));
    const { left } = await splitInTwo(page, baseURL);
    const swallowed = await watchDefaultPrevented(page);
    await left.click();

    await page.keyboard.press("Control+=");
    await expect.poll(swallowed).toBe(false);
    await page.evaluate(() => { window.__zoomGesture = null; });
    await left.hover();
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -120);
    await page.keyboard.up("Control");
    await expect.poll(swallowed).toBe(false);
    expect(await zoomOf(left)).toBe(100);
    await expect(resetChip(panes(page).first())).toHaveCount(0);
  });
});
