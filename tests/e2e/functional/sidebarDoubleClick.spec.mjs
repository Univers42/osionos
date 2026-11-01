// Regression for #273: a double click on the sidebar edge closes and reopens it.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

// The handle has no width of its own: its hit area is a pseudo-element, which only a
// real pointer at those coordinates can reach.
async function dblclickEdge(page, edge) {
  const box = await edge.boundingBox();
  await page.mouse.dblclick(box.x + 2, box.y + box.height / 2);
}

test("double clicking the edge toggles the panel", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const edge = page.getByRole("separator", { name: "Resize sidebar" });
  const panel = page.getByText("Explorer", { exact: true }).first();
  await expect(panel).toBeVisible();
  await dblclickEdge(page, edge);
  await expect(panel).toBeHidden();
  await dblclickEdge(page, edge);
  await expect(panel).toBeVisible();
});
