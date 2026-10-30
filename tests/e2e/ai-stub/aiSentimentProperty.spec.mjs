/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiSentimentProperty.spec.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The "AI sentiment" database property in a browser (#74): an AI-filled select whose labels
// come from the service through the kit's autofill host adapter, and only for a workspace that
// opted in (C138). The service is the stub host of PLAYWRIGHT_AI_STUB, answered here.

import { expect, test } from "@playwright/test";

import { dataRows, insertNamedTable } from "../support/databaseHelpers.mjs";

const NAMES = ["Shipped it, the team loved it", "Standup moved to 10:00", "The build broke again"];
const LABELS = ["positive", "neutral", "negative"];

/** Answers the AI host: the opt-in switch and the row labels; returns what was asked. */
async function stubService(page, { enabled, labels }) {
  const settingsReads = [];
  const rowReads = [];
  await page.route("https://ai.invalid/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/sentiment/settings")) {
      settingsReads.push(url.pathname);
      return route.fulfill({ json: { enabled } });
    }
    if (url.pathname === "/api/ai/sentiment/rows") {
      rowReads.push(Object.fromEntries(url.searchParams));
      return route.fulfill({ json: labels });
    }
    return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
  });
  return { settingsReads, rowReads };
}

async function addSentimentColumn(page, block) {
  await block.locator('[aria-label="Add property"]').click();
  await page.getByTestId("add-ai-sentiment").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("property-config-panel")).toHaveCount(0);
  return block.locator("th", { hasText: "Sentiment" });
}

/** The Sentiment cell of each row: the column right after Name. */
const sentimentCells = (block) => dataRows(block).locator("td:nth-child(2)");

test("an opted-in workspace sees each row's AI label as a read-only pill", async ({ page }, testInfo) => {
  const labels = {};
  const { rowReads } = await stubService(page, { enabled: true, labels });
  const block = await insertNamedTable(page, NAMES);
  const ids = await dataRows(block).evaluateAll((rows) => rows.map((row) => row.dataset.pageId));
  ids.forEach((id, index) => { labels[id] = LABELS[index]; });

  await expect(await addSentimentColumn(page, block)).toBeVisible();
  await expect(sentimentCells(block)).toHaveText(LABELS);
  expect(rowReads.length).toBeGreaterThan(0);
  await block.screenshot({ path: testInfo.outputPath("sentiment-on.png") });

  // AI-filled: a click opens no editor, the label is the service's alone.
  await sentimentCells(block).first().click();
  await page.keyboard.press("Enter");
  await expect(sentimentCells(block).first().locator("input, textarea")).toHaveCount(0);
  await expect(sentimentCells(block)).toHaveText(LABELS);
});

test("C138 a workspace that did not opt in shows — and never asks for row labels", async ({ page }, testInfo) => {
  const { settingsReads, rowReads } = await stubService(page, { enabled: false, labels: {} });
  const block = await insertNamedTable(page, NAMES);

  await expect(await addSentimentColumn(page, block)).toBeVisible();
  // The switch was read, so the "—" below is the answer, not a cell still loading.
  await expect.poll(() => settingsReads.length).toBeGreaterThan(0);
  await expect(sentimentCells(block)).toHaveText(["—", "—", "—"]);
  await block.screenshot({ path: testInfo.outputPath("sentiment-off.png") });
  expect(rowReads).toEqual([]);
});
