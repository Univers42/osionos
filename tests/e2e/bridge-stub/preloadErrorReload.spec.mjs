// R-BR5: `vite:preloadError` (src/app/main.tsx) reloads the page to pick up a redeployed build. Firefox
// and WebKit also fire it for lazy imports they cancel when a navigation starts, and that reload
// aborts the navigation. Spec: docs/superpowers/specs/2026-11-18-preload-error-reload-navigation-design.md.
// S1 is RED on Firefox and WebKit today (Chromium fires no such event, so it passes there trivially);
// S2 and S3 pin behaviour the fix must keep.

import { expect, test } from "@playwright/test";

import { seedSession } from "../support/bridgeSession.mjs";
import { stubBridge } from "../support/bridgeStub.mjs";

const LAZY_BOOT_CHUNK = /\/assets\/Workbench-[^/]+\.js/;

/** Every main-frame document request, in order: a reload shows up as one more entry. */
function recordDocumentRequests(page) {
  const documents = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(new URL(request.url()).search || "/");
  });
  return documents;
}

async function openApp(page) {
  await stubBridge(page, () => ({ json: {} }));
  await seedSession(page, {});
}

/** The boot chunk answers 404 until `reloads` extra documents were requested, like a host that has
 *  redeployed. A fresh document then names the chunk differently (a new hash): WebKit keeps a failed
 *  subresource for the same URL across a reload, so reusing the URL would test the engine's cache. */
async function makeBootChunkStale(page, documents, reloads) {
  await page.route(/\/assets\/[^/]+\.js$/, async (route) => {
    if (documents.length <= reloads) {
      if (!LAZY_BOOT_CHUNK.test(route.request().url())) return route.continue();
      return route.fulfill({ status: 404, contentType: "text/plain", body: "gone" });
    }
    const response = await route.fetch();
    const body = (await response.text()).replaceAll(/(Workbench-[\w-]+\.js)/g, "$1?redeployed");
    return route.fulfill({ response, body });
  });
}

const appIsUp = (page) => expect(page.getByRole("button", { name: "Settings", exact: true }).first()).toBeVisible({ timeout: 20_000 });

test("S1 a navigation started right after boot is not aborted by the preload handler", async ({ page, baseURL }) => {
  const documents = recordDocumentRequests(page);
  await openApp(page);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.goto(`${baseURL}/?second=1`, { waitUntil: "domcontentloaded" });
  await appIsUp(page);
  await page.waitForTimeout(3000);
  expect(documents).toEqual(["/", "?second=1"]);
});

test("S1 an in-page location.assign right after boot is not turned into a reload", async ({ page, baseURL }) => {
  const documents = recordDocumentRequests(page);
  await openApp(page);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => globalThis.location.assign("/?second=1")).catch(() => {});
  await page.waitForURL(/second=1/);
  await appIsUp(page);
  await page.waitForTimeout(3000);
  expect(documents).toEqual(["/", "?second=1"]);
});

test("S2 a stale boot chunk reloads exactly once and the app comes up", async ({ page, baseURL }) => {
  const documents = recordDocumentRequests(page);
  await openApp(page);
  await makeBootChunkStale(page, documents, 1);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await appIsUp(page);
  await page.waitForTimeout(3000);
  expect(documents).toEqual(["/", "/"]);
});

test("S3 a chunk that stays missing reloads once, not in a loop", async ({ page, baseURL }) => {
  const documents = recordDocumentRequests(page);
  await openApp(page);
  await makeBootChunkStale(page, documents, Number.POSITIVE_INFINITY);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  expect(documents).toEqual(["/", "/"]);
});

// Characterises today's behaviour (spec S4): the handler reloads even when the host is unreachable, and
// the reload then lands on the browser's error page. Phase 2 decides whether to keep it.
test("S4 an unreachable host: the handler reloads once anyway (current behaviour)", async ({ page, baseURL }) => {
  const documents = recordDocumentRequests(page);
  await openApp(page);
  let unreachable = false;
  await page.route("**/*", (route) => {
    if (LAZY_BOOT_CHUNK.test(route.request().url())) unreachable = true;
    return unreachable && route.request().url().startsWith(baseURL) ? route.abort("internetdisconnected") : route.fallback();
  });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  expect(documents).toEqual(["/", "/"]);
});
