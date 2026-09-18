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

test("each column has an append zone that adds a block to THAT column", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("/2 columns");
  await pickSlashEntry(page, "2 columns");
  const zones = page.getByTestId("column-append-zone");
  await zones.first().waitFor();
  expect(await zones.count()).toBe(2);
  // Type something in column 2 so its trailing block is non-empty, then use
  // ITS zone: a new paragraph must land inside column 2, focused.
  const colEditors = page.locator(
    '[data-block-type="column_list"] [role="textbox"][aria-multiline="true"]',
  );
  await colEditors.nth(1).click();
  await page.keyboard.type("right content");
  await page.waitForTimeout(200);
  await zones.nth(1).click({ force: true });
  await page.waitForTimeout(250);
  await page.keyboard.type("added below");
  await page.waitForTimeout(150);
  const columnTexts = await page
    .locator('[data-block-type="column_list"] [data-block-type="column"], [data-block-type="column_list"]')
    .first()
    .textContent();
  expect(columnTexts).toContain("added below");
  const home = await caretHome(page);
  expect(home.insideColumn, "new block must live inside the column").toBe(true);
});

test("double-click in the gap between two blocks inserts between them", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("first");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await page.keyboard.type("second");
  await page.waitForTimeout(250);

  const first = page.locator('article[data-block-type="paragraph"]').filter({ hasText: "first" }).first();
  const second = page.locator('article[data-block-type="paragraph"]').filter({ hasText: "second" }).first();
  const r1 = await first.boundingBox();
  const r2 = await second.boundingBox();
  const gapY = (r1.y + r1.height + r2.y) / 2; // the boundary between the two
  await page.mouse.dblclick(r1.x + r1.width / 2, gapY);
  await page.waitForTimeout(250);
  await page.keyboard.type("inserted");
  await page.waitForTimeout(200);

  const order = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".osionos-page article[data-draggable-block-id]"))
      .map((a) => (a.textContent ?? "").trim())
      .filter(Boolean),
  );
  console.log("block order:", JSON.stringify(order));
  const iFirst = order.findIndex((t) => t.includes("first"));
  const iIns = order.findIndex((t) => t.includes("inserted"));
  const iSecond = order.findIndex((t) => t.includes("second"));
  expect(iIns, `order was ${JSON.stringify(order)}`).toBeGreaterThan(iFirst);
  expect(iIns, `order was ${JSON.stringify(order)}`).toBeLessThan(iSecond);
});

test("double-click in a column's gap inserts inside THAT column", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("/2 columns");
  await pickSlashEntry(page, "2 columns");
  const colEditors = page.locator(
    '[data-block-type="column_list"] [role="textbox"][aria-multiline="true"]',
  );
  await colEditors.first().click();
  await page.keyboard.type("top line");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await page.keyboard.type("bottom line");
  await page.waitForTimeout(250);

  const top = page.locator('article[data-block-type="paragraph"]').filter({ hasText: "top line" }).first();
  const bottom = page.locator('article[data-block-type="paragraph"]').filter({ hasText: "bottom line" }).first();
  const r1 = await top.boundingBox();
  const r2 = await bottom.boundingBox();
  await page.mouse.dblclick(r1.x + r1.width / 2, (r1.y + r1.height + r2.y) / 2);
  await page.waitForTimeout(250);
  await page.keyboard.type("mid");
  await page.waitForTimeout(200);

  const home = await caretHome(page);
  expect(home.insideColumn, "insert must land inside the column").toBe(true);
  const colText = await page.locator('[data-block-type="column_list"]').first().textContent();
  expect(colText).toContain("mid");
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

test("Backspace at a heading's start strips the type, then merges upward", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("first line");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  await page.keyboard.type("## Section");
  await page.waitForTimeout(350);

  const headings = page.locator('article[data-block-type^="heading"]');
  await expect(headings.first(), "'## ' should have made a heading").toBeVisible();

  // Caret to the very start of the heading, then Backspace: type is stripped,
  // the text survives as a paragraph.
  await page.keyboard.press("Home");
  await page.waitForTimeout(120);
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(300);
  expect(await headings.count(), "the heading type must be stripped").toBe(0);
  const textNow = await page.locator(".osionos-page").first().textContent();
  expect(textNow).toContain("Section");

  // A second Backspace at start merges the paragraph into the block above.
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(350);
  const merged = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.osionos-page article[data-block-type="paragraph"]'))
      .map((a) => (a.textContent ?? "").trim())
      .filter(Boolean),
  );
  console.log("after merge:", JSON.stringify(merged));
  expect(merged.some((t) => t.includes("first lineSection")), `blocks: ${JSON.stringify(merged)}`).toBe(true);
});

test("Enter at a block's start pushes the whole element down, caret stays put", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("## My heading");
  await page.waitForTimeout(350);
  await expect(page.locator('article[data-block-type^="heading"]').first()).toBeVisible();

  await page.keyboard.press("Home");
  await page.waitForTimeout(120);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(350);

  // The heading (type AND text) must have moved DOWN under a new empty block,
  // and the caret must still be in the heading — typing continues its text.
  await page.keyboard.type("X");
  await page.waitForTimeout(250);
  const blocks = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".osionos-page article[data-draggable-block-id]"))
      .map((a) => ({ type: a.dataset.blockType, text: (a.textContent ?? "").trim() })),
  );
  console.log("enter-at-start:", JSON.stringify(blocks));
  const headingIdx = blocks.findIndex((b) => (b.type ?? "").startsWith("heading"));
  expect(headingIdx, "the heading must survive as a heading").toBeGreaterThan(-1);
  expect(blocks[headingIdx].text, "caret must still be in the heading").toContain("XMy heading");
  expect(headingIdx, "an empty block must sit above it").toBeGreaterThan(0);
  expect(blocks[headingIdx - 1].text, "the block above must be empty").toBe("");
});

test("Enter mid-text splits the block and carries the tail", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("HelloWorld");
  await page.waitForTimeout(250);
  for (let i = 0; i < 5; i += 1) await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(120);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(350);
  const texts = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".osionos-page article[data-draggable-block-id]"))
      .map((a) => (a.textContent ?? "").trim()),
  );
  console.log("enter-mid-text:", JSON.stringify(texts));
  expect(texts).toContain("Hello");
  expect(texts).toContain("World");
});
