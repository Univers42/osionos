// The terminal panel takes the code a machine printed, without a trip through Settings.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

test("no node answering: the panel takes the code a machine printed", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  await page.getByRole("button", { name: "Panel", exact: true }).click();
  const field = page.getByLabel("Enter the code it printed");
  await expect(field).toBeInViewport({ timeout: 30_000 });
  const submit = page.getByRole("button", { name: "Continue" });
  await expect(submit).toBeDisabled();
  await field.fill("BCDF-GHJK");
  await expect(submit).toBeEnabled();
});
