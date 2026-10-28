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
// the value as an atomic chip, and typing carries on after it. Built-ins only — the
// offline Playwright build has no workspace env.json (tests/canvas/variables-resolver.test.ts
// covers definitions, formats and filters).

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";

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

  test("a bad filter renders an error chip naming the problem", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("x {{NOW | shout}}");
    const chip = page.locator("span.md-variable-error").first();
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute("title", /shout/);
  });
});
