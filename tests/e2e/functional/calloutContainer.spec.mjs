// Regression for #266: a callout holding blocks has no forced empty text line,
// and an inline database paints no background over whatever holds it.

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";
import { addView, insertInlineDatabase, waitForViewSettled } from "../support/databaseHelpers.mjs";

const TRANSPARENT = "rgba(0, 0, 0, 0)";

test("an empty callout line takes no room once the callout holds a block", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  await activateFirstEditor(page);
  await page.keyboard.type("/callout", { delay: 25 });
  await page.keyboard.press("Enter");
  const line = page.locator('[aria-label$="callout"] [role="textbox"]').first();
  await line.click();
  await page.keyboard.press("Enter");
  await page.keyboard.type("inside", { delay: 25 });

  await expect(page.locator('[aria-label$="callout"] [role="textbox"]')).toHaveCount(2);
  await expect.poll(() => line.evaluate((el) => el.getBoundingClientRect().height)).toBe(0);
});

test("an inline database paints no background of its own", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  await activateFirstEditor(page);
  const block = await insertInlineDatabase(page);
  await addView(block, page, "Gallery");
  await waitForViewSettled(block);
  const body = block.locator(".odb-view-body").first();
  await expect(body).toHaveCSS("background-color", TRANSPARENT);
});
