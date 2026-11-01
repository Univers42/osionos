// Regression for #258: the closing backtick ends inline code. The space typed
// after it, and every later character, stays outside the <code> element, in a
// page block and in a callout, at the end of a block and in front of text.

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";

const typing = { delay: 25 };

async function openEmptyBlock(page, baseURL) {
  await openFreshPage(page, baseURL);
  return activateFirstEditor(page);
}

test("the closing backtick ends inline code", async ({ page, baseURL }) => {
  const block = await openEmptyBlock(page, baseURL);
  await page.keyboard.type("`code`", typing);
  await expect(block.locator("code")).toHaveText("code");

  await page.keyboard.type("   after", typing);

  await expect(block.locator("code")).toHaveText("code");
  await expect(block).toHaveText(/^code\s{3}after$/);
});

test("spaces alone after the closing backtick stay outside the code", async ({ page, baseURL }) => {
  const block = await openEmptyBlock(page, baseURL);
  await page.keyboard.type("`code`", typing);
  await page.keyboard.type("   ", typing);
  await expect(block.locator("code")).toHaveText("code");
  await page.keyboard.type("x", typing);
  await expect(block.locator("code")).toHaveText("code");
});

test("the closing backtick ends inline code in a callout", async ({ page, baseURL }) => {
  await openEmptyBlock(page, baseURL);
  await page.keyboard.type("/callout", typing);
  await page.keyboard.press("Enter");
  const block = page.locator('[role="textbox"][aria-multiline="true"]').first();
  await block.click();
  await page.keyboard.type("`code`  after", typing);
  await expect(block.locator("code")).toHaveText("code");
});
