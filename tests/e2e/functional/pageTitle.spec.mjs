/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageTitle.spec.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 15:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 15:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The page title is a <textarea> that grows with its text. Two things went wrong
// with it: it measured itself only when its text changed, so a narrower window
// wrapped it onto more lines and the extra ones were clipped; and a click into
// it painted the keyboard-focus box, because a text field always matches
// :focus-visible. Its caret is its focus indicator, like the blocks'.

import { expect, test } from "@playwright/test";

import { clearAndTypePageTitle, openFreshPage, pageTitleEditor } from "../../browser/core/app.mjs";

const LONG_TITLE = "A long page title that keeps going well past the first line of a phone screen";

const clipped = (title) => title.evaluate((el) => el.scrollHeight - el.clientHeight);

test.describe("page title", () => {
  test("a window resized narrower re-measures the title, so no line is clipped", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFreshPage(page, baseURL);
    await clearAndTypePageTitle(page, LONG_TITLE);
    const title = pageTitleEditor(page);
    expect(await clipped(title)).toBe(0);
    const wide = (await title.boundingBox()).height;

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => (await title.boundingBox()).height).toBeGreaterThan(wide);
    expect(await clipped(title)).toBe(0);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(async () => (await title.boundingBox()).height).toBeLessThanOrEqual(wide + 1);
    expect(await clipped(title)).toBe(0);
  });

  test("clicking into the title paints no focus box, and a regular input keeps its ring", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const title = pageTitleEditor(page);
    await title.click();
    await expect(title).toBeFocused();
    expect(await title.evaluate((el) => ({ shadow: getComputedStyle(el).boxShadow, outline: getComputedStyle(el).outlineStyle }))).toEqual({
      shadow: "none",
      outline: "none",
    });

    const search = page.getByTestId("app-topbar").getByRole("combobox");
    await page.keyboard.press("Tab");
    await search.focus();
    const ring = await search.evaluate((el) => ({ shadow: getComputedStyle(el).boxShadow, outline: getComputedStyle(el).outlineStyle }));
    expect(ring.shadow !== "none" || ring.outline !== "none").toBe(true);
  });
});
