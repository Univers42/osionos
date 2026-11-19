/* ************************************************************************** */
/*                                                                            */
/*   publicPageContainers.spec.mjs                                            */
/*                                                                            */
/*   The public view contains one throwing block (ADR 0064 PS3, PS42) and    */
/*   draws a published column list with its style (PS39).                     */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

import { publishSnapshot } from "../../../scripts/bridge-publish-snapshot.mjs";
import { OWNER_PAGE } from "../../bridge/fixtures/publishContainersPage.mjs";
import { openFreshPage } from "../../browser/core/app.mjs";

async function mount(page, blocks, containers) {
  const module = await page.evaluateHandle(() => import("/tests/e2e/support/mountPublicArticle.tsx"));
  await page.evaluate(([loaded, list, on]) => loaded.mountPublicArticle(list, on), [module, blocks, containers]);
}

test.describe("public page view", () => {
  test("a throwing block is contained, its neighbours render (PS3)", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const module = await page.evaluateHandle(() => import("/tests/e2e/support/mountPublicArticle.tsx"));
    await page.evaluate((loaded) => {
      const broken = { id: "b2", type: "paragraph" };
      Object.defineProperty(broken, "content", { get() { throw new Error("bad synced block"); } });
      loaded.mountPublicArticle([
        { id: "b1", type: "paragraph", content: "before the broken block" },
        broken,
        { id: "b3", type: "paragraph", content: "after the broken block" },
      ], true);
    }, module);
    const area = page.getByTestId("in-public");
    await expect(area.getByText("before the broken block")).toBeVisible();
    await expect(area.getByText("after the broken block")).toBeVisible();
    await expect(area.getByTestId("block-render-error")).toHaveCount(1);
  });

  test("a published column list renders its columns and its style (PS39)", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    await mount(page, publishSnapshot(OWNER_PAGE, { containers: true }), true);
    const area = page.getByTestId("in-public");
    await expect(area.getByText("Left,")).toBeVisible();
    await expect(area.locator('[data-s-layout="grid"]')).toHaveCount(1);
    await expect(area.locator('[data-s-padding="3"]')).toHaveCount(1);
  });
});
