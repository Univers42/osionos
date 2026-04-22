import { expect } from "@playwright/test";

import { openHarnessPage } from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

export const harnessCoverageScenarios = [
  defineScenario(
    "15. Read-only Rendering",
    "Block rendering",
    "read-only mode renders the main block families correctly",
    async ({ page, appUrl }) => {
      await openHarnessPage(page, appUrl, "tests/browser/readOnlyHarness.html");
      await expect(page.getByRole("heading", { name: "Read-only heading" })).toBeVisible();
      await expect(page.getByText("Read-only paragraph")).toBeVisible();
      await expect(page.getByText("Bullet item")).toBeVisible();
      await expect(page.getByText("Checked todo")).toBeVisible();
      await expect(page.getByText("const value = 1;")).toBeVisible();
      await expect(page.getByText("Cell A1")).toBeVisible();
      await expect(page.locator("hr")).toHaveCount(1);
    },
  ),
  defineScenario(
    "15. Read-only Rendering",
    "Hierarchy and containers",
    "callout and quote children remain rendered inside their read-only containers",
    async ({ page, appUrl }) => {
      await openHarnessPage(page, appUrl, "tests/browser/readOnlyHarness.html");
      await expect(
        page.locator("div").filter({ hasText: "Read-only callout" }).filter({ hasText: "Callout child" }).first(),
      ).toBeVisible();
      await expect(
        page.locator("div").filter({ hasText: "Read-only quote" }).filter({ hasText: "Quote child" }).first(),
      ).toBeVisible();
    },
  ),
  defineScenario(
    "15. Read-only Rendering",
    "Toggle and numbering",
    "read-only toggles still expand or collapse and numbered lists reset by context",
    async ({ page, appUrl }) => {
      await openHarnessPage(page, appUrl, "tests/browser/readOnlyHarness.html");
      await expect(page.getByText("Toggle child")).toHaveCount(0);
      await page.getByRole("button", { name: "Read-only toggle" }).click();
      await expect(page.getByText("Toggle child")).toBeVisible();
      await page.getByRole("button", { name: "Read-only toggle" }).click();
      await expect(page.getByText("Toggle child")).toHaveCount(0);

      const numberedLabels = await page.locator('[data-testid="readonly-root"] .font-medium').evaluateAll(
        (nodes) =>
          nodes
            .map((node) => node.textContent?.trim() ?? "")
            .filter((value) => /^\d+\.$/.test(value)),
      );
      expect(numberedLabels).toEqual(["1.", "2.", "1."]);
    },
  ),
  defineScenario(
    "26. Media blocks",
    "Placeholder rendering",
    "media blocks without an asset show their placeholder preview",
    async ({ page, appUrl }) => {
      await openHarnessPage(page, appUrl, "tests/browser/mediaPlaceholderHarness.html");
      await expect(page.getByText("Select a image")).toBeVisible();
      await expect(page.getByText("Select a video")).toBeVisible();
      await expect(page.getByText("Select a audio")).toBeVisible();
      await expect(page.getByText("Select a file")).toBeVisible();
    },
  ),
];
