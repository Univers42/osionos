/* ************************************************************************** */
/*                                                                            */
/*   blockRenderBoundary.spec.mjs                                             */
/*                                                                            */
/*   One block that throws while rendering shows a fallback; the blocks       */
/*   around it still render, on an ordinary page and in the profile README    */
/*   (ADR 0064 PS3).                                                          */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

test.describe("read-only block error boundary", () => {
  test("a throwing block is contained, its neighbours render", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const mount = await page.evaluateHandle(() => import("/tests/e2e/support/mountReadme.tsx"));
    await page.evaluate((module) => {
      const broken = { id: "b2", type: "paragraph" };
      Object.defineProperty(broken, "content", { get() { throw new Error("bad synced block"); } });
      module.mountReadme([
        { id: "b1", type: "paragraph", content: "before the broken block" },
        broken,
        { id: "b3", type: "paragraph", content: "after the broken block" },
      ]);
    }, mount);

    for (const scope of ["in-readme", "in-page"]) {
      const area = page.getByTestId(scope);
      await expect(area.getByText("before the broken block")).toBeVisible();
      await expect(area.getByText("after the broken block")).toBeVisible();
      await expect(area.getByTestId("block-render-error")).toHaveCount(1);
    }
  });
});
