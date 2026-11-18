/* ************************************************************************** */
/*                                                                            */
/*   markdownPreview.spec.mjs                                                 */
/*                                                                            */
/*   A markdown code block shows its source until the owner switches it to    */
/*   Preview; then the HTML subset is drawn as elements (ADR 0058 U4-2).      */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const SOURCE = '<div align="center"><kbd>Ctrl</kbd></div>';

async function seedMarkdownBlock(page) {
  // Playwright does not await an async predicate: hand it the module instead.
  const storeModule = await page.evaluateHandle(() => import("/src/store/usePageStore.ts"));
  await page.waitForFunction(({ usePageStore }) => Boolean(usePageStore.getState().activePage), storeModule);
  await page.evaluate(({ storeModule: { usePageStore }, content }) => {
    const store = usePageStore.getState();
    store.updatePageContent(store.activePage.id, [{ id: "md", type: "code", language: "markdown", content }]);
  }, { storeModule, content: SOURCE });
  await page.locator('[data-block-id="md"]').waitFor();
}

test.describe("markdown code block preview", () => {
  test("source by default, an element preview after the toggle", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await seedMarkdownBlock(page);
    const block = page.locator('[data-block-id="md"]');

    await expect(block.getByTestId("markdown-preview")).toHaveCount(0);
    await expect(block.locator("textarea")).toHaveValue(SOURCE);

    await block.getByRole("button", { name: "Preview" }).click();
    await expect(block.getByTestId("markdown-preview").locator("kbd")).toHaveText("Ctrl");

    await block.getByRole("button", { name: "Source" }).click();
    await expect(block.getByTestId("markdown-preview")).toHaveCount(0);
  });
});
