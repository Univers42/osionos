// A live table whose engine is down (production: an Inception mysql mount cut on purpose, the
// data plane answering 502 "Rust data-plane forward failed: timeout of 5000ms") is a state of
// the block, shown in its failure pane, not an app defect: it logged `[object-database] Load
// error` to the console on every mount and retry.

import { expect, test } from "@playwright/test";

import { explorerRow } from "../../browser/core/app.mjs";
import { seedSession } from "../support/bridgeSession.mjs";
import { stubBridge } from "../support/bridgeStub.mjs";

const DB_ID = "5d1bbdb5-f6d2-4d0f-83d0-3758309e20ec";
const DOWN = "Rust data-plane forward failed: timeout of 5000ms";
// The session's workspace (bridgeSession.mjs) holds one page with the mount's table on it.
const PAGE = {
  _id: "6a1760000000000000000502", title: "Mount seed", workspaceId: "ws-bridge", ownerId: "user-bridge-spec",
  visibility: "private", collaborators: [], parentPageId: null, databaseId: null, archivedAt: null,
  content: [{ id: "d1", type: "database_inline", content: "", databaseId: `baas:${DB_ID}:showcase` }],
};

test("an unreachable mount shows its failure in the block and logs nothing", async ({ page, baseURL }) => {
  const noise = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") noise.push(`${message.type()}: ${message.text()}`);
  });
  let schemaCalls = 0;
  await stubBridge(page, (url) => {
    if (url.pathname === "/api/pages/all") return { json: [PAGE] };
    if (url.pathname === `/api/pages/${PAGE._id}`) return { json: PAGE };
    if (url.pathname === `/api/databases/${DB_ID}/schema`) {
      schemaCalls += 1;
      return { status: 502, json: { error: DOWN } };
    }
    return undefined;
  });
  // Signed in already: the stub answers no sign-in, and a refused one warns on its own.
  await seedSession(page, {});
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  // The live client reads the app-session JWT; with none it never asks the bridge.
  await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));
  await explorerRow(page, "Mount seed").click();

  const block = page.locator('[data-block-type="database_inline"]');
  const retry = block.getByRole("button", { name: "Retry" });
  await expect(retry).toBeVisible({ timeout: 20_000 });
  await expect(block.getByText(DOWN).first()).toBeVisible();
  const before = schemaCalls;
  await retry.click();
  await expect.poll(() => schemaCalls).toBeGreaterThan(before);
  await expect(retry).toBeVisible();

  // Caveat: Chromium itself reports every 5xx fetch as "Failed to load resource" (the stub
  // answers what it does not know with a 503); that is the browser's network log, not the
  // app's, and no page code can silence it.
  expect(noise.filter((line) => !line.includes("Failed to load resource"))).toEqual([]);
});
