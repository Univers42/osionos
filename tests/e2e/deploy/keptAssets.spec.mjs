/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   keptAssets.spec.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #313: a deploy recreated the web container from an image holding only its own build, so a tab
// still open on the previous build got a 404 for the next chunk it lazy-loaded (the palette's
// settingsCommands-*). The fix keeps the last builds' /assets in a volume (groot app.Dockerfile,
// 40-keep-assets.sh) and nginx serves a file this build lacks from there.
// It needs a real deploy, so it runs only under a runner that serves build A on a compose project
// with the kept volume and, when this spec writes `ready` into DEPLOY_SWAP_DIR, recreates the web
// container on build B (`up -d`) and answers `swapped`. Runner and logs: osionos#313.

import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { seedSession } from "../support/bridgeSession.mjs";

const SWAP_DIR = process.env.DEPLOY_SWAP_DIR;

test.skip(!SWAP_DIR, "needs the runner that recreates the web container (DEPLOY_SWAP_DIR)");

// An empty inbox, so the Notifications panel has something to show.
const STUB_ANSWERS = {
  "/api/notifications": { ok: true, items: [] },
  "/api/notifications/inbox": { ok: true, notifyToken: null, unread: 0 },
};

/** Every request to another origin (the bridge the build names) is answered here; nothing leaves.
 *  A WebSocket (the realtime plane) is held open and silent: an image built for production names
 *  the production host, and a refused handshake would be console noise of its own. */
async function stubOtherOrigins(context, baseURL) {
  const own = new URL(baseURL).origin;
  await context.routeWebSocket(() => true, () => {});
  await context.route((url) => url.origin !== own, async (route) => {
    const request = route.request();
    const headers = {
      "access-control-allow-origin": request.headers().origin ?? "*",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    return route.fulfill({ status: 200, headers, json: STUB_ANSWERS[new URL(request.url()).pathname] ?? {} });
  });
}

/** Console errors and warnings, uncaught errors, and main-frame documents, printed as they come
 *  so a failing run's log carries the browser's own text. */
function watchPage(page) {
  const seen = { problems: [], documents: [] };
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    seen.problems.push(`${message.type()}: ${message.text()}`);
    console.log(`[console:${message.type()}] ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    seen.problems.push(`pageerror: ${error.message}`);
    console.log(`[pageerror] ${error.message}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) console.log(`[response] ${response.status()} ${response.url()}`);
  });
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) seen.documents.push(request.url());
  });
  return seen;
}

/** Asks the runner to deploy build B and waits until it has. */
async function deployNextBuild() {
  writeFileSync(path.join(SWAP_DIR, "ready"), "");
  await expect.poll(() => existsSync(path.join(SWAP_DIR, "swapped")), { timeout: 120_000, intervals: [250] }).toBe(true);
}

const servedBuild = (page) => page.evaluate(async () => {
  const html = await (await fetch("/", { cache: "no-store" })).text();
  return /name="osionos-build" content="([^"]*)"/.exec(html)?.[1] ?? "";
});

test("a tab open across a deploy lazy-loads its build's chunks: no console noise, no reload", async ({ page, context, baseURL }) => {
  test.setTimeout(240_000);
  const seen = watchPage(page);
  await stubOtherOrigins(context, baseURL);
  await seedSession(page, {});
  await page.goto(baseURL, { waitUntil: "load" });
  await expect(page.getByRole("tab", { name: "Settings", exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
  const tabBuild = await page.locator('meta[name="osionos-build"]').getAttribute("content");
  const documentsBefore = seen.documents.length;

  await deployNextBuild();
  expect(await servedBuild(page)).not.toBe(tabBuild);

  const palette = page.getByRole("combobox", { name: "Search pages or run a command" });
  await palette.click();
  await palette.fill(">Accessibility");
  await expect(page.getByRole("option", { name: /Settings: Accessibility & voice/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: /^Notifications/ }).click();
  await expect(page.getByText("You're all caught up.")).toBeVisible();
  await page.waitForTimeout(3000);

  expect(seen.problems).toEqual([]);
  expect(seen.documents.slice(documentsBefore)).toEqual([]);
});
