/* ************************************************************************** */
/*                                                                            */
/*   readmeImageFrame.spec.mjs                                                */
/*                                                                            */
/*   On GitHub a README image has no frame. In the profile README an image    */
/*   block is drawn bare; the same block on an ordinary page keeps its frame. */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="60"><rect width="400" height="60" fill="teal"/></svg>',
).toString("base64");

const frame = (page, scope) => page.evaluate((testId) => {
  const picture = document.querySelector(`[data-testid="${testId}"] [data-testid="media-block-image"]`);
  const style = getComputedStyle(picture);
  return { border: style.borderTopWidth, radius: style.borderTopLeftRadius };
}, scope);

test.describe("profile README image blocks", () => {
  test("drawn without a frame in the README, framed on a normal page", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const mount = await page.evaluateHandle(() => import("/tests/e2e/support/mountReadme.tsx"));
    await page.evaluate(({ module, asset }) => {
      module.mountReadme([{ id: "i1", type: "image", content: "", asset }]);
    }, { module: mount, asset: `data:image/svg+xml;base64,${SVG}` });
    await page.locator('[data-testid="in-readme"] [data-testid="media-block-image"]').waitFor();

    expect(await frame(page, "in-readme")).toEqual({ border: "0px", radius: "0px" });
    expect(await frame(page, "in-page")).toEqual({ border: "1px", radius: "12px" });
  });
});
