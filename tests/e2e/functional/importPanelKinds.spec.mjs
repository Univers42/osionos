// #239: the import panel offers only what imports. CSV, PDF and Word were offered and sent to
// /api/imports, which no server mounts, then listed as "completed" with nothing imported.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { openSettings, region } from "../support/settingsHelpers.mjs";

test("a PDF is refused with its reason, and nothing calls /api/imports", async ({ page, baseURL }) => {
  const importCalls = [];
  page.on("request", (request) => { if (request.url().includes("/api/imports")) importCalls.push(request.url()); });
  await openFreshPage(page, baseURL);
  await openSettings(page, "Import");
  for (const kind of ["CSV", "PDF", "Word"]) {
    await expect(region(page).getByRole("button", { name: `Import ${kind} files` })).toBeDisabled();
  }
  await region(page).locator('input[type="file"]').setInputFiles({ name: "report.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n") });
  await expect(page.getByText("report.pdf was not imported")).toBeVisible();
  await expect(page.getByText(/cannot import \.pdf files yet/)).toBeVisible();
  if (process.env.EVIDENCE_DIR) await page.screenshot({ path: `${process.env.EVIDENCE_DIR}/import-pdf-refused.png` });
  await region(page).getByRole("tab", { name: /Completed/ }).click();
  await expect(region(page).getByText("report.pdf")).toHaveCount(0);
  expect(importCalls).toEqual([]);
});
