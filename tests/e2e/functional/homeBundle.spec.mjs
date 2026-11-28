/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homeBundle.spec.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The signed-in home at phone size downloads what it paints. The dashboard page is the editor
// (NotionPage) and shows page icons, so those load; a database below the fold, the database
// state and the emoji data do not, until the block is scrolled near. The same regex matches a
// dev module path (DatabaseBlock.tsx) and a built chunk (DatabaseBlock-<hash>.js).
// Ponytail: the dev server names modules by file, so a chunk renamed by a bundler config change
// would slip past the regex; run the built-chunk list in the S1b report to cross-check.

import { expect, test } from "@playwright/test";

const DEFERRED = /(DatabaseBlock|WorkspaceDatabaseBlock|knownDatabaseState|emojiPickerData)[.-]/;
const DATABASE = /\/DatabaseBlock[.-]/;

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function openHome(page, baseURL) {
  await page.route("**/*", (route) => (route.request().method() === "GET" ? route.fallback() : route.abort()));
  const requested = [];
  page.on("request", (request) => {
    if (/\.(js|mjs|tsx?)(\?|$)/.test(request.url())) requested.push(request.url());
  });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.getByTestId("app-shell").waitFor();
  await page.getByTestId("block-tree-root").first().waitFor();
  await page.waitForTimeout(3000);
  return requested;
}

test("the phone home requests no database, database state or emoji data", async ({ page, baseURL }) => {
  const requested = await openHome(page, baseURL);
  expect(requested.filter((url) => DEFERRED.test(url))).toEqual([]);
});

test("a database block scrolled into view still loads and renders", async ({ page, baseURL }) => {
  const requested = await openHome(page, baseURL);
  const block = page.locator('article[data-block-type="database_inline"]').first();
  await block.scrollIntoViewIfNeeded();
  await expect.poll(() => requested.some((url) => DATABASE.test(url))).toBe(true);
  await expect(block.locator('[aria-hidden="true"][style*="min-height"]')).toHaveCount(0);
  await expect(block).not.toHaveText("");
});
