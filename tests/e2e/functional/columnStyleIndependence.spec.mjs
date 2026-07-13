/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   columnStyleIndependence.spec.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Column styles must stay per-block: coloring a block INSIDE a column may
// never land on the column_list (whole-row tint = "column 2 inherits column
// 1's style"), and turning a styled block into columns moves the style into
// column 1 instead of leaving it on the list.

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  contextMenuItem,
  contextSubMenuItem,
  openBlockContextMenuForEditor,
  openFreshPage,
  slashCommandEntry,
} from "../../browser/core/app.mjs";

const RED_BG = "var(--osio-block-tint-red-bg)";

async function pickSlashEntry(page, label) {
  const entry = slashCommandEntry(page, label).last();
  await entry.waitFor();
  await entry.evaluate((node) => node.click());
}

/** Inline style attr of the [data-block-id] wrapper matching a predicate. */
async function wrapperStyle(page, match) {
  return page.evaluate(({ matchText, matchType }) => {
    const el = Array.from(
      document.querySelectorAll(".osionos-page [data-block-id]"),
    ).find((node) =>
      matchType
        ? node.dataset.blockType === matchType
        : (node.textContent ?? "").includes(matchText) && node.dataset.blockType === "paragraph",
    );
    return el ? (el.getAttribute("style") ?? "") : null;
  }, match);
}

test.describe("column style independence", () => {
  test("coloring a block inside column 1 never tints the column_list", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("/2 columns");
    await pickSlashEntry(page, "2 columns");
    const colEditors = page.locator(
      '[data-block-type="column_list"] [role="textbox"][aria-multiline="true"]',
    );
    await colEditors.first().waitFor();
    await page.keyboard.type("col one text");
    await colEditors.last().click();
    await page.keyboard.type("col two text");

    await openBlockContextMenuForEditor(colEditors.first());
    await contextMenuItem(page, "Color").hover();
    await contextSubMenuItem(page, "Red background").click();

    await expect
      .poll(() => wrapperStyle(page, { matchText: "col one text" }), {
        message: "col 1's block must carry the background",
      })
      .toContain(RED_BG);
    expect(await wrapperStyle(page, { matchType: "column_list" }), "the column_list must stay unstyled").not.toContain(RED_BG);
    expect(await wrapperStyle(page, { matchText: "col two text" }), "col 2 must stay unstyled").not.toContain(RED_BG);
  });

  test("turning a styled block into columns moves the style into column 1", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("styled source block");

    await openBlockContextMenuForEditor(editor);
    await contextMenuItem(page, "Color").hover();
    await contextSubMenuItem(page, "Red background").click();
    await expect
      .poll(() => wrapperStyle(page, { matchText: "styled source block" }))
      .toContain(RED_BG);

    await openBlockContextMenuForEditor(editor);
    await contextMenuItem(page, "Turn into").hover();
    await contextSubMenuItem(page, "3 columns").click();

    const colEditors = page.locator(
      '[data-block-type="column_list"] [role="textbox"][aria-multiline="true"]',
    );
    await expect(colEditors).toHaveCount(3);

    expect(await wrapperStyle(page, { matchType: "column_list" }), "the column_list must not inherit the source style").not.toContain(RED_BG);
    await expect
      .poll(() => wrapperStyle(page, { matchText: "styled source block" }), {
        message: "the styled text lives on inside column 1, style intact",
      })
      .toContain(RED_BG);
  });
});
