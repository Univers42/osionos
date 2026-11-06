// #239: a zip of Markdown files imports as nested pages, and a relative link between two of its
// files becomes a page mention instead of plain text.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { openSettings, region } from "../support/settingsHelpers.mjs";
import { buildZip } from "../../../src/features/page-export/model/zipWriter.ts";

const text = (value) => new TextEncoder().encode(value);
const ARCHIVE = buildZip([
  { path: "README.md", bytes: text("# Home\n\nRead the [setup guide](guide/setup.md#run) and [the web](https://example.com).\n") },
  { path: "guide/setup.md", bytes: text("# Setup\n\nBack to [home](../README.md).\n") },
]);

function cachedPages(page) {
  return page.evaluate(() => {
    const pages = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith("osio:pages:")) continue;
      const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (Array.isArray(parsed)) pages.push(...parsed);
    }
    return pages.map((entry) => ({ id: entry._id, title: entry.title, text: (entry.content ?? []).map((block) => String(block.content ?? "")).join("\n") }));
  });
}

test("relative .md links in an imported zip become page mentions", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  await openSettings(page, "Import");
  await region(page).locator('input[type="file"]').setInputFiles({ name: "wiki.zip", mimeType: "application/zip", buffer: Buffer.from(ARCHIVE) });

  await expect.poll(async () => {
    const pages = await cachedPages(page);
    const readme = pages.find((entry) => entry.title === "README");
    const setup = pages.find((entry) => entry.title === "setup");
    if (!readme || !setup) return "not imported yet";
    return [readme.text.includes(`[[page:${setup.id}]]`), setup.text.includes(`[[page:${readme.id}]]`), readme.text.includes("the web")];
  }, { timeout: 15_000 }).toEqual([true, true, true]);

  // In the page itself the link reads as the target page, not as the old link text.
  await page.keyboard.press("Escape");
  await page.getByText("README", { exact: true }).first().click();
  const body = page.locator('[contenteditable="true"]').filter({ hasText: "Read the" }).first();
  await expect(body).toContainText("setup");
  await expect(body).not.toContainText("setup guide");
  if (process.env.EVIDENCE_DIR) await page.screenshot({ path: `${process.env.EVIDENCE_DIR}/import-zip-links.png` });
});
