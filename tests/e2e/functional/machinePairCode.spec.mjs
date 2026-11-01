// The terminal panel takes the code a machine printed, without a trip through Settings.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

test("no node answering: the panel offers every step and a code field", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  await page.getByRole("button", { name: "Terminal", exact: true }).first().click();
  await page.getByRole("menuitem", { name: /new terminal/i }).first().click();
  const open = page.getByRole("button", { name: "Open terminal" });
  if (await open.isVisible().catch(() => false)) await open.click();
  await page.getByLabel("Enter the code it printed").waitFor({ timeout: 15_000 });
  await expect(page.getByText("install osionos-node (once)")).toBeVisible();
  await page.screenshot({ path: "test-results/evidence/machine-pair-code.png" });
  const submit = page.getByRole("button", { name: "Continue" });
  await expect(submit).toBeDisabled();
  await page.getByLabel("Enter the code it printed").fill("BCDF-GHJK");
  await expect(submit).toBeEnabled();
});
