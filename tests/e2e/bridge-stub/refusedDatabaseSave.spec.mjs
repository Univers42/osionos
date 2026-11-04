// #281: a database save the server refuses (the grobase WAF answered 403 from nginx) is told to
// the user, once, and the save keeps being retried. Before, the refusal was swallowed and the
// edits lived only in that browser.

import { expect, test } from "@playwright/test";

import { seedSession } from "../support/bridgeSession.mjs";
import { stubBridge } from "../support/bridgeStub.mjs";
import { fillCell, insertInlineDatabase } from "../support/databaseHelpers.mjs";

test("a database the server refuses to save shows one toast and keeps retrying", async ({ page, baseURL }) => {
  const posts = [];
  // The page the database goes on is created through the bridge once a session exists: a
  // stub that answered `{}` gave the new page no id, so the editor stayed on Home (#292).
  const pages = new Map();
  await stubBridge(page, (url, request) => {
    if (url.pathname === "/api/pages" && request.method() === "POST") {
      const created = { ...request.postDataJSON(), _id: `6a17600000000000000${String(pages.size).padStart(5, "0")}`, archivedAt: null };
      pages.set(created._id, created);
      return { json: created };
    }
    const stored = pages.get(url.pathname.replace("/api/pages/", ""));
    if (stored && request.method() === "GET") return { json: stored };
    if (url.pathname === "/api/object-databases" && request.method() === "GET") return { json: { databases: [] } };
    if (url.pathname === "/api/object-databases" && request.method() === "POST") {
      posts.push(Date.now());
      return { status: 403, json: { message: "BaaS request failed with 403: nginx" } };
    }
    if (url.pathname === "/api/pages/all") return { json: [...pages.values()] };
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
