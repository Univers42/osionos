/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   columnEnterAndBlockChrome.spec.mjs                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Three Notion-parity regressions caught live:
// 1. Enter on an EMPTY block inside a column must stay in the column — the
//    empty-enter outdent path used to lift it out, collapse the whole split,
//    and strand the caret on <body>.
// 2. Clicking the empty space below the last block continues writing (appends
//    or focuses a trailing empty paragraph — never stacks empties).
// 3. A filled media block's drag handle sits at the TOP-left corner — leaf
//    alignment used to snap it to the caption editable at the card's bottom,
//    and a stale [block.id]-only closure kept doing so after /image converted
//    the paragraph in place.

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  openFreshPage,
  slashCommandEntry,
} from "../../browser/core/app.mjs";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAF0lEQVR4nGNgYGD4z0AswKz4PxMDdQAAJfkD/aTv6c8AAAAASUVORK5CYII=";

async function pickSlashEntry(page, label) {
  const entry = slashCommandEntry(page, label).last();
  await entry.waitFor();
  await entry.evaluate((node) => node.click());
}

async function caretHome(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    const editable = active?.closest?.('[contenteditable="true"]') ?? (active?.isContentEditable ? active : null);
    return {
      inEditor: !!editable,
      insideColumn: !!active?.closest?.('[data-block-type="column_list"]'),
    };
  });
}

test("empty Enters inside a column stay in the column", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("/2 columns");
  await pickSlashEntry(page, "2 columns");
  const colEditors = page.locator(
    '[data-block-type="column_list"] [role="textbox"][aria-multiline="true"]',
  );
  await colEditors.first().waitFor();
  await colEditors.first().click();
  await page.keyboard.type("/heading 2");
  await pickSlashEntry(page, "Heading 2");
  await page.waitForTimeout(200);
  await page.keyboard.type("Left title");
  await page.waitForTimeout(120);

  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(180);
    const home = await caretHome(page);
    expect(home.inEditor, `enter#${i + 1} lost the caret`).toBe(true);
    expect(home.insideColumn, `enter#${i + 1} escaped the column`).toBe(true);
  }
  await expect(page.locator('[data-block-type="column_list"]').first()).toBeVisible();
  await page.keyboard.type("still in column");
  await expect(
    page.locator('[data-block-type="column_list"]').first().getByText("still in column"),
  ).toBeVisible();
});

test("clicking below the last block appends once, then focuses", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("only line");
  await page.waitForTimeout(200);
  const zone = page.getByTestId("editor-append-zone");
  await expect(zone).toBeVisible();
  const before = await page.locator(".osionos-page [data-block-id]").count();
  await zone.click({ position: { x: 200, y: 80 } });
  await page.waitForTimeout(250);
  expect(await page.locator(".osionos-page [data-block-id]").count()).toBe(before + 1);
  expect((await caretHome(page)).inEditor).toBe(true);
  await zone.click({ position: { x: 200, y: 80 } });
  await page.waitForTimeout(250);
  expect(await page.locator(".osionos-page [data-block-id]").count()).toBe(before + 1);
});

test("google-images viewer URL is unwrapped to the real image", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("/image");
  await pickSlashEntry(page, "Image");
  await page.waitForTimeout(300);
  await page.getByText("Add an image", { exact: false }).first().click();
  await page.getByText("Link", { exact: true }).first().click();
  const dialogInput = page.locator('input[type="url"]');
  await dialogInput.waitFor();
  const wrapped = `https://www.google.com/imgres?q=x&imgurl=${encodeURIComponent(TINY_PNG)}&imgrefurl=y`;
  await dialogInput.fill(wrapped);
  await page.getByRole("button", { name: /embed image/i }).click();
  await page.waitForTimeout(500);
  const img = page.locator('[data-block-type="image"] img');
  await expect(img.first()).toBeVisible();
  expect(await img.first().getAttribute("src")).toBe(TINY_PNG);
});

test("filled image keeps its drag handle at the top-left corner", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("/image");
  await pickSlashEntry(page, "Image");
  await page.waitForTimeout(300);
  await page.getByText("Add an image", { exact: false }).first().click();
  await page.getByText("Link", { exact: true }).first().click();
  const dialogInput = page.locator('input[type="url"]');
  await dialogInput.waitFor();
  await dialogInput.fill(TINY_PNG);
  await page.getByRole("button", { name: /embed image/i }).click();
  await page.waitForTimeout(500);

  const img = page.locator('[data-block-type="image"] img');
  await expect(img.first()).toBeVisible();
  const article = page
    .locator("article[data-draggable-block-id]")
    .filter({ has: page.locator('[data-block-type="image"]') })
    .first();
  await img.first().hover();
  await page.waitForTimeout(250);
  const info = await article
    .locator('[data-testid="block-drag-handle"]')
    .first()
    .evaluate((h) => {
      const article = h.closest("article");
      return {
        opacity: getComputedStyle(h).opacity,
        inlineTop: h.style.top,
        offsetFromArticleTop:
          h.getBoundingClientRect().top - article.getBoundingClientRect().top,
      };
    });
  expect(info.opacity).toBe("1");
  expect(info.inlineTop, "leaf alignment must not touch media handles").toBe("");
  expect(info.offsetFromArticleTop, "handle must sit at the top edge").toBeLessThan(40);
});
