/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   caretVoidBlockNav.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// VOID blocks (divider, media, …) have no caret host: parking focus on them
// loses a race against the previous block's caret-restore (the selection
// never left it), so arrow navigation steps OVER them instead — the caret
// must keep travelling (the club home-page bug: columns whose content
// includes dividers trapped the caret mid-column, arrows then scrolled).

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  openFreshPage,
  slashCommandEntry,
} from "../../browser/core/app.mjs";

async function pickSlashEntry(page, label) {
  const entry = slashCommandEntry(page, label).last();
  await entry.waitFor();
  await entry.evaluate((node) => node.click());
}

/** The [data-block-id] block that owns the live selection caret. */
async function caretBlockText(page) {
  return page.evaluate(() => {
    const sel = globalThis.getSelection();
    const anchor = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
    const el = anchor ? (anchor.nodeType === 1 ? anchor : anchor.parentElement) : null;
    return el?.closest("[data-block-id]")?.textContent ?? null;
  });
}

/**
 * Two columns mirroring the club home page: col 1 = "col one intro" /
 * divider / "col one after divider", col 2 = "col two text".
 */
async function buildColumnsWithDivider(page, baseURL) {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("above the columns");
  await page.keyboard.type("/2 columns");
  await pickSlashEntry(page, "2 columns");

  const colEditors = page.locator(
    '[data-block-type="column_list"] [role="textbox"][aria-multiline="true"]',
  );
  await colEditors.first().waitFor();

  // Column 1: intro, then a second paragraph, then a divider between them.
  await page.keyboard.type("col one intro");
  await page.keyboard.press("Enter");
  await expect(colEditors).toHaveCount(3); // col1 ×2 + col2 ×1
  await page.keyboard.type("col one after divider");

  await page.getByText("col one intro").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(colEditors).toHaveCount(4);
  await page.keyboard.type("/divider");
  await pickSlashEntry(page, "Divider");
  await expect(
    page.locator('[data-block-type="column_list"] [data-block-type="divider"]').first(),
  ).toBeVisible();

  // Column 2 text.
  const col2Editor = colEditors.last();
  await col2Editor.click();
  await page.keyboard.type("col two text");
  await expect(page.getByText("col two text")).toBeVisible();
}

test.describe("caret keeps travelling across void blocks", () => {
  // The [[ page-picker setup is cold-start flaky in full-suite runs (same
  // class as the slash-menu flake) — retry; a real regression fails 3×.
  test.describe.configure({ retries: 2 });

  test("ArrowDown crosses a divider inside a column, then reaches the next column", async ({ page, baseURL }) => {
    await buildColumnsWithDivider(page, baseURL);

    await page.getByText("col one intro").click();
    await page.keyboard.press("End");

    // The divider cannot host a caret — one press steps over it.
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(() => caretBlockText(page), {
        message: "caret must cross the divider to the next text block",
      })
      .toContain("col one after divider");

    // End of column 1 → first block of column 2.
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(() => caretBlockText(page), {
        message: "caret must continue into the second column",
      })
      .toContain("col two text");
  });

  test("ArrowUp crosses a divider inside a column", async ({ page, baseURL }) => {
    await buildColumnsWithDivider(page, baseURL);

    await page.getByText("col one after divider").click();
    await page.keyboard.press("Home");

    await page.keyboard.press("ArrowUp");
    await expect
      .poll(() => caretBlockText(page), {
        message: "caret must cross the divider upwards",
      })
      .toContain("col one intro");
  });

  test("a paragraph holding a tall inline page chip stays exitable", async ({ page, baseURL }) => {
    // The [[page]] chip is taller than the text line: it used to inflate the
    // block's visual-line bounds so caretOnEdgeLine never fired and the caret
    // was pinned inside the block (the club home-page pill rows).
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("first line");
    await page.keyboard.press("Enter");
    await page.keyboard.type("[[");
    await page.getByText("Link to page").waitFor(); // the [[ page selector
    await page.keyboard.press("Enter"); // insert the highlighted page chip
    await expect(page.locator("span[data-page-id]").first()).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Enter");
    await page.keyboard.type("last line");

    // Down through the chip paragraph: in (settle), then out.
    await page.getByText("first line").click();
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(() => caretBlockText(page), { message: "caret must enter the chip paragraph" })
      .not.toContain("first line");
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(() => caretBlockText(page), {
        message: "caret must pass through the chip paragraph downwards",
      })
      .toContain("last line");

    // And back up through it.
    await page.keyboard.press("ArrowUp");
    await expect
      .poll(() => caretBlockText(page), { message: "caret must re-enter the chip paragraph" })
      .not.toContain("last line");
    await page.keyboard.press("ArrowUp");
    await expect
      .poll(() => caretBlockText(page), {
        message: "caret must pass back through the chip paragraph upwards",
      })
      .toContain("first line");
  });

  test("a chip whose trailing space wraps to a phantom line stays exitable", async ({ page, baseURL }) => {
    // In a NARROW column, a page chip fills its line and pushes the trailing
    // space onto a phantom second line with no caret stop: native ArrowDown
    // then silently fails to move, and without the stuck-caret fallback the
    // caret freezes (the club home-page pills inside a 24%-wide column).
    const LONG_TITLE =
      "An extremely long page title that keeps going so the inline chip overfills a narrow column and wraps its trailing space";
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("/2 columns");
    await pickSlashEntry(page, "2 columns");

    const colEditors = page.locator(
      '[data-block-type="column_list"] [role="textbox"][aria-multiline="true"]',
    );
    await colEditors.first().waitFor();
    await page.keyboard.type("start here");
    await page.keyboard.press("Enter");
    await expect(colEditors).toHaveCount(3);
    await page.keyboard.type(`[[${LONG_TITLE}`);
    await page.getByText("Link to page").waitFor();
    await page.keyboard.press("Enter"); // "Create page …" → inserts the chip
    await expect(page.locator("span[data-page-id]").first()).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Enter");
    await expect(colEditors).toHaveCount(4);
    await page.keyboard.type("after the chip");

    await page.getByText("start here").click();
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(() => caretBlockText(page), { message: "caret must enter the long-chip paragraph" })
      .not.toContain("start here");
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(() => caretBlockText(page), {
        message: "caret must escape the long-chip paragraph downwards",
      })
      .toContain("after the chip");
  });
});
