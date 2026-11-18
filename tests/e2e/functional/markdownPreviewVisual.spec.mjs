/* ************************************************************************** */
/*                                                                            */
/*   markdownPreviewVisual.spec.mjs                                           */
/*                                                                            */
/*   The full GitHub README fixture drawn as a read-only markdown preview at  */
/*   1024 px, in both themes. Screenshots are attached for a human to read;   */
/*   the assertions only pin that the document structure is on the page.      */
/*                                                                            */
/* ************************************************************************** */

import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const README = readFileSync(new URL("../../fixtures/profile/github-readme.md", import.meta.url), "utf8");

for (const theme of ["dark", "light"]) {
  test(`the README preview in the ${theme} theme`, async ({ page, baseURL }, testInfo) => {
    await openFreshPage(page, baseURL);
    await page.evaluate((name) => { document.documentElement.dataset.theme = name; }, theme);
    const mount = await page.evaluateHandle(() => import("/tests/e2e/support/mountPreview.tsx"));
    await page.evaluate(({ module, content }) => module.mountPreview(content, 1024), { module: mount, content: README });

    const preview = page.getByTestId("markdown-preview");
    await expect(preview.locator("table")).toHaveCount(3);
    await expect(preview.locator("details")).not.toHaveCount(0);
    const host = page.locator("#preview-host");
    await host.screenshot({ path: testInfo.outputPath(`preview-${theme}.png`) });
  });
}
