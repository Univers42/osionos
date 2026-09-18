// Scratch: is the rebuilt PageTitle even in the bundle Playwright serves?

import { test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

test("title probe", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const title = page.getByLabel("Page title");
  await title.click();
  await page.keyboard.type("Trip");
  await page.waitForTimeout(200);
  await page.keyboard.type(" :");
  await page.waitForTimeout(600);
  const dom = await page.evaluate(() => {
    const ta = document.querySelector('textarea[name="page-title"]');
    return {
      value: ta?.value,
      // The rewrite wraps the textarea in a relative <div>; the old one did not.
      parentTag: ta?.parentElement?.tagName,
      parentClass: (ta?.parentElement?.className ?? "").toString(),
      pickerInDom: !!document.querySelector('[data-testid="title-emoji-picker"]'),
      anyDialog: document.querySelectorAll('[role="dialog"]').length,
    };
  });
  console.log("TITLE-PROBE:", JSON.stringify(dom, null, 1));
});
