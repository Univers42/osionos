/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageExport.spec.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Real-output export verification: every test drives the Export dialog like a
// user, captures the actual browser download, and asserts on the file BYTES
// (markdown text, zip entries, PDF magic). The format × option matrix beyond
// this (media exclusion, database views) is byte-verified in
// tests/canvas/page-export.test.ts.

import fs from "node:fs";
import { expect, test } from "@playwright/test";

import { createParagraphs, openFreshPage } from "../../browser/core/app.mjs";

/** Minimal STORE-zip reader (our writer never compresses). */
function readZipEntries(buffer) {
  const entries = [];
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString("utf8", offset + 30, offset + 30 + nameLength);
    const start = offset + 30 + nameLength + extraLength;
    entries.push({ name, text: buffer.toString("utf8", start, start + size) });
    offset = start + size;
  }
  return entries;
}

async function readDownload(download) {
  const filePath = await download.path();
  return fs.readFileSync(filePath);
}

async function setPageTitle(page, title) {
  const titleBox = page.getByRole("textbox", { name: "Page title" });
  await titleBox.click();
  await titleBox.fill(title);
}

/** A sidebar page-tree row (the tree row's exact class stack, not any .group). */
function treeRow(page, rowTitle) {
  return page.locator(".group.relative.w-full", { hasText: rowTitle }).first();
}

/** Open the Export dialog from the (active) page's sidebar row. */
async function openExportDialog(page, rowTitle) {
  const row = treeRow(page, rowTitle);
  await row.hover();
  await row.getByTitle("Page options").click();
  await page.getByTestId("page-options-export").click();
  await expect(page.getByTestId("export-dialog")).toBeVisible();
}

async function chooseFormat(page, label) {
  await page.getByTestId("export-dialog").getByLabel("Export format").selectOption({ label });
}

async function exportAndDownload(page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-confirm").click(),
  ]);
  return download;
}

async function makeRootPage(page, baseURL) {
  await openFreshPage(page, baseURL);
  await setPageTitle(page, "Export Root");
  await createParagraphs(page, ["Heading One", "hello **bold** world", "second line"]);
}

test.describe("page export", () => {
  test("markdown export downloads the page as a .md file with its content", async ({ page, baseURL }) => {
    await makeRootPage(page, baseURL);
    await openExportDialog(page, "Export Root");

    const download = await exportAndDownload(page);
    expect(download.suggestedFilename()).toBe("Export Root.md");
    const text = (await readDownload(download)).toString("utf8");
    expect(text.startsWith("# Export Root")).toBe(true);
    expect(text).toContain("Heading One");
    // The editor stores bold as [b]…[/b]; export must emit real markdown.
    expect(text).toContain("hello **bold");
    expect(text).not.toContain("[b]");
  });

  test("html export produces a standalone document with rendered inline marks", async ({ page, baseURL }) => {
    await makeRootPage(page, baseURL);
    await openExportDialog(page, "Export Root");
    await chooseFormat(page, "HTML");

    const download = await exportAndDownload(page);
    expect(download.suggestedFilename()).toBe("Export Root.html");
    const html = (await readDownload(download)).toString("utf8");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>Export Root</title>");
    // The editor stored bold as [b]…[/b]; the exported HTML must be a real
    // <strong> element, never the leaked bracket dialect.
    expect(html).toMatch(/<strong>[^<]*bold[^<]*<\/strong>/);
    expect(html).not.toContain("[b]");
  });

  test("pdf export produces real PDF bytes", async ({ page, baseURL }) => {
    await makeRootPage(page, baseURL);
    await openExportDialog(page, "Export Root");
    await chooseFormat(page, "PDF");

    const download = await exportAndDownload(page);
    expect(download.suggestedFilename()).toBe("Export Root.pdf");
    const bytes = await readDownload(download);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(800);
  });

  test("include subpages + folders downloads a zip with a nested tree", async ({ page, baseURL }) => {
    await makeRootPage(page, baseURL);

    // Create a child page from the root row, give it a body, return to root.
    const rootRow = treeRow(page, "Export Root");
    await rootRow.hover();
    await rootRow.getByTitle("Add child page").click();
    await setPageTitle(page, "Child Page");
    await createParagraphs(page, ["child body"]);

    await openExportDialog(page, "Export Root");
    await page.getByRole("switch", { name: "Include subpages" }).click();
    // "Create folders for subpages" defaults ON and is now enabled.
    const download = await exportAndDownload(page);
    expect(download.suggestedFilename()).toBe("Export Root.zip");

    const entries = readZipEntries(await readDownload(download));
    const names = entries.map((entry) => entry.name);
    expect(names).toContain("Export Root.md");
    expect(names).toContain("Export Root/Child Page.md");
    const child = entries.find((entry) => entry.name === "Export Root/Child Page.md");
    expect(child.text).toContain("child body");
  });

  test("include subpages without folders keeps a flat zip", async ({ page, baseURL }) => {
    await makeRootPage(page, baseURL);
    const rootRow = treeRow(page, "Export Root");
    await rootRow.hover();
    await rootRow.getByTitle("Add child page").click();
    await setPageTitle(page, "Child Page");

    await openExportDialog(page, "Export Root");
    await page.getByRole("switch", { name: "Include subpages" }).click();
    await page.getByRole("switch", { name: "Create folders for subpages" }).click();

    const download = await exportAndDownload(page);
    const names = readZipEntries(await readDownload(download)).map((entry) => entry.name);
    expect(names).toEqual(["Export Root.md", "Child Page.md"]);
  });

  test("folders toggle is disabled until subpages are included", async ({ page, baseURL }) => {
    await makeRootPage(page, baseURL);
    await openExportDialog(page, "Export Root");
    const folders = page.getByRole("switch", { name: "Create folders for subpages" });
    await expect(folders).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("switch", { name: "Include subpages" }).click();
    await expect(folders).not.toHaveAttribute("aria-disabled", "true");
  });
});
