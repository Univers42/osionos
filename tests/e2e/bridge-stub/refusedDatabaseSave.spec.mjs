// #281: a database save the server refuses (the grobase WAF answered 403 from nginx) is told to
// the user, once, and the save keeps being retried. Before, the refusal was swallowed and the
// edits lived only in that browser.

import { expect, test } from "@playwright/test";

import { seedSession } from "../support/bridgeSession.mjs";
import { stubBridge } from "../support/bridgeStub.mjs";
import { fillCell, insertInlineDatabase } from "../support/databaseHelpers.mjs";

test("a database the server refuses to save shows one toast and keeps retrying", async ({ page, baseURL }) => {
  const posts = [];
  await stubBridge(page, (url, request) => {
    if (url.pathname === "/api/object-databases" && request.method() === "GET") return { json: { databases: [] } };
    if (url.pathname === "/api/object-databases" && request.method() === "POST") {
      posts.push(Date.now());
      return { status: 403, json: { message: "BaaS request failed with 403: nginx" } };
    }
    if (url.pathname === "/api/pages/all") return { json: [] };
    return { json: {} };
  });
  // A bridge session present at boot: database sync starts only with a session token.
  await seedSession(page, {});
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  const block = await insertInlineDatabase(page);
  // A fresh database is a pristine placeholder and is never pushed; one edit makes it dirty.
  await fillCell(page, block, 0, 0, "Do this on evaluation day.");

  const toast = page.getByText(/was not saved/);
  await expect(toast).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/kept in this browser only/)).toBeVisible();
  expect(posts.length).toBeGreaterThan(0);
  await expect(toast).toHaveCount(1);
});
