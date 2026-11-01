// Regression for #257: the block menu leaves the block it edits in view.

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";

test("the block menu does not cover the block", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await page.keyboard.type("a line long enough to right click", { delay: 5 });
  await editor.click({ button: "right" });

  const menu = page.getByTestId("block-context-menu");
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  const block = await page.locator("[data-block-id]").first().boundingBox();
  const overlap = Math.min(box.x + box.width, block.x + block.width) - Math.max(box.x, block.x);
  expect(overlap).toBeLessThanOrEqual(0);
});
